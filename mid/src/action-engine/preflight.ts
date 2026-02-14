import type { Hex } from "viem";
import { ChainAdapter } from "../chain-adapter/client.js";
import { normalizeError } from "./errors.js";
import type { AgentActionInput } from "../shared/schemas.js";

export interface ActionPreflightResult {
  actionType: AgentActionInput["type"];
  willSucceed: boolean;
  code: string;
  reason: string;
  retryable: boolean;
  requiredValueWei: string;
  suggestedParams?: Record<string, unknown>;
  suggestedNextAction?: string;
}

export interface ActionPreflightOptions {
  allowDeployerClaims?: boolean;
}

export class ActionPreflight {
  private readonly signerAddress: Hex;
  private readonly allowDeployerClaims: boolean;

  public constructor(
    private readonly chain: ChainAdapter,
    options: ActionPreflightOptions = {}
  ) {
    if (!chain.account) {
      throw new Error("wallet_client_unavailable");
    }
    this.signerAddress = chain.account.address;
    this.allowDeployerClaims = Boolean(options.allowDeployerClaims);
  }

  public async evaluate(
    action: AgentActionInput,
    options: {
      commitId?: number;
    } = {}
  ): Promise<ActionPreflightResult> {
    try {
      const revealGate = await this.evaluateRevealWindowGate(action.type, options.commitId);
      if (revealGate) {
        return revealGate;
      }

      switch (action.type) {
        case "create_character":
          return ok(action.type, "Character payload is valid");
        case "start_dungeon":
          return this.preflightStartDungeon(action);
        case "next_room":
          return this.preflightNextRoom(action);
        case "open_lootboxes_max":
          return this.preflightOpenLootboxesMax(action);
        case "equip_best":
          return this.preflightGearAction(action, "equip_best");
        case "reroll_item":
          return this.preflightGearAction(action, "reroll_item");
        case "forge_set_piece":
          return this.preflightGearAction(action, "forge_set_piece");
        case "buy_premium_lootboxes":
          return this.preflightBuyPremiumLootboxes(action);
        case "finalize_epoch":
          return this.preflightFinalizeEpoch(action);
        case "claim_player":
          return this.preflightClaimPlayer(action);
        case "claim_deployer":
          return this.preflightClaimDeployer(action);
        case "create_trade_offer":
          return this.preflightCreateTradeOffer(action);
        case "fulfill_trade_offer":
          return this.preflightFulfillTradeOffer(action);
        case "cancel_trade_offer":
          return this.preflightCancelTradeOffer(action);
        case "cancel_expired_trade_offer":
          return this.preflightCancelExpiredTradeOffer(action);
        case "create_rfq":
          return this.preflightCreateRfq(action);
        case "fill_rfq":
          return this.preflightFillRfq(action);
        case "cancel_rfq":
          return this.preflightCancelRfq(action);
        default:
          return exhaustive(action);
      }
    } catch (error) {
      const normalized = normalizeError(error);
      return fail(action.type, normalized.code, normalized.message, {
        retryable: normalized.retryable
      });
    }
  }

  private async preflightStartDungeon(
    action: Extract<AgentActionInput, { type: "start_dungeon" }>
  ): Promise<ActionPreflightResult> {
    const commitFee = await this.chain.readGameWorld<bigint>("commitFee", []);
    const ownershipFailure = await this.ensureCharacterOwner(action.characterId, action.type, commitFee.toString());
    if (ownershipFailure) {
      return ownershipFailure;
    }

    const [runState, equippedSlots, requiredSlots] = await Promise.all([
      this.chain.readGameWorld<
        readonly [boolean, number, number, number, number, number, number, number, number, number]
      >("getRunState", [BigInt(action.characterId)]),
      this.chain.readGameWorld<number>("equippedSlotCount", [BigInt(action.characterId)]),
      this.chain.readGameWorld<number>("requiredEquippedSlots", [action.dungeonLevel])
    ]);

    if (runState[0]) {
      return fail(action.type, "PRECHECK_RUN_ALREADY_ACTIVE", "Character already has an active dungeon run", {
        requiredValueWei: commitFee.toString(),
        suggestedNextAction: "next_room"
      });
    }

    if (equippedSlots < requiredSlots) {
      return fail(
        action.type,
        "PRECHECK_INSUFFICIENT_EQUIPPED_SLOTS",
        `Need ${requiredSlots} equipped slots before level ${action.dungeonLevel}`,
        {
          requiredValueWei: commitFee.toString(),
          suggestedNextAction: "equip_best",
          suggestedParams: {
            equippedSlots,
            requiredSlots,
            dungeonLevel: action.dungeonLevel
          }
        }
      );
    }

    return ok(action.type, "Preflight passed for start_dungeon", {
      requiredValueWei: commitFee.toString()
    });
  }

