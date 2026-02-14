import { describe, expect, it, vi } from "vitest";
import type { Hex } from "viem";
import { ActionPreflight } from "../src/action-engine/preflight.js";

const OWNER = "0x1111111111111111111111111111111111111111" as Hex;

function createPreflight(
  readGameWorld: (functionName: string, args?: unknown[]) => Promise<unknown>,
  extra: {
    getBlockNumber?: () => Promise<bigint>;
    readFeeVault?: (functionName: string, args?: unknown[]) => Promise<unknown>;
    readTradeEscrow?: (functionName: string, args?: unknown[]) => Promise<unknown>;
    allowDeployerClaims?: boolean;
  } = {}
) {
  const chain = {
    account: { address: OWNER },
    readGameWorld: vi.fn(readGameWorld),
    readFeeVault: vi.fn(extra.readFeeVault ?? (async () => {
      throw new Error("unexpected_read_feevault");
    })),
    readTradeEscrow: vi.fn(extra.readTradeEscrow ?? (async () => {
      throw new Error("unexpected_read_trade_escrow");
    })),
    readRfq: vi.fn(async () => {
      throw new Error("unexpected_read_rfq");
    }),
    getBlockNumber: vi.fn(extra.getBlockNumber ?? (async () => 200n))
  } as any;

  return new ActionPreflight(chain, { allowDeployerClaims: extra.allowDeployerClaims });
}

