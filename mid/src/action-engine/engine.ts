import { randomBytes } from "node:crypto";
import { toHex, type Hex, type TransactionReceipt } from "viem";
import { ChainAdapter } from "../chain-adapter/client.js";
import type { AgentActionInput } from "../shared/schemas.js";

const ACTION_TYPE_LOOTBOX_OPEN = 1;
const ACTION_TYPE_DUNGEON_RUN = 2;

export interface DeltaEvent {
  blockNumber: number;
  txHash: string;
  kind: string;
  payload: Record<string, unknown>;
}

export interface EngineResult {
  code: string;
  txHashes: string[];
  deltaEvents: DeltaEvent[];
  details?: Record<string, unknown>;
}

export interface ActionEngineOptions {
  allowDeployerClaims?: boolean;
}

export class ActionEngine {
  private readonly signerAddress: Hex;
  private readonly allowDeployerClaims: boolean;

  public constructor(
    private readonly chain: ChainAdapter,
    options: ActionEngineOptions = {}
  ) {
    if (!chain.account) {
      throw new Error("wallet_client_unavailable");
    }
    this.signerAddress = chain.account.address;
    this.allowDeployerClaims = Boolean(options.allowDeployerClaims);
  }

  public async execute(action: AgentActionInput): Promise<EngineResult> {
    switch (action.type) {
      case "create_character":
        return this.createCharacter(action);
      case "start_dungeon":
        return this.startDungeon(action);
      case "next_room":
        return this.nextRoom(action);
      case "open_lootboxes_max":
        return this.openLootboxesMax(action);
      case "equip_best":
        return this.equipBest(action);
      case "reroll_item":
        return this.rerollItem(action);
      case "forge_set_piece":
        return this.forgeSetPiece(action);
      case "buy_premium_lootboxes":
        return this.buyPremiumLootboxes(action);
      case "finalize_epoch":
        return this.finalizeEpoch(action);
      case "claim_player":
        return this.claimPlayer(action);
      case "claim_deployer":
        return this.claimDeployer(action);
      case "create_trade_offer":
        return this.createTradeOffer(action);
      case "fulfill_trade_offer":
        return this.fulfillTradeOffer(action);
      case "cancel_trade_offer":
        return this.cancelTradeOffer(action);
      case "cancel_expired_trade_offer":
        return this.cancelExpiredTradeOffer(action);
      case "create_rfq":
        return this.createRfq(action);
      case "fill_rfq":
        return this.fillRfq(action);
      case "cancel_rfq":
        return this.cancelRfq(action);
      default:
        return exhaustive(action);
    }
  }

  private async createCharacter(action: Extract<AgentActionInput, { type: "create_character" }>): Promise<EngineResult> {
    const txHash = await this.chain.writeGameWorld("createCharacter", [action.race, action.classType, action.name]);
    const createReceipt = await this.chain.waitForReceipt(txHash);

    const characterCreatedLog = createReceipt.logs
      .map((log) => this.chain.decodeLog(log))
      .find((log) => log?.eventName === "CharacterCreated");
    const characterId =
      characterCreatedLog && typeof characterCreatedLog.args.characterId === "bigint"
        ? Number(characterCreatedLog.args.characterId)
        : null;

    if (characterId === null) {
      return {
        code: "CHARACTER_CREATED",
        txHashes: [txHash],
        deltaEvents: this.toDeltaEvents([createReceipt]),
        details: {
          characterId: null
        }
      };
    }

    const claimTxHash = await this.chain.writeGameWorld("claimFreeLootbox", [BigInt(characterId)]);
    const claimReceipt = await this.chain.waitForReceipt(claimTxHash);
    const openResult = await this.openLootboxesMax({
      type: "open_lootboxes_max",
      characterId,
      tier: 2,
      maxAmount: 1,
      varianceMode: 1
    });
    const equipResult = await this.equipBestForCharacter(characterId, "balanced");

    return {
      code: "CHARACTER_CREATED_READY",
      txHashes: [txHash, claimTxHash, ...openResult.txHashes, ...equipResult.txHashes],
      deltaEvents: [
        ...this.toDeltaEvents([createReceipt, claimReceipt]),
        ...openResult.deltaEvents,
        ...equipResult.deltaEvents
      ],
      details: {
        characterId,
        bootstrap: {
          claimedFreeLootbox: true,
          openedStarterLootbox: openResult.details ?? null,
          equippedStarterGear: equipResult.details ?? null
        }
      }
    };
  }

