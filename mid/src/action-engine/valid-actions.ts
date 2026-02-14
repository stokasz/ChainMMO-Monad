import type { Hex } from "viem";
import { ChainAdapter } from "../chain-adapter/client.js";

export interface ValidActionEntry {
  actionType: string;
  valid: boolean;
  code: string;
  reason: string;
  retryable: boolean;
  suggestedParams?: Record<string, unknown>;
}

export interface ValidActionMenuResult {
  characterId: number;
  signer: string;
  owner: string;
  isOwner: boolean;
  context: {
    runActive: boolean;
    dungeonLevel: number;
    equippedSlots: number;
    requiredSlots: number;
    potionCharges: {
      hp: number;
      mana: number;
      power: number;
    };
    lootboxQuote: {
      tier: number;
      requestedAmount: number;
      openableAmount: number;
      availableTotal: number;
      availableBound: number;
      availableGeneric: number;
    };
    premiumQuote: {
      difficulty: number;
      amount: number;
      requiredValueWei: string;
      estimatedMmoCostWei: string;
    };
    revealWindow?: {
      commitId: number;
      currentBlock: number;
      startBlock: number;
      endBlock: number;
      canReveal: boolean;
      expired: boolean;
      resolved: boolean;
    };
  };
  validActions: ValidActionEntry[];
  invalidActions: ValidActionEntry[];
}

export class ActionValidMenu {
  private readonly signerAddress: Hex;

  public constructor(private readonly chain: ChainAdapter) {
    if (!chain.account) {
      throw new Error("wallet_client_unavailable");
    }
    this.signerAddress = chain.account.address;
  }

  public async getMenu(input: {
    characterId: number;
    dungeonLevel?: number;
    difficulty?: number;
    varianceMode?: number;
    tier?: number;
    maxAmount?: number;
    commitId?: number;
  }): Promise<ValidActionMenuResult> {
    const difficulty = input.difficulty ?? 1;
    const varianceMode = input.varianceMode ?? 1;
    const requestedAmount = input.maxAmount ?? 1;

    const [owner, runState, bestLevel, equippedSlots] = await Promise.all([
      this.chain.readGameWorld<Hex>("ownerOfCharacter", [BigInt(input.characterId)]),
      this.chain.readGameWorld<
        readonly [boolean, number, number, number, number, number, number, number, number, number]
      >("getRunState", [BigInt(input.characterId)]),
      this.chain.readGameWorld<number>("characterBestLevel", [BigInt(input.characterId)]),
      this.chain.readGameWorld<number>("equippedSlotCount", [BigInt(input.characterId)])
    ]);

    const runActive = runState[0];
    const derivedDungeonLevel = input.dungeonLevel ?? (runActive ? runState[8] : bestLevel + 1);
    const tier = input.tier ?? Math.max(1, derivedDungeonLevel);
    const [requiredSlots, lootboxQuote, premiumQuote] = await Promise.all([
      this.chain.readGameWorld<number>("requiredEquippedSlots", [derivedDungeonLevel]),
      this.chain.readGameWorld<readonly [number, number, number, number]>("quoteOpenLootboxes", [
        BigInt(input.characterId),
        tier,
        requestedAmount,
        varianceMode
      ]),
      this.chain.readFeeVault<readonly [bigint, bigint]>("quotePremiumPurchase", [
        BigInt(input.characterId),
        difficulty,
        requestedAmount
      ])
    ]);

    const isOwner = owner.toLowerCase() === this.signerAddress.toLowerCase();
    const actions: ValidActionEntry[] = [];

    actions.push(
      this.evaluateStartDungeon({
        isOwner,
        runActive,
        equippedSlots,
        requiredSlots,
        difficulty,
        dungeonLevel: derivedDungeonLevel,
        varianceMode
      })
    );
    actions.push(this.evaluateNextRoom({ isOwner, runActive }));
    actions.push(this.evaluatePotionUse({ isOwner, runActive, charges: runState[5], actionType: "next_room_use_hp_potion", potionChoice: 1 }));
    actions.push(this.evaluatePotionUse({ isOwner, runActive, charges: runState[6], actionType: "next_room_use_mana_potion", potionChoice: 2 }));
    actions.push(this.evaluatePotionUse({ isOwner, runActive, charges: runState[7], actionType: "next_room_use_power_potion", potionChoice: 3 }));
    actions.push(
      this.evaluateOpenLootboxes({
        isOwner,
        tier,
        requestedAmount,
        varianceMode,
        quote: lootboxQuote
      })
    );
    actions.push(this.evaluateGearAction({ isOwner, runActive, actionType: "equip_best" }));
    actions.push(this.evaluateGearAction({ isOwner, runActive, actionType: "reroll_item" }));
    actions.push(this.evaluateGearAction({ isOwner, runActive, actionType: "forge_set_piece" }));
    actions.push(this.evaluatePremiumPurchase({ isOwner, difficulty, amount: requestedAmount, quote: premiumQuote }));

    let revealWindow: ValidActionMenuResult["context"]["revealWindow"];
    if (input.commitId !== undefined) {
      const [startBlock, endBlock, canReveal, expired, resolved] = await this.chain.readGameWorld<
        readonly [bigint, bigint, boolean, boolean, boolean]
      >("revealWindow", [BigInt(input.commitId)]);
      const currentBlock = await this.chain.getBlockNumber();
      revealWindow = {
        commitId: input.commitId,
        currentBlock: Number(currentBlock),
        startBlock: Number(startBlock),
        endBlock: Number(endBlock),
        canReveal: Boolean(canReveal),
        expired: Boolean(expired),
        resolved: Boolean(resolved)
      };
      actions.push(this.evaluateRevealWindow(revealWindow));
    } else {
      actions.push({
        actionType: "reveal_pending_commit",
        valid: false,
        code: "PRECHECK_COMMIT_ID_REQUIRED",
        reason: "Pass commitId to evaluate reveal timing window",
        retryable: false
      });
    }

    return {
      characterId: input.characterId,
      signer: this.signerAddress,
      owner,
      isOwner,
      context: {
        runActive,
        dungeonLevel: derivedDungeonLevel,
        equippedSlots,
        requiredSlots,
        potionCharges: {
          hp: runState[5],
          mana: runState[6],
          power: runState[7]
        },
        lootboxQuote: {
          tier,
          requestedAmount,
          openableAmount: lootboxQuote[3],
          availableTotal: lootboxQuote[0],
          availableBound: lootboxQuote[1],
          availableGeneric: lootboxQuote[2]
        },
        premiumQuote: {
          difficulty,
          amount: requestedAmount,
          requiredValueWei: premiumQuote[0].toString(),
          estimatedMmoCostWei: premiumQuote[1].toString()
        },
        revealWindow
      },
      validActions: actions.filter((action) => action.valid),
      invalidActions: actions.filter((action) => !action.valid)
    };
  }