  private async preflightNextRoom(
    action: Extract<AgentActionInput, { type: "next_room" }>
  ): Promise<ActionPreflightResult> {
    const ownershipFailure = await this.ensureCharacterOwner(action.characterId, action.type, "0");
    if (ownershipFailure) {
      return ownershipFailure;
    }

    const runState = await this.chain.readGameWorld<
      readonly [boolean, number, number, number, number, number, number, number, number, number]
    >("getRunState", [BigInt(action.characterId)]);
    if (!runState[0]) {
      return fail(action.type, "PRECHECK_RUN_NOT_ACTIVE", "No active dungeon run to resolve", {
        suggestedNextAction: "start_dungeon"
      });
    }

    const requestedPotionUses = countPotionChoices(action);
    const availablePotionCharges = {
      hp: runState[5],
      mana: runState[6],
      power: runState[7]
    };

    if (
      requestedPotionUses.hp > availablePotionCharges.hp ||
      requestedPotionUses.mana > availablePotionCharges.mana ||
      requestedPotionUses.power > availablePotionCharges.power
    ) {
      return fail(
        action.type,
        "PRECHECK_POTION_UNAVAILABLE",
        "Potion choice exceeds currently available run potion charges",
        {
          suggestedParams: {
            requestedPotionUses,
            availablePotionCharges
          },
          suggestedNextAction: "get_agent_state"
        }
      );
    }

    return ok(action.type, "Preflight passed for next_room");
  }

  private async preflightOpenLootboxesMax(
    action: Extract<AgentActionInput, { type: "open_lootboxes_max" }>
  ): Promise<ActionPreflightResult> {
    const commitFee = await this.chain.readGameWorld<bigint>("commitFee", []);
    const ownershipFailure = await this.ensureCharacterOwner(action.characterId, action.type, commitFee.toString());
    if (ownershipFailure) {
      return ownershipFailure;
    }

    const quote = await this.chain.readGameWorld<readonly [number, number, number, number]>("quoteOpenLootboxes", [
      BigInt(action.characterId),
      action.tier,
      action.maxAmount,
      action.varianceMode
    ]);

    const openableAmount = quote[3];
    if (openableAmount === 0) {
      return fail(
        action.type,
        "PRECHECK_INSUFFICIENT_LOOTBOX_CREDITS",
        "No lootboxes are currently openable for requested tier/variance",
        {
          requiredValueWei: commitFee.toString(),
          suggestedNextAction: "start_dungeon",
          suggestedParams: {
            availableTotal: quote[0],
            availableBound: quote[1],
            availableGeneric: quote[2],
            openableAmount
          }
        }
      );
    }

    return ok(action.type, "Preflight passed for open_lootboxes_max", {
      requiredValueWei: commitFee.toString(),
      suggestedParams: {
        openableAmount
      }
    });
  }

  private async preflightGearAction(
    action: Extract<AgentActionInput, { type: "equip_best" | "reroll_item" | "forge_set_piece" }>,
    actionType: "equip_best" | "reroll_item" | "forge_set_piece"
  ): Promise<ActionPreflightResult> {
    const ownershipFailure = await this.ensureCharacterOwner(action.characterId, actionType, "0");
    if (ownershipFailure) {
      return ownershipFailure;
    }

    const runState = await this.chain.readGameWorld<readonly [boolean]>("getRunState", [BigInt(action.characterId)]);
    if (runState[0]) {
      return fail(actionType, "CHAIN_GEAR_LOCKED_DURING_RUN", "Gear is locked while a dungeon run is active", {
        suggestedNextAction: "next_room"
      });
    }

    return ok(actionType, `Preflight passed for ${actionType}`);
  }

  private async preflightCreateRfq(
    action: Extract<AgentActionInput, { type: "create_rfq" }>
  ): Promise<ActionPreflightResult> {
    const [createFee, maxTtl] = await Promise.all([
      this.chain.readRfq<bigint>("createFee", []),
      this.chain.readRfq<number | bigint>("maxTtl", [])
    ]);

    const offeredAmount = BigInt(action.mmoOffered);
    if (offeredAmount <= 0n) {
      return fail(action.type, "PRECHECK_INVALID_AMOUNT", "RFQ requires mmoOffered > 0", {
        requiredValueWei: createFee.toString()
      });
    }

    const nowUnix = Math.floor(Date.now() / 1000);
    const ttlUpperBound = nowUnix + normalizeNumber(maxTtl);
    if (!action.expiry || action.expiry <= nowUnix || action.expiry > ttlUpperBound) {
      return fail(action.type, "PRECHECK_INVALID_EXPIRY", "RFQ expiry must be in the future and within max ttl", {
        requiredValueWei: createFee.toString(),
        suggestedParams: {
          nowUnix,
          maxExpiryUnix: ttlUpperBound,
          suggestedExpiryUnix: Math.min(nowUnix + 3600, ttlUpperBound)
        }
      });
    }

    return ok(action.type, "Preflight passed for create_rfq", {
      requiredValueWei: createFee.toString()
    });
  }