  private async startDungeon(action: Extract<AgentActionInput, { type: "start_dungeon" }>): Promise<EngineResult> {
    await this.assertCharacterOwner(action.characterId);

    const [runState, equippedSlots, requiredSlots] = await Promise.all([
      this.chain.readGameWorld<
        readonly [boolean, number, number, number, number, number, number, number, number, number]
      >("getRunState", [BigInt(action.characterId)]),
      this.chain.readGameWorld<number>("equippedSlotCount", [BigInt(action.characterId)]),
      this.chain.readGameWorld<number>("requiredEquippedSlots", [action.dungeonLevel])
    ]);

    if (runState[0]) {
      return {
        code: "RUN_ALREADY_ACTIVE",
        txHashes: [],
        deltaEvents: []
      };
    }

    if (equippedSlots < requiredSlots) {
      return {
        code: "INSUFFICIENT_EQUIPPED_SLOTS",
        txHashes: [],
        deltaEvents: [],
        details: {
          equippedSlots,
          requiredSlots,
          recommendation: "equip_best"
        }
      };
    }

    const { commitTxHash, revealTxHash, receipts, commitId, stageLatencyMs } = await this.commitReveal({
      characterId: action.characterId,
      varianceMode: action.varianceMode,
      actionType: ACTION_TYPE_DUNGEON_RUN,
      hashFn: async (secret, nonce) =>
        this.chain.readGameWorld<Hex>("hashDungeonRun", [
          secret,
          this.signerAddress,
          BigInt(action.characterId),
          nonce,
          action.difficulty,
          action.dungeonLevel,
          action.varianceMode
        ]),
      revealFn: (commitId, secret) =>
        this.chain.writeGameWorld("revealStartDungeon", [
          commitId,
          secret,
          action.difficulty,
          action.dungeonLevel,
          action.varianceMode
        ])
    });

    return {
      code: "DUNGEON_STARTED",
      txHashes: [commitTxHash, revealTxHash],
      deltaEvents: this.toDeltaEvents(receipts),
      details: { commitId: commitId.toString(), stageLatencyMs }
    };
  }

  private async nextRoom(action: Extract<AgentActionInput, { type: "next_room" }>): Promise<EngineResult> {
    await this.assertCharacterOwner(action.characterId);

    const runState = await this.chain.readGameWorld<readonly [boolean]>("getRunState", [BigInt(action.characterId)]);
    if (!runState[0]) {
      return {
        code: "RUN_NOT_ACTIVE",
        txHashes: [],
        deltaEvents: []
      };
    }

    if (action.potionChoices && action.abilityChoices && action.potionChoices.length > 1) {
      const txHash = await this.chain.writeGameWorld("resolveRooms", [
        BigInt(action.characterId),
        action.potionChoices,
        action.abilityChoices
      ]);
      const receipt = await this.chain.waitForReceipt(txHash);
      return {
        code: "ROOM_BATCH_RESOLVED",
        txHashes: [txHash],
        deltaEvents: this.toDeltaEvents([receipt]),
        details: { resolvedCount: action.potionChoices.length }
      };
    }

    const txHash = await this.chain.writeGameWorld("resolveNextRoom", [
      BigInt(action.characterId),
      action.potionChoice ?? 0,
      action.abilityChoice ?? 0
    ]);
    const receipt = await this.chain.waitForReceipt(txHash);

    return {
      code: "ROOM_RESOLVED",
      txHashes: [txHash],
      deltaEvents: this.toDeltaEvents([receipt])
    };
  }

