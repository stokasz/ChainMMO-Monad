import { describe, expect, it, vi } from "vitest";
import type { Hex } from "viem";
import { ActionEngine } from "../src/action-engine/engine.js";

const OWNER = "0x1111111111111111111111111111111111111111" as Hex;
const ITEM_APPROVE_TX = `0x${"5".repeat(64)}` as Hex;
const MMO_APPROVE_TX = `0x${"6".repeat(64)}` as Hex;
const TRADE_TX = `0x${"7".repeat(64)}` as Hex;

function receipt(hash: Hex) {
  return {
    blockNumber: 100n,
    logs: [],
    transactionHash: hash
  } as any;
}

describe("action engine trade escrow", () => {
  it("forwards createFee and auto-approves items for create_trade_offer", async () => {
    const chain = {
      account: { address: OWNER },
      addresses: { tradeEscrow: "0x2222222222222222222222222222222222222222" as Hex },
      readTradeEscrow: vi.fn(async (functionName: string) => {
        if (functionName === "createFee") return 77n;
        throw new Error(`unexpected_read_trade:${functionName}`);
      }),
      readItemsApprovalForAll: vi.fn(async () => false),
      writeItemsSetApprovalForAll: vi.fn(async () => ITEM_APPROVE_TX),
      writeTradeEscrow: vi.fn(async () => TRADE_TX),
      waitForReceipt: vi.fn(async (hash: Hex) => receipt(hash)),
      decodeLog: vi.fn(() => undefined)
    } as any;

    const engine = new ActionEngine(chain);
    const result = await engine.execute({
      type: "create_trade_offer",
      offeredItemIds: [11, 22],
      requestedItemIds: [33],
      requestedMmo: "0"
    } as any);

    expect(result.code).toBe("TRADE_OFFER_CREATED");
    expect(chain.writeItemsSetApprovalForAll).toHaveBeenCalledWith(chain.addresses.tradeEscrow, true);
    expect(chain.writeTradeEscrow).toHaveBeenCalledWith(
      "createOffer",
      [[11n, 22n], [33n], 0n],
      { value: 77n }
    );
  });

  it("auto-approves MMO before fulfill_trade_offer when offer requests MMO", async () => {
    const chain = {
      account: { address: OWNER },
      addresses: { tradeEscrow: "0x2222222222222222222222222222222222222222" as Hex },
      readTradeEscrow: vi.fn(async (functionName: string) => {
        if (functionName === "offers") {
          return ["0x3333333333333333333333333333333333333333", 500n, 9999999999n, true] as const;
        }
        throw new Error(`unexpected_read_trade:${functionName}`);
      }),
      readItemsApprovalForAll: vi.fn(async () => true),
      readMmoAllowance: vi.fn(async () => 0n),
      writeMmoApprove: vi.fn(async () => MMO_APPROVE_TX),
      writeTradeEscrow: vi.fn(async () => TRADE_TX),
      waitForReceipt: vi.fn(async (hash: Hex) => receipt(hash)),
      decodeLog: vi.fn(() => undefined)
    } as any;

    const engine = new ActionEngine(chain);
    const result = await engine.execute({
      type: "fulfill_trade_offer",
      offerId: 9
    } as any);

    expect(result.code).toBe("TRADE_OFFER_FULFILLED");
    expect(chain.writeMmoApprove).toHaveBeenCalled();
    expect(chain.writeTradeEscrow).toHaveBeenCalledWith("fulfillOffer", [9n]);
  });
});