  private evaluateStartDungeon(input: {
    isOwner: boolean;
    runActive: boolean;
    equippedSlots: number;
    requiredSlots: number;
    difficulty: number;
    dungeonLevel: number;
    varianceMode: number;
  }): ValidActionEntry {
    if (!input.isOwner) {
      return ownerFailure("start_dungeon");
    }
    if (input.runActive) {
      return invalid("start_dungeon", "PRECHECK_RUN_ALREADY_ACTIVE", "Character already has an active run");
    }
    if (input.equippedSlots < input.requiredSlots) {
      return invalid(
        "start_dungeon",
        "PRECHECK_INSUFFICIENT_EQUIPPED_SLOTS",
        `Need ${input.requiredSlots} equipped slots (${input.equippedSlots}/${input.requiredSlots})`,
        {
          suggestedParams: {
            equippedSlots: input.equippedSlots,
            requiredSlots: input.requiredSlots
          }
        }
      );
    }
    return valid("start_dungeon", "Ready to start dungeon", {
      difficulty: input.difficulty,
      dungeonLevel: input.dungeonLevel,
      varianceMode: input.varianceMode
    });
  }

  private evaluateNextRoom(input: { isOwner: boolean; runActive: boolean }): ValidActionEntry {
    if (!input.isOwner) {
      return ownerFailure("next_room");
    }
    if (!input.runActive) {
      return invalid("next_room", "PRECHECK_RUN_NOT_ACTIVE", "No active run to resolve");
    }
    return valid("next_room", "Run active; resolve next room", {
      potionChoice: 0,
      abilityChoice: 0
    });
  }