  private async preflightBuyPremiumLootboxes(
    action: Extract<AgentActionInput, { type: "buy_premium_lootboxes" }>
  ): Promise<ActionPreflightResult> {
    const ownershipFailure = await this.ensureCharacterOwner(action.characterId, action.type, "0");
    if (ownershipFailure) {
      return ownershipFailure;
    }

    const [ethCost, mmoCost] = await this.chain.readFeeVault<readonly [bigint, bigint]>("quotePremiumPurchase", [
      BigInt(action.characterId),
      action.difficulty,
      action.amount
    ]);

    return ok(action.type, "Preflight passed for buy_premium_lootboxes", {
      requiredValueWei: ethCost.toString(),
      suggestedParams: {
        difficulty: action.difficulty,
        amount: action.amount,
        mmoCostWei: mmoCost.toString()
      }
    });
  }

  private async preflightFinalizeEpoch(
    action: Extract<AgentActionInput, { type: "finalize_epoch" }>
  ): Promise<ActionPreflightResult> {
    const snapshot = await this.chain.readFeeVault<readonly [bigint, bigint, number, bigint, boolean]>("epochSnapshot", [
      action.epochId
    ]);
    if (snapshot[4]) {
      return fail(action.type, "CHAIN_EPOCH_ALREADY_FINALIZED", "Epoch is already finalized");
    }
    return ok(action.type, "Preflight passed for finalize_epoch");
  }

  private async preflightClaimPlayer(
    action: Extract<AgentActionInput, { type: "claim_player" }>
  ): Promise<ActionPreflightResult> {
    const ownershipFailure = await this.ensureCharacterOwner(action.characterId, action.type, "0");
    if (ownershipFailure) {
      return ownershipFailure;
    }

    const [snapshot, claimed] = await Promise.all([
      this.chain.readFeeVault<readonly [bigint, bigint, number, bigint, boolean]>("epochSnapshot", [action.epochId]),
      this.chain.readFeeVault<boolean>("playerClaimed", [action.epochId, BigInt(action.characterId)])
    ]);

    if (!snapshot[4]) {
      return fail(action.type, "CHAIN_EPOCH_NOT_FINALIZED", "Epoch is not finalized yet", { retryable: true });
    }
    if (claimed) {
      return fail(action.type, "CHAIN_ALREADY_CLAIMED", "Player reward already claimed for this epoch");
    }

    return ok(action.type, "Preflight passed for claim_player", {
      suggestedParams: {
        epochId: action.epochId,
        characterId: action.characterId
      }
    });
  }

  private async preflightClaimDeployer(
    action: Extract<AgentActionInput, { type: "claim_deployer" }>
  ): Promise<ActionPreflightResult> {
    if (!this.allowDeployerClaims) {
      return fail(action.type, "POLICY_DEPLOYER_CLAIM_DISABLED", "Deployer claim action is disabled by policy");
    }

    const [snapshot, claimed] = await Promise.all([
      this.chain.readFeeVault<readonly [bigint, bigint, number, bigint, boolean]>("epochSnapshot", [action.epochId]),
      this.chain.readFeeVault<boolean>("deployerClaimed", [action.epochId])
    ]);

    if (!snapshot[4]) {
      return fail(action.type, "CHAIN_EPOCH_NOT_FINALIZED", "Epoch is not finalized yet", { retryable: true });
    }
    if (claimed) {
      return fail(action.type, "CHAIN_ALREADY_CLAIMED", "Deployer reward already claimed for this epoch");
    }

    return ok(action.type, "Preflight passed for claim_deployer", {
      suggestedParams: {
        epochId: action.epochId
      }
    });
  }

  private async preflightCreateTradeOffer(
    action: Extract<AgentActionInput, { type: "create_trade_offer" }>
  ): Promise<ActionPreflightResult> {
    const [createFee, itemsApproved] = await Promise.all([
      this.chain.readTradeEscrow<bigint>("createFee", []),
      this.chain.readItemsApprovalForAll(this.signerAddress, this.chain.addresses.tradeEscrow)
    ]);

    return ok(action.type, "Preflight passed for create_trade_offer", {
      requiredValueWei: createFee.toString(),
      suggestedParams: {
        offeredCount: action.offeredItemIds.length,
        requestedCount: action.requestedItemIds.length,
        itemsApprovalRequired: !itemsApproved
      }
    });
  }