  private async openLootboxesMax(
    action: Extract<AgentActionInput, { type: "open_lootboxes_max" }>
  ): Promise<EngineResult> {
    await this.assertCharacterOwner(action.characterId);

    const quote = await this.chain.readGameWorld<readonly [number, number, number, number]>("quoteOpenLootboxes", [
      BigInt(action.characterId),
      action.tier,
      action.maxAmount,
      action.varianceMode
    ]);

    const openableAmount = quote[3];
    if (openableAmount === 0) {
      return {
        code: "NO_OPENABLE_LOOTBOXES",
        txHashes: [],
        deltaEvents: [],
        details: {
          availableTotal: quote[0],
          availableBound: quote[1],
          availableGeneric: quote[2]
        }
      };
    }

    const { commitTxHash, revealTxHash, receipts, commitId, stageLatencyMs } = await this.commitReveal({
      characterId: action.characterId,
      varianceMode: action.varianceMode,
      actionType: ACTION_TYPE_LOOTBOX_OPEN,
      hashFn: async (secret, nonce) =>
        this.chain.readGameWorld<Hex>("hashLootboxOpen", [
          secret,
          this.signerAddress,
          BigInt(action.characterId),
          nonce,
          action.tier,
          action.maxAmount,
          action.varianceMode,
          true
        ]),
      revealFn: (commitId, secret) =>
        this.chain.writeGameWorld("revealOpenLootboxesMax", [
          commitId,
          secret,
          action.tier,
          action.maxAmount,
          action.varianceMode
        ])
    });

    const openMaxLog = receipts
      .flatMap((receipt) => receipt.logs)
      .map((log) => this.chain.decodeLog(log))
      .find((log) => log?.eventName === "LootboxOpenMaxResolved");

    return {
      code: "LOOTBOX_OPEN_MAX_RESOLVED",
      txHashes: [commitTxHash, revealTxHash],
      deltaEvents: this.toDeltaEvents(receipts),
      details: {
        commitId: commitId.toString(),
        openedAmount: openMaxLog?.args.openedAmount ?? null,
        stageLatencyMs
      }
    };
  }

  private async equipBest(action: Extract<AgentActionInput, { type: "equip_best" }>): Promise<EngineResult> {
    await this.assertCharacterOwner(action.characterId);
    return this.equipBestForCharacter(action.characterId, action.objective);
  }

  private async equipBestForCharacter(
    characterId: number,
    objective: "balanced" | "dps" | "survivability"
  ): Promise<EngineResult> {
    const owner = this.signerAddress;
    const bestLevel = await this.chain.readGameWorld<number>("characterBestLevel", [BigInt(characterId)]);
    const inventoryCount = await this.chain.readItems<bigint>("balanceOf", [owner]);

    const bestBySlot = new Map<number, { itemId: bigint; score: number }>();
    for (let index = 0n; index < inventoryCount; index++) {
      const itemId = await this.chain.readItems<bigint>("tokenOfOwnerByIndex", [owner, index]);
      const [slot, tier] = await this.chain.readItems<readonly [number, number, bigint]>("decode", [itemId]);
      if (tier > bestLevel + 1) {
        continue;
      }

      const [hp, mana, def, atkM, atkR] = await this.chain.readItems<readonly [number, number, number, number, number]>(
        "deriveBonuses",
        [itemId]
      );
      const score = scoreItem(objective, { hp, mana, def, atkM, atkR });

      const existing = bestBySlot.get(slot);
      if (!existing || score > existing.score) {
        bestBySlot.set(slot, { itemId, score });
      }
    }

    const itemIds = [...bestBySlot.values()].map((entry) => entry.itemId);
    if (itemIds.length === 0) {
      return {
        code: "NO_EQUIPPABLE_ITEMS",
        txHashes: [],
        deltaEvents: []
      };
    }

    const txHash = await this.chain.writeGameWorld("equipItems", [BigInt(characterId), itemIds]);
    const receipt = await this.chain.waitForReceipt(txHash);

    return {
      code: "ITEMS_EQUIPPED",
      txHashes: [txHash],
      deltaEvents: this.toDeltaEvents([receipt]),
      details: {
        equippedCount: itemIds.length,
        itemIds: itemIds.map((id) => id.toString())
      }
    };
  }

