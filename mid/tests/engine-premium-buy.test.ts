import { describe, expect, it, vi } from "vitest";
import type { Hex } from "viem";
import { ActionEngine } from "../src/action-engine/engine.js";

const OWNER = "0x1111111111111111111111111111111111111111" as Hex;
const BUY_TX = `0x${"3".repeat(64)}` as Hex;

describe("action engine premium purchase", () => {
  it("forwards quotePremiumPurchase ethCost as payable value to buyPremiumLootboxes", async () => {
    const chain = {
      account: { address: OWNER },
      readGameWorld: vi.fn(async (functionName: string) => {
        if (functionName === "ownerOfCharacter") {
          return OWNER;
        }
        throw new Error(`unexpected_read_gameworld:${functionName}`);
      }),
      readFeeVault: vi.fn(async (functionName: string) => {
        if (functionName === "quotePremiumPurchase") {
          return [123n, 999n] as const;
        }
        throw new Error(`unexpected_read_feevault:${functionName}`);
      }),
      writeFeeVault: vi.fn(async (functionName: string, _args: unknown[], options?: { value?: bigint }) => {
        if (functionName !== "buyPremiumLootboxes") {
          throw new Error(`unexpected_write_feevault:${functionName}`);
        }
        if (options?.value !== 123n) {
          throw new Error("InsufficientEth");
        }
        return BUY_TX;
      }),
      waitForReceipt: vi.fn(async (hash: Hex) => ({
        blockNumber: 100n,
        logs: [],
        transactionHash: hash
      })),
      decodeLog: vi.fn(() => undefined)
    } as any;

    const engine = new ActionEngine(chain);
    const result = await engine.execute({
      type: "buy_premium_lootboxes",
      characterId: 7,
      difficulty: 3,
      amount: 5
    } as any);

    expect(result.code).toBe("PREMIUM_LOOTBOXES_PURCHASED");
    expect(chain.writeFeeVault).toHaveBeenCalledWith(
      "buyPremiumLootboxes",
      [7n, 3, 5],
      { value: 123n }
    );
    expect(chain.readFeeVault).toHaveBeenCalledWith("quotePremiumPurchase", [7n, 3, 5]);
  });
});
