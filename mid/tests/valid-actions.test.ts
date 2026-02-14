import { describe, expect, it, vi } from "vitest";
import type { Hex } from "viem";
import { ActionValidMenu } from "../src/action-engine/valid-actions.js";

const OWNER = "0x1111111111111111111111111111111111111111" as Hex;

function createMenu(
  readGameWorld: (functionName: string, args?: unknown[]) => Promise<unknown>,
  readFeeVault?: (functionName: string, args?: unknown[]) => Promise<unknown>
) {
  const chain = {
    account: { address: OWNER },
    readGameWorld: vi.fn(readGameWorld),
    readFeeVault: vi.fn(readFeeVault ?? (async () => [0n, 0n] as const)),
    getBlockNumber: vi.fn(async () => 200n)
  } as any;
  return new ActionValidMenu(chain);
}

describe("action valid menu", () => {
  it("marks start_dungeon invalid when slots are insufficient", async () => {
    const menu = createMenu(async (functionName) => {
      if (functionName === "ownerOfCharacter") return OWNER;
      if (functionName === "getRunState") return [false, 0, 0, 100, 100, 1, 1, 1, 1, 1] as const;
      if (functionName === "characterBestLevel") return 12;
      if (functionName === "equippedSlotCount") return 1;
      if (functionName === "requiredEquippedSlots") return 4;
      if (functionName === "quoteOpenLootboxes") return [0, 0, 0, 0] as const;
      throw new Error(`unexpected_read:${functionName}`);
    });

    const result = await menu.getMenu({ characterId: 7 });

    const startDungeon = result.invalidActions.find((entry) => entry.actionType === "start_dungeon");
    expect(startDungeon?.code).toBe("PRECHECK_INSUFFICIENT_EQUIPPED_SLOTS");
  });

  it("marks gear actions invalid during active run and reveal too early", async () => {
    const menu = createMenu(async (functionName) => {
      if (functionName === "ownerOfCharacter") return OWNER;
      if (functionName === "getRunState") return [true, 2, 1, 90, 80, 0, 1, 0, 22, 2] as const;
      if (functionName === "characterBestLevel") return 21;
      if (functionName === "equippedSlotCount") return 8;
      if (functionName === "requiredEquippedSlots") return 8;
      if (functionName === "quoteOpenLootboxes") return [5, 5, 0, 2] as const;
      if (functionName === "revealWindow") return [220n, 476n, false, false, false] as const;
      throw new Error(`unexpected_read:${functionName}`);
    });

    const result = await menu.getMenu({
      characterId: 7,
      commitId: 99
    });

    const equipBest = result.invalidActions.find((entry) => entry.actionType === "equip_best");
    expect(equipBest?.code).toBe("CHAIN_GEAR_LOCKED_DURING_RUN");

    const reveal = result.invalidActions.find((entry) => entry.actionType === "reveal_pending_commit");
    expect(reveal?.code).toBe("CHAIN_REVEAL_TOO_EARLY");
    expect(reveal?.retryable).toBe(true);
  });

  it("surfaces buy_premium_lootboxes with quote-derived costs", async () => {
    const menu = createMenu(
      async (functionName) => {
        if (functionName === "ownerOfCharacter") return OWNER;
        if (functionName === "getRunState") return [false, 0, 0, 100, 100, 1, 1, 1, 7, 1] as const;
        if (functionName === "characterBestLevel") return 6;
        if (functionName === "equippedSlotCount") return 4;
        if (functionName === "requiredEquippedSlots") return 4;
        if (functionName === "quoteOpenLootboxes") return [0, 0, 0, 0] as const;
        throw new Error(`unexpected_read:${functionName}`);
      },
      async (functionName) => {
        if (functionName === "quotePremiumPurchase") return [55n, 8n] as const;
        throw new Error(`unexpected_feevault_read:${functionName}`);
      }
    );

    const result = await menu.getMenu({ characterId: 7, maxAmount: 2, difficulty: 1 });
    const premium = result.validActions.find((entry) => entry.actionType === "buy_premium_lootboxes");

    expect(premium).toBeDefined();
    expect(premium?.suggestedParams).toMatchObject({
      amount: 2,
      requiredValueWei: "55",
      estimatedMmoCostWei: "8"
    });
  });
});