  private async rerollItem(action: Extract<AgentActionInput, { type: "reroll_item" }>): Promise<EngineResult> {
    await this.assertCharacterOwner(action.characterId);
    const txHash = await this.chain.writeGameWorld("rerollItemStats", [BigInt(action.characterId), BigInt(action.itemId)]);
    const receipt = await this.chain.waitForReceipt(txHash);

    return {
      code: "ITEM_REROLLED",
      txHashes: [txHash],
      deltaEvents: this.toDeltaEvents([receipt])
    };
  }

  private async forgeSetPiece(action: Extract<AgentActionInput, { type: "forge_set_piece" }>): Promise<EngineResult> {
    await this.assertCharacterOwner(action.characterId);
    const txHash = await this.chain.writeGameWorld("forgeSetPiece", [
      BigInt(action.characterId),
      BigInt(action.itemId),
      action.targetSetId
    ]);
    const receipt = await this.chain.waitForReceipt(txHash);

    return {
      code: "SET_PIECE_FORGED",
      txHashes: [txHash],
      deltaEvents: this.toDeltaEvents([receipt])
    };
  }

  private async buyPremiumLootboxes(
    action: Extract<AgentActionInput, { type: "buy_premium_lootboxes" }>
  ): Promise<EngineResult> {
    await this.assertCharacterOwner(action.characterId);
    const [ethCost, mmoCost] = await this.chain.readFeeVault<readonly [bigint, bigint]>("quotePremiumPurchase", [
      BigInt(action.characterId),
      action.difficulty,
      action.amount
    ]);
    const txHash = await this.chain.writeFeeVault(
      "buyPremiumLootboxes",
      [BigInt(action.characterId), action.difficulty, action.amount],
      { value: ethCost }
    );
    const receipt = await this.chain.waitForReceipt(txHash);

    return {
      code: "PREMIUM_LOOTBOXES_PURCHASED",
      txHashes: [txHash],
      deltaEvents: this.toDeltaEvents([receipt]),
      details: {
        difficulty: action.difficulty,
        amount: action.amount,
        requiredValueWei: ethCost.toString(),
        mmoCostWei: mmoCost.toString()
      }
    };
  }

  private async finalizeEpoch(action: Extract<AgentActionInput, { type: "finalize_epoch" }>): Promise<EngineResult> {
    const txHash = await this.chain.writeFeeVault("finalizeEpoch", [action.epochId]);
    const receipt = await this.chain.waitForReceipt(txHash);

    return {
      code: "EPOCH_FINALIZED",
      txHashes: [txHash],
      deltaEvents: this.toDeltaEvents([receipt]),
      details: {
        epochId: action.epochId
      }
    };
  }

  private async claimPlayer(action: Extract<AgentActionInput, { type: "claim_player" }>): Promise<EngineResult> {
    await this.assertCharacterOwner(action.characterId);
    const txHash = await this.chain.writeFeeVault("claimPlayer", [action.epochId, BigInt(action.characterId)]);
    const receipt = await this.chain.waitForReceipt(txHash);

    const claimedLog = receipt.logs
      .map((log) => this.chain.decodeLog(log))
      .find((log) => log?.eventName === "PlayerClaimed");
    const amountWei =
      claimedLog && typeof claimedLog.args.amount === "bigint"
        ? claimedLog.args.amount.toString()
        : null;

    return {
      code: "PLAYER_REWARD_CLAIMED",
      txHashes: [txHash],
      deltaEvents: this.toDeltaEvents([receipt]),
      details: {
        epochId: action.epochId,
        characterId: action.characterId,
        amountWei
      }
    };
  }

  private async claimDeployer(action: Extract<AgentActionInput, { type: "claim_deployer" }>): Promise<EngineResult> {
    if (!this.allowDeployerClaims) {
      throw new Error("PolicyDeployerClaimDisabled");
    }

    const txHash = await this.chain.writeFeeVault("claimDeployer", [action.epochId]);
    const receipt = await this.chain.waitForReceipt(txHash);

    const claimedLog = receipt.logs
      .map((log) => this.chain.decodeLog(log))
      .find((log) => log?.eventName === "DeployerClaimed");
    const amountWei =
      claimedLog && typeof claimedLog.args.amount === "bigint"
        ? claimedLog.args.amount.toString()
        : null;

    return {
      code: "DEPLOYER_REWARD_CLAIMED",
      txHashes: [txHash],
      deltaEvents: this.toDeltaEvents([receipt]),
      details: {
        epochId: action.epochId,
        amountWei
      }
    };
  }