  private async preflightFulfillTradeOffer(
    action: Extract<AgentActionInput, { type: "fulfill_trade_offer" }>
  ): Promise<ActionPreflightResult> {
    const [maker, requestedMmo, expiry, active] = await this.chain.readTradeEscrow<readonly [Hex, bigint, bigint, boolean]>(
      "offers",
      [BigInt(action.offerId)]
    );
    if (!active) {
      return fail(action.type, "CHAIN_OFFER_INACTIVE", "Trade offer is not active");
    }

    const nowUnix = Math.floor(Date.now() / 1000);
    if (expiry > 0n && BigInt(nowUnix) > expiry) {
      return fail(action.type, "CHAIN_OFFER_EXPIRED", "Trade offer has expired");
    }

    const [itemsApproved, mmoAllowance] = await Promise.all([
      this.chain.readItemsApprovalForAll(this.signerAddress, this.chain.addresses.tradeEscrow),
      requestedMmo > 0n
        ? this.chain.readMmoAllowance(this.signerAddress, this.chain.addresses.tradeEscrow)
        : Promise.resolve(0n)
    ]);

    return ok(action.type, "Preflight passed for fulfill_trade_offer", {
      suggestedParams: {
        offerId: action.offerId,
        maker,
        requestedMmoWei: requestedMmo.toString(),
        itemsApprovalRequired: !itemsApproved,
        mmoApprovalRequired: requestedMmo > 0n && mmoAllowance < requestedMmo
      }
    });
  }

  private async preflightCancelTradeOffer(
    action: Extract<AgentActionInput, { type: "cancel_trade_offer" }>
  ): Promise<ActionPreflightResult> {
    const [maker, _requestedMmo, _expiry, active] = await this.chain.readTradeEscrow<readonly [Hex, bigint, bigint, boolean]>(
      "offers",
      [BigInt(action.offerId)]
    );
    if (!active) {
      return fail(action.type, "CHAIN_OFFER_INACTIVE", "Trade offer is not active");
    }
    if (maker.toLowerCase() !== this.signerAddress.toLowerCase()) {
      return fail(action.type, "CHAIN_NOT_OFFER_MAKER", "Only offer maker can cancel");
    }

    return ok(action.type, "Preflight passed for cancel_trade_offer", {
      suggestedParams: {
        offerId: action.offerId
      }
    });
  }

  private async preflightCancelExpiredTradeOffer(
    action: Extract<AgentActionInput, { type: "cancel_expired_trade_offer" }>
  ): Promise<ActionPreflightResult> {
    const [_maker, _requestedMmo, expiry, active] = await this.chain.readTradeEscrow<readonly [Hex, bigint, bigint, boolean]>(
      "offers",
      [BigInt(action.offerId)]
    );
    if (!active) {
      return fail(action.type, "CHAIN_OFFER_INACTIVE", "Trade offer is not active");
    }

    const nowUnix = Math.floor(Date.now() / 1000);
    if (expiry === 0n || BigInt(nowUnix) <= expiry) {
      return fail(action.type, "CHAIN_OFFER_NOT_EXPIRED", "Trade offer is not expired yet", {
        retryable: true
      });
    }

    return ok(action.type, "Preflight passed for cancel_expired_trade_offer", {
      suggestedParams: {
        offerId: action.offerId
      }
    });
  }

  private async preflightFillRfq(action: Extract<AgentActionInput, { type: "fill_rfq" }>): Promise<ActionPreflightResult> {
    const rfq = await this.chain.readRfq<readonly [Hex, bigint, bigint, bigint, bigint, boolean, boolean, bigint]>("rfqs", [
      BigInt(action.rfqId)
    ]);
    if (!rfq[5]) {
      return fail(action.type, "CHAIN_RFQ_INACTIVE", "RFQ is no longer active");
    }

    const expiry = Number(rfq[3]);
    const nowUnix = Math.floor(Date.now() / 1000);
    if (expiry > 0 && nowUnix > expiry) {
      return fail(action.type, "CHAIN_RFQ_EXPIRED", "RFQ has expired");
    }

    return ok(action.type, "Preflight passed for fill_rfq");
  }