describe("action preflight", () => {
  it("returns RUN_ALREADY_ACTIVE for start_dungeon when run is active", async () => {
    const preflight = createPreflight(async (functionName) => {
      if (functionName === "commitFee") return 777n;
      if (functionName === "ownerOfCharacter") return OWNER;
      if (functionName === "getRunState") return [true, 0, 0, 0, 0, 0, 0, 0, 20, 2] as const;
      if (functionName === "equippedSlotCount") return 8;
      if (functionName === "requiredEquippedSlots") return 4;
      throw new Error(`unexpected_read:${functionName}`);
    });

    const result = await preflight.evaluate({
      type: "start_dungeon",
      characterId: 7,
      difficulty: 0,
      dungeonLevel: 20,
      varianceMode: 1
    });

    expect(result.willSucceed).toBe(false);
    expect(result.code).toBe("PRECHECK_RUN_ALREADY_ACTIVE");
    expect(result.requiredValueWei).toBe("777");
    expect(result.suggestedNextAction).toBe("next_room");
  });

  it("returns INSUFFICIENT_EQUIPPED_SLOTS for start_dungeon", async () => {
    const preflight = createPreflight(async (functionName) => {
      if (functionName === "commitFee") return 5n;
      if (functionName === "ownerOfCharacter") return OWNER;
      if (functionName === "getRunState") return [false, 0, 0, 0, 0, 0, 0, 0, 6, 1] as const;
      if (functionName === "equippedSlotCount") return 1;
      if (functionName === "requiredEquippedSlots") return 4;
      throw new Error(`unexpected_read:${functionName}`);
    });

    const result = await preflight.evaluate({
      type: "start_dungeon",
      characterId: 9,
      difficulty: 0,
      dungeonLevel: 6,
      varianceMode: 1
    });

    expect(result.willSucceed).toBe(false);
    expect(result.code).toBe("PRECHECK_INSUFFICIENT_EQUIPPED_SLOTS");
    expect(result.suggestedNextAction).toBe("equip_best");
  });

  it("returns RUN_NOT_ACTIVE for next_room without active run", async () => {
    const preflight = createPreflight(async (functionName) => {
      if (functionName === "ownerOfCharacter") return OWNER;
      if (functionName === "getRunState") return [false, 0, 0, 0, 0, 0, 0, 0, 0, 0] as const;
      throw new Error(`unexpected_read:${functionName}`);
    });

    const result = await preflight.evaluate({
      type: "next_room",
      characterId: 77,
      potionChoice: 0,
      abilityChoice: 0
    });

    expect(result.willSucceed).toBe(false);
    expect(result.code).toBe("PRECHECK_RUN_NOT_ACTIVE");
    expect(result.suggestedNextAction).toBe("start_dungeon");
  });

  it("returns POTION_UNAVAILABLE when potion choices exceed charges", async () => {
    const preflight = createPreflight(async (functionName) => {
      if (functionName === "ownerOfCharacter") return OWNER;
      if (functionName === "getRunState") return [true, 1, 0, 100, 100, 0, 1, 0, 8, 1] as const;
      throw new Error(`unexpected_read:${functionName}`);
    });

    const result = await preflight.evaluate({
      type: "next_room",
      characterId: 77,
      potionChoice: 1,
      abilityChoice: 0
    });

    expect(result.willSucceed).toBe(false);
    expect(result.code).toBe("PRECHECK_POTION_UNAVAILABLE");
  });

  it("returns GEAR_LOCKED_DURING_RUN for gear changes during active run", async () => {
    const preflight = createPreflight(async (functionName) => {
      if (functionName === "ownerOfCharacter") return OWNER;
      if (functionName === "getRunState") return [true] as const;
      throw new Error(`unexpected_read:${functionName}`);
    });

    const result = await preflight.evaluate({
      type: "equip_best",
      characterId: 77,
      objective: "balanced"
    });

    expect(result.willSucceed).toBe(false);
    expect(result.code).toBe("CHAIN_GEAR_LOCKED_DURING_RUN");
  });

  it("returns required payable value for buy_premium_lootboxes", async () => {
    const preflight = createPreflight(
      async (functionName) => {
        if (functionName === "ownerOfCharacter") return OWNER;
        throw new Error(`unexpected_read:${functionName}`);
      },
      {
        readFeeVault: async (functionName) => {
          if (functionName === "quotePremiumPurchase") return [42n, 17n] as const;
          throw new Error(`unexpected_feevault_read:${functionName}`);
        }
      }
    );

    const result = await preflight.evaluate({
      type: "buy_premium_lootboxes",
      characterId: 77,
      difficulty: 2,
      amount: 3
    } as any);

    expect(result.willSucceed).toBe(true);
    expect(result.requiredValueWei).toBe("42");
    expect(result.suggestedParams).toMatchObject({
      amount: 3,
      mmoCostWei: "17"
    });
  });

  it("rejects claim_player when epoch is not finalized", async () => {
    const preflight = createPreflight(
      async (functionName) => {
        if (functionName === "ownerOfCharacter") return OWNER;
        throw new Error(`unexpected_read:${functionName}`);
      },
      {
        readFeeVault: async (functionName) => {
          if (functionName === "epochSnapshot") return [0n, 0n, 0, 0n, false] as const;
          if (functionName === "playerClaimed") return false;
          throw new Error(`unexpected_feevault_read:${functionName}`);
        }
      }
    );

    const result = await preflight.evaluate({
      type: "claim_player",
      epochId: 4,
      characterId: 77
    } as any);

    expect(result.willSucceed).toBe(false);
    expect(result.code).toBe("CHAIN_EPOCH_NOT_FINALIZED");
  });

  it("rejects claim_deployer when deployer claim policy is disabled", async () => {
    const preflight = createPreflight(async () => {
      throw new Error("unexpected_read");
    });

    const result = await preflight.evaluate({
      type: "claim_deployer",
      epochId: 4
    } as any);

    expect(result.willSucceed).toBe(false);
    expect(result.code).toBe("POLICY_DEPLOYER_CLAIM_DISABLED");
  });

  it("rejects cancel_expired_trade_offer before expiry", async () => {
    const preflight = createPreflight(
      async () => {
        throw new Error("unexpected_read");
      },
      {
        readTradeEscrow: async (functionName) => {
          if (functionName === "offers") {
            return [OWNER, 0n, BigInt(Math.floor(Date.now() / 1000) + 3600), true] as const;
          }
          throw new Error(`unexpected_trade_read:${functionName}`);
        }
      }
    );

    const result = await preflight.evaluate({
      type: "cancel_expired_trade_offer",
      offerId: 44
    } as any);

    expect(result.willSucceed).toBe(false);
    expect(result.code).toBe("CHAIN_OFFER_NOT_EXPIRED");
    expect(result.retryable).toBe(true);
  });

  it("returns REVEAL_TOO_EARLY when commit window has not opened", async () => {
    const preflight = createPreflight(
      async (functionName) => {
        if (functionName === "revealWindow") return [220n, 476n, false, false, false] as const;
        throw new Error(`unexpected_read:${functionName}`);
      },
      {
        getBlockNumber: async () => 210n
      }
    );

    const result = await preflight.evaluate(
      {
        type: "start_dungeon",
        characterId: 7,
        difficulty: 0,
        dungeonLevel: 1,
        varianceMode: 1
      },
      { commitId: 123 }
    );

    expect(result.willSucceed).toBe(false);
    expect(result.code).toBe("CHAIN_REVEAL_TOO_EARLY");
    expect(result.retryable).toBe(true);
  });

  it("returns REVEAL_EXPIRED when commit window elapsed", async () => {
    const preflight = createPreflight(async (functionName) => {
      if (functionName === "revealWindow") return [220n, 476n, false, true, false] as const;
      throw new Error(`unexpected_read:${functionName}`);
    });

    const result = await preflight.evaluate(
      {
        type: "open_lootboxes_max",
        characterId: 7,
        tier: 2,
        maxAmount: 1,
        varianceMode: 1
      },
      { commitId: 123 }
    );

    expect(result.willSucceed).toBe(false);
    expect(result.code).toBe("CHAIN_REVEAL_EXPIRED");
  });
});