  private async createTradeOffer(
    action: Extract<AgentActionInput, { type: "create_trade_offer" }>
  ): Promise<EngineResult> {
    const txHashes: string[] = [];
    const receipts: TransactionReceipt[] = [];

    const approved = await this.chain.readItemsApprovalForAll(this.signerAddress, this.chain.addresses.tradeEscrow);
    if (!approved) {
      const approveTxHash = await this.chain.writeItemsSetApprovalForAll(this.chain.addresses.tradeEscrow, true);
      const approveReceipt = await this.chain.waitForReceipt(approveTxHash);
      txHashes.push(approveTxHash);
      receipts.push(approveReceipt);
    }

    const createFee = await this.chain.readTradeEscrow<bigint>("createFee", []);
    const txHash = await this.chain.writeTradeEscrow(
      "createOffer",
      [
        action.offeredItemIds.map((itemId) => BigInt(itemId)),
        action.requestedItemIds.map((itemId) => BigInt(itemId)),
        BigInt(action.requestedMmo)
      ],
      { value: createFee }
    );
    const receipt = await this.chain.waitForReceipt(txHash);
    txHashes.push(txHash);
    receipts.push(receipt);

    const createdLog = receipt.logs
      .map((log) => this.chain.decodeLog(log))
      .find((log) => log?.eventName === "OfferCreated");
    const offerId =
      createdLog && typeof createdLog.args.offerId === "bigint"
        ? createdLog.args.offerId.toString()
        : null;

    return {
      code: "TRADE_OFFER_CREATED",
      txHashes,
      deltaEvents: this.toDeltaEvents(receipts),
      details: {
        offerId,
        requestedMmoWei: action.requestedMmo,
        offeredCount: action.offeredItemIds.length,
        requestedCount: action.requestedItemIds.length
      }
    };
  }

  private async fulfillTradeOffer(
    action: Extract<AgentActionInput, { type: "fulfill_trade_offer" }>
  ): Promise<EngineResult> {
    const txHashes: string[] = [];
    const receipts: TransactionReceipt[] = [];

    const [maker, requestedMmo] = await this.chain.readTradeEscrow<readonly [Hex, bigint, bigint, boolean]>("offers", [
      BigInt(action.offerId)
    ]);

    const itemsApproved = await this.chain.readItemsApprovalForAll(this.signerAddress, this.chain.addresses.tradeEscrow);
    if (!itemsApproved) {
      const approveItemsTxHash = await this.chain.writeItemsSetApprovalForAll(this.chain.addresses.tradeEscrow, true);
      const approveItemsReceipt = await this.chain.waitForReceipt(approveItemsTxHash);
      txHashes.push(approveItemsTxHash);
      receipts.push(approveItemsReceipt);
    }

    if (requestedMmo > 0n) {
      const allowance = await this.chain.readMmoAllowance(this.signerAddress, this.chain.addresses.tradeEscrow);
      if (allowance < requestedMmo) {
        const approveMmoTxHash = await this.chain.writeMmoApprove(
          this.chain.addresses.tradeEscrow,
          0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffn
        );
        const approveMmoReceipt = await this.chain.waitForReceipt(approveMmoTxHash);
        txHashes.push(approveMmoTxHash);
        receipts.push(approveMmoReceipt);
      }
    }

    const txHash = await this.chain.writeTradeEscrow("fulfillOffer", [BigInt(action.offerId)]);
    const receipt = await this.chain.waitForReceipt(txHash);
    txHashes.push(txHash);
    receipts.push(receipt);

    return {
      code: "TRADE_OFFER_FULFILLED",
      txHashes,
      deltaEvents: this.toDeltaEvents(receipts),
      details: {
        offerId: action.offerId,
        maker,
        requestedMmoWei: requestedMmo.toString()
      }
    };
  }