  private async preflightCancelRfq(
    action: Extract<AgentActionInput, { type: "cancel_rfq" }>
  ): Promise<ActionPreflightResult> {
    const rfq = await this.chain.readRfq<readonly [Hex, bigint, bigint, bigint, bigint, boolean, boolean, bigint]>("rfqs", [
      BigInt(action.rfqId)
    ]);
    if (!rfq[5]) {
      return fail(action.type, "CHAIN_RFQ_INACTIVE", "RFQ is no longer active");
    }

    const maker = rfq[0];
    if (maker.toLowerCase() !== this.signerAddress.toLowerCase()) {
      return fail(action.type, "CHAIN_NOT_RFQ_MAKER", "Only RFQ maker can cancel", {
        suggestedNextAction: "fill_rfq"
      });
    }

    return ok(action.type, "Preflight passed for cancel_rfq");
  }

  private async evaluateRevealWindowGate(
    actionType: AgentActionInput["type"],
    commitId?: number
  ): Promise<ActionPreflightResult | null> {
    if (commitId === undefined) {
      return null;
    }

    const [startBlock, endBlock, canReveal, expired, resolved] = await this.chain.readGameWorld<
      readonly [bigint, bigint, boolean, boolean, boolean]
    >("revealWindow", [BigInt(commitId)]);
    const currentBlock = await this.chain.getBlockNumber();

    if (resolved) {
      return fail(actionType, "CHAIN_COMMIT_RESOLVED", "Commit is already resolved", {
        suggestedParams: {
          commitId
        }
      });
    }

    if (expired) {
      return fail(actionType, "CHAIN_REVEAL_EXPIRED", "Commit reveal window has expired", {
        suggestedParams: {
          commitId,
          endBlock: normalizeNumber(endBlock),
          currentBlock: normalizeNumber(currentBlock)
        },
        suggestedNextAction: "cancel_expired"
      });
    }

    if (!canReveal && currentBlock < startBlock) {
      return fail(actionType, "CHAIN_REVEAL_TOO_EARLY", "Commit reveal window has not opened yet", {
        retryable: true,
        suggestedParams: {
          commitId,
          currentBlock: normalizeNumber(currentBlock),
          startBlock: normalizeNumber(startBlock),
          blocksUntilReveal: normalizeNumber(startBlock - currentBlock)
        }
      });
    }

    return null;
  }

  private async ensureCharacterOwner(
    characterId: number,
    actionType: AgentActionInput["type"],
    requiredValueWei: string
  ): Promise<ActionPreflightResult | null> {
    const owner = await this.chain.readGameWorld<Hex>("ownerOfCharacter", [BigInt(characterId)]);
    if (owner.toLowerCase() !== this.signerAddress.toLowerCase()) {
      return fail(actionType, "PRECHECK_ONLY_CHARACTER_OWNER", "Signer does not own the target character", {
        requiredValueWei
      });
    }
    return null;
  }
}

function countPotionChoices(action: Extract<AgentActionInput, { type: "next_room" }>): {
  hp: number;
  mana: number;
  power: number;
} {
  const inputChoices = Array.isArray(action.potionChoices)
    ? action.potionChoices
    : [action.potionChoice ?? 0];
  const counts = { hp: 0, mana: 0, power: 0 };

  for (const choice of inputChoices) {
    if (choice === 1) counts.hp += 1;
    if (choice === 2) counts.mana += 1;
    if (choice === 3) counts.power += 1;
  }

  return counts;
}

function ok(
  actionType: AgentActionInput["type"],
  reason: string,
  options: {
    requiredValueWei?: string;
    suggestedParams?: Record<string, unknown>;
    suggestedNextAction?: string;
  } = {}
): ActionPreflightResult {
  return {
    actionType,
    willSucceed: true,
    code: "PRECHECK_OK",
    reason,
    retryable: false,
    requiredValueWei: options.requiredValueWei ?? "0",
    suggestedParams: options.suggestedParams,
    suggestedNextAction: options.suggestedNextAction
  };
}

function fail(
  actionType: AgentActionInput["type"],
  code: string,
  reason: string,
  options: {
    retryable?: boolean;
    requiredValueWei?: string;
    suggestedParams?: Record<string, unknown>;
    suggestedNextAction?: string;
  } = {}
): ActionPreflightResult {
  return {
    actionType,
    willSucceed: false,
    code,
    reason,
    retryable: options.retryable ?? false,
    requiredValueWei: options.requiredValueWei ?? "0",
    suggestedParams: options.suggestedParams,
    suggestedNextAction: options.suggestedNextAction
  };
}

function normalizeNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number(value);
  return 0;
}

function exhaustive(value: never): never {
  throw new Error(`unhandled action ${(value as { type?: string }).type ?? "unknown"}`);
}