  private evaluatePotionUse(input: {
    isOwner: boolean;
    runActive: boolean;
    charges: number;
    actionType: string;
    potionChoice: number;
  }): ValidActionEntry {
    if (!input.isOwner) {
      return ownerFailure(input.actionType);
    }
    if (!input.runActive) {
      return invalid(input.actionType, "PRECHECK_RUN_NOT_ACTIVE", "No active run to consume potion");
    }
    if (input.charges <= 0) {
      return invalid(input.actionType, "PRECHECK_POTION_UNAVAILABLE", "No potion charges remaining");
    }
    return valid(input.actionType, "Potion can be used this room", {
      potionChoice: input.potionChoice
    });
  }

  private evaluateOpenLootboxes(input: {
    isOwner: boolean;
    tier: number;
    requestedAmount: number;
    varianceMode: number;
    quote: readonly [number, number, number, number];
  }): ValidActionEntry {
    if (!input.isOwner) {
      return ownerFailure("open_lootboxes_max");
    }
    if (input.quote[3] === 0) {
      return invalid("open_lootboxes_max", "PRECHECK_INSUFFICIENT_LOOTBOX_CREDITS", "No openable lootbox credits", {
        suggestedParams: {
          availableTotal: input.quote[0],
          availableBound: input.quote[1],
          availableGeneric: input.quote[2]
        }
      });
    }
    return valid("open_lootboxes_max", "Lootbox credits available", {
      tier: input.tier,
      maxAmount: Math.min(input.requestedAmount, input.quote[3]),
      varianceMode: input.varianceMode
    });
  }

  private evaluateGearAction(input: {
    isOwner: boolean;
    runActive: boolean;
    actionType: string;
  }): ValidActionEntry {
    if (!input.isOwner) {
      return ownerFailure(input.actionType);
    }
    if (input.runActive) {
      return invalid(input.actionType, "CHAIN_GEAR_LOCKED_DURING_RUN", "Gear actions are locked during active runs");
    }
    return valid(input.actionType, "Gear action available");
  }

  private evaluatePremiumPurchase(input: {
    isOwner: boolean;
    difficulty: number;
    amount: number;
    quote: readonly [bigint, bigint];
  }): ValidActionEntry {
    if (!input.isOwner) {
      return ownerFailure("buy_premium_lootboxes");
    }
    return valid("buy_premium_lootboxes", "Premium purchase quote available", {
      difficulty: input.difficulty,
      amount: input.amount,
      requiredValueWei: input.quote[0].toString(),
      estimatedMmoCostWei: input.quote[1].toString()
    });
  }

  private evaluateRevealWindow(revealWindow: {
    commitId: number;
    currentBlock: number;
    startBlock: number;
    endBlock: number;
    canReveal: boolean;
    expired: boolean;
    resolved: boolean;
  }): ValidActionEntry {
    if (revealWindow.resolved) {
      return invalid("reveal_pending_commit", "CHAIN_COMMIT_RESOLVED", "Commit already resolved");
    }
    if (revealWindow.expired) {
      return invalid("reveal_pending_commit", "CHAIN_REVEAL_EXPIRED", "Reveal window expired");
    }
    if (!revealWindow.canReveal) {
      return invalid(
        "reveal_pending_commit",
        "CHAIN_REVEAL_TOO_EARLY",
        `Reveal available at block ${revealWindow.startBlock} (current ${revealWindow.currentBlock})`,
        { retryable: true }
      );
    }
    return valid("reveal_pending_commit", "Reveal window is open", {
      commitId: revealWindow.commitId
    });
  }
}

function ownerFailure(actionType: string): ValidActionEntry {
  return invalid(actionType, "PRECHECK_ONLY_CHARACTER_OWNER", "Signer does not own target character");
}

function valid(actionType: string, reason: string, suggestedParams?: Record<string, unknown>): ValidActionEntry {
  return {
    actionType,
    valid: true,
    code: "PRECHECK_OK",
    reason,
    retryable: false,
    suggestedParams
  };
}

function invalid(
  actionType: string,
  code: string,
  reason: string,
  options: {
    retryable?: boolean;
    suggestedParams?: Record<string, unknown>;
  } = {}
): ValidActionEntry {
  return {
    actionType,
    valid: false,
    code,
    reason,
    retryable: options.retryable ?? false,
    suggestedParams: options.suggestedParams
  };
}