  private async cancelTradeOffer(
    action: Extract<AgentActionInput, { type: "cancel_trade_offer" }>
  ): Promise<EngineResult> {
    const txHash = await this.chain.writeTradeEscrow("cancelOffer", [BigInt(action.offerId)]);
    const receipt = await this.chain.waitForReceipt(txHash);

    return {
      code: "TRADE_OFFER_CANCELLED",
      txHashes: [txHash],
      deltaEvents: this.toDeltaEvents([receipt]),
      details: {
        offerId: action.offerId
      }
    };
  }

  private async cancelExpiredTradeOffer(
    action: Extract<AgentActionInput, { type: "cancel_expired_trade_offer" }>
  ): Promise<EngineResult> {
    const txHash = await this.chain.writeTradeEscrow("cancelExpiredOffer", [BigInt(action.offerId)]);
    const receipt = await this.chain.waitForReceipt(txHash);

    return {
      code: "TRADE_OFFER_EXPIRED_CANCELLED",
      txHashes: [txHash],
      deltaEvents: this.toDeltaEvents([receipt]),
      details: {
        offerId: action.offerId
      }
    };
  }

  private async createRfq(action: Extract<AgentActionInput, { type: "create_rfq" }>): Promise<EngineResult> {
    const offeredAmount = BigInt(action.mmoOffered);
    const allowance = await this.chain.readMmoAllowance(this.signerAddress, this.chain.addresses.rfqMarket);
    const txHashes: string[] = [];
    const receipts: TransactionReceipt[] = [];

    if (allowance < offeredAmount) {
      const approveTxHash = await this.chain.writeMmoApprove(
        this.chain.addresses.rfqMarket,
        0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffn
      );
      const approveReceipt = await this.chain.waitForReceipt(approveTxHash);
      txHashes.push(approveTxHash);
      receipts.push(approveReceipt);
    }

    const txHash = await this.chain.writeRfq("createRFQ", [
      action.slot,
      action.minTier,
      BigInt(action.acceptableSetMask),
      offeredAmount,
      action.expiry ?? 0
    ]);
    const receipt = await this.chain.waitForReceipt(txHash);
    txHashes.push(txHash);
    receipts.push(receipt);

    return {
      code: "RFQ_CREATED",
      txHashes,
      deltaEvents: this.toDeltaEvents(receipts)
    };
  }

  private async fillRfq(action: Extract<AgentActionInput, { type: "fill_rfq" }>): Promise<EngineResult> {
    const txHash = await this.chain.writeRfq("fillRFQ", [BigInt(action.rfqId), BigInt(action.itemTokenId)]);
    const receipt = await this.chain.waitForReceipt(txHash);

    return {
      code: "RFQ_FILLED",
      txHashes: [txHash],
      deltaEvents: this.toDeltaEvents([receipt])
    };
  }

  private async cancelRfq(action: Extract<AgentActionInput, { type: "cancel_rfq" }>): Promise<EngineResult> {
    const txHash = await this.chain.writeRfq("cancelRFQ", [BigInt(action.rfqId)]);
    const receipt = await this.chain.waitForReceipt(txHash);

    return {
      code: "RFQ_CANCELLED",
      txHashes: [txHash],
      deltaEvents: this.toDeltaEvents([receipt])
    };
  }

  private async assertCharacterOwner(characterId: number): Promise<void> {
    const owner = await this.chain.readGameWorld<`0x${string}`>("ownerOfCharacter", [BigInt(characterId)]);
    if (owner.toLowerCase() !== this.signerAddress.toLowerCase()) {
      throw new Error("OnlyCharacterOwner");
    }
  }

