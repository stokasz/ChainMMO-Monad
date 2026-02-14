import { describe, expect, it, vi } from "vitest";
import { AgentReadModel } from "../src/agent-api/read-model.js";

const env = {
  CHAIN_ID: 10143,
  GAMEWORLD_ADDRESS: "0x0000000000000000000000000000000000000001",
  FEEVAULT_ADDRESS: "0x0000000000000000000000000000000000000002",
  ITEMS_ADDRESS: "0x0000000000000000000000000000000000000003",
  MMO_ADDRESS: "0x0000000000000000000000000000000000000004",
  TRADE_ESCROW_ADDRESS: "0x0000000000000000000000000000000000000005",
  RFQ_MARKET_ADDRESS: "0x0000000000000000000000000000000000000006",
  MMODISTRIBUTOR_ADDRESS: "0x0000000000000000000000000000000000000007",
  X_PROFILE_URL: "https://x.com/stokasz"
} as any;

describe("commit/reveal safety reads", () => {
  it("returns commit fee in wei", async () => {
    const chain = {
      readGameWorld: vi.fn(async (functionName: string) => {
        if (functionName === "commitFee") return 123456789n;
        throw new Error(`unexpected_read:${functionName}`);
      })
    } as any;

    const readModel = new AgentReadModel(env, {} as any, chain);
    const result = await readModel.getCommitFee();
    expect(result).toEqual({
      chainId: 10143,
      commitFeeWei: "123456789"
    });
  });

  it("returns reveal window + current block for a commit", async () => {
    const chain = {
      readGameWorld: vi.fn(async (functionName: string, args: unknown[]) => {
        if (functionName === "revealWindow") {
          expect(args).toEqual([99n]);
          return [102n, 356n, true, false, false] as const;
        }
        throw new Error(`unexpected_read:${functionName}`);
      }),
      getBlockNumber: vi.fn(async () => 120n)
    } as any;

    const readModel = new AgentReadModel(env, {} as any, chain);
    const result = await readModel.getCommitWindow(99);

    expect(result).toEqual({
      commitId: 99,
      currentBlock: 120,
      startBlock: 102,
      endBlock: 356,
      canReveal: true,
      expired: false,
      resolved: false
    });
  });

  it("returns potion balance for character/type/tier", async () => {
    const chain = {
      readGameWorld: vi.fn(async (functionName: string, args: unknown[]) => {
        if (functionName === "potionBalance") {
          expect(args).toEqual([7n, 1, 2]);
          return 3;
        }
        throw new Error(`unexpected_read:${functionName}`);
      })
    } as any;

    const readModel = new AgentReadModel(env, {} as any, chain);
    const result = await readModel.getPotionBalance(7, 1, 2);

    expect(result).toEqual({
      characterId: 7,
      potionType: 1,
      potionTier: 2,
      balance: 3
    });
  });
});
