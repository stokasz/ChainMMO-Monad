import { describe, expect, it, vi } from "vitest";
import type { Hex } from "viem";
import { ActionEngine } from "../src/action-engine/engine.js";

const OWNER = "0x1111111111111111111111111111111111111111";
const COMMIT_TX = `0x${"1".repeat(64)}` as Hex;
const REVEAL_TX = `0x${"2".repeat(64)}` as Hex;
const HASH = `0x${"a".repeat(64)}` as Hex;

function buildHarness(commitFee = 123n) {
  const readGameWorld = vi.fn(async (functionName: string) => {
    switch (functionName) {
      case "ownerOfCharacter":
        return OWNER;
      case "getRunState":
        return [false, 0, 0, 0, 0, 0, 0, 0, 0, 0] as const;
      case "equippedSlotCount":
        return 8;
      case "requiredEquippedSlots":
        return 1;
      case "quoteOpenLootboxes":
        return [4, 4, 0, 2] as const;
      case "hashDungeonRun":
      case "hashLootboxOpen":
        return HASH;
      case "commitFee":
        return commitFee;
      case "nextCommitId":
        return 2n;
      default:
        throw new Error(`unexpected_read:${functionName}`);
    }
  });

  const writeGameWorld = vi.fn(
    async (functionName: string, _args: unknown[], options?: { value?: bigint }) => {
      if (functionName === "commitActionWithVariance") {
        if (options?.value !== commitFee) {
          throw new Error("InsufficientCommitFee");
        }
        return COMMIT_TX;
      }
      if (functionName === "revealStartDungeon" || functionName === "revealOpenLootboxesMax") {
        return REVEAL_TX;
      }
      throw new Error(`unexpected_write:${functionName}`);
    }
  );

  const waitForReceipt = vi.fn(async (hash: Hex) => ({
    blockNumber: 100n,
    logs: [],
    transactionHash: hash
  }));

  const chain = {
    account: { address: OWNER as Hex },
    readGameWorld,
    writeGameWorld,
    waitForReceipt,
    getBlockNumber: vi.fn(async () => 100n),
    isLocalChain: vi.fn(() => true),
    mineBlocks: vi.fn(async () => {}),
    decodeLog: vi.fn(() => undefined)
  } as any;

  return {
    engine: new ActionEngine(chain),
    readGameWorld,
    writeGameWorld
  };
}

describe("action engine commit fee forwarding", () => {
  it("forwards commitFee() as value for start_dungeon commit", async () => {
    const commitFee = 9_999n;
    const { engine, writeGameWorld } = buildHarness(commitFee);

    const result = await engine.execute({
      type: "start_dungeon",
      characterId: 7,
      difficulty: 0,
      dungeonLevel: 1,
      varianceMode: 1
    });

    expect(result.code).toBe("DUNGEON_STARTED");
    expect(writeGameWorld).toHaveBeenCalledWith(
      "commitActionWithVariance",
      expect.any(Array),
      { value: commitFee }
    );
  });

  it("forwards commitFee() as value for open_lootboxes_max commit", async () => {
    const commitFee = 7_777n;
    const { engine, writeGameWorld } = buildHarness(commitFee);

    const result = await engine.execute({
      type: "open_lootboxes_max",
      characterId: 7,
      tier: 2,
      maxAmount: 5,
      varianceMode: 1
    });

    expect(result.code).toBe("LOOTBOX_OPEN_MAX_RESOLVED");
    expect(writeGameWorld).toHaveBeenCalledWith(
      "commitActionWithVariance",
      expect.any(Array),
      { value: commitFee }
    );
  });
});