  private async commitReveal(params: {
    characterId: number;
    varianceMode: number;
    actionType: number;
    hashFn: (secret: Hex, nonce: bigint) => Promise<Hex>;
    revealFn: (commitId: bigint, secret: Hex) => Promise<Hex>;
  }): Promise<{
    commitTxHash: Hex;
    revealTxHash: Hex;
    commitId: bigint;
    receipts: TransactionReceipt[];
    stageLatencyMs: {
      commitSubmit: number;
      mineWait: number;
      revealSubmit: number;
    };
  }> {
    const nonce = randomUint64();
    const secret = toHex(randomBytes(32));
    const commitHash = await params.hashFn(secret, nonce);
    const commitFee = await this.chain.readGameWorld<bigint>("commitFee", []);

    const t0 = Date.now();
    const commitTxHash = await this.chain.writeGameWorld("commitActionWithVariance", [
      BigInt(params.characterId),
      params.actionType,
      commitHash,
      nonce,
      params.varianceMode
    ], { value: commitFee });
    const commitSubmitLatency = Date.now() - t0;
    const commitReceipt = await this.chain.waitForReceipt(commitTxHash);
    const commitBlock = commitReceipt.blockNumber;

    const actionCommitted = commitReceipt.logs
      .map((log) => this.chain.decodeLog(log))
      .find((log) => log?.eventName === "ActionCommitted");

    let commitId: bigint;
    if (actionCommitted && typeof actionCommitted.args.commitId === "bigint") {
      commitId = actionCommitted.args.commitId;
    } else {
      const nextCommitId = await this.chain.readGameWorld<bigint>("nextCommitId", []);
      commitId = nextCommitId - 1n;
    }

    const latestBlock = await this.chain.getBlockNumber();
    if (latestBlock > commitBlock + 255n) {
      throw new Error("RevealExpired");
    }

    const waitStart = Date.now();
    if (this.chain.isLocalChain()) {
      await this.chain.mineBlocks(2);
    } else {
      await this.chain.waitForBlock(commitBlock + 2n);
    }
    const mineWaitLatency = Date.now() - waitStart;

    let revealTxHash: Hex | null = null;
    let revealReceipt: TransactionReceipt | null = null;
    let lastError: unknown = null;

    let revealSubmitLatency = 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const revealStart = Date.now();
        revealTxHash = await params.revealFn(commitId, secret);
        revealSubmitLatency = Date.now() - revealStart;
        revealReceipt = await this.chain.waitForReceipt(revealTxHash);
        break;
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("RevealTooEarly")) {
          if (this.chain.isLocalChain()) {
            await this.chain.mineBlocks(1);
          } else {
            const current = await this.chain.getBlockNumber();
            await this.chain.waitForBlock(current + 1n);
          }
          continue;
        }
        if (message.includes("RevealExpired")) {
          await this.chain.writeGameWorld("cancelExpired", [commitId]);
        }
        throw error;
      }
    }

    if (!revealTxHash || !revealReceipt) {
      throw lastError ?? new Error("reveal_failed_without_error");
    }

    return {
      commitTxHash,
      revealTxHash,
      commitId,
      receipts: [commitReceipt, revealReceipt],
      stageLatencyMs: {
        commitSubmit: commitSubmitLatency,
        mineWait: mineWaitLatency,
        revealSubmit: revealSubmitLatency
      }
    };
  }

  private toDeltaEvents(receipts: TransactionReceipt[]): DeltaEvent[] {
    return receipts
      .flatMap((receipt) => receipt.logs)
      .map((log) => this.chain.decodeLog(log))
      .filter((log): log is NonNullable<typeof log> => Boolean(log))
      .map((log) => ({
        blockNumber: Number(log.blockNumber),
        txHash: log.transactionHash,
        kind: log.eventName,
        payload: log.args
      }));
  }
}

function scoreItem(
  objective: "balanced" | "dps" | "survivability",
  stats: { hp: number; mana: number; def: number; atkM: number; atkR: number }
): number {
  if (objective === "dps") {
    return stats.atkM * 4 + stats.atkR * 4 + stats.def + Math.floor(stats.hp / 2) + Math.floor(stats.mana / 2);
  }
  if (objective === "survivability") {
    return stats.hp * 3 + stats.def * 3 + stats.mana + stats.atkM + stats.atkR;
  }
  return stats.hp * 2 + stats.mana * 2 + stats.def * 3 + stats.atkM * 3 + stats.atkR * 3;
}

function randomUint64(): bigint {
  const bytes = randomBytes(8);
  return BigInt(`0x${bytes.toString("hex")}`);
}

function exhaustive(value: never): never {
  throw new Error(`unhandled action ${(value as { type?: string }).type ?? "unknown"}`);
}
