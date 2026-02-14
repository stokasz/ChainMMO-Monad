import { describe, expect, it, vi } from "vitest";
import { AgentReadModel } from "../src/agent-api/read-model.js";

function stubEnv(): any {
  return {
    CHAIN_ID: 10143,
    GAMEWORLD_ADDRESS: "0x0000000000000000000000000000000000000001",
    FEEVAULT_ADDRESS: "0x0000000000000000000000000000000000000002",
    ITEMS_ADDRESS: "0x0000000000000000000000000000000000000003",
    MMO_ADDRESS: "0x0000000000000000000000000000000000000004",
    TRADE_ESCROW_ADDRESS: "0x0000000000000000000000000000000000000005",
    RFQ_MARKET_ADDRESS: "0x0000000000000000000000000000000000000006",
    MMODISTRIBUTOR_ADDRESS: "0x0000000000000000000000000000000000000007",
    X_PROFILE_URL: "https://x.com/stokasz"
  };
}

describe("rewards summary", () => {
  it("computes avg feesForPlayers from recent finalized epochs", async () => {
    const db = {
      query: vi.fn(async (sql: string, params?: any[]) => {
        if (sql.includes("FROM leaderboard_epoch_state")) {
          expect(params).toEqual([3]);
          return [
            { epoch_id: "9", fees_for_players: "300", updated_block: "900" },
            { epoch_id: "8", fees_for_players: "0", updated_block: "800" },
            { epoch_id: "7", fees_for_players: "600", updated_block: "700" }
          ];
        }
        throw new Error(`unexpected_query:${sql}`);
      })
    } as any;

    const chain = {
      getBlockNumber: vi.fn(async () => 12_345n),
      publicClient: { getBlock: vi.fn(async () => ({ timestamp: 1_700_000_000n })) },
      readFeeVault: vi.fn(async () => 0n)
    } as any;
    const readModel = new AgentReadModel(stubEnv(), db, chain);
    const summary = await readModel.getRewardsSummary({ windowEpochs: 3 });

    expect(summary.chainId).toBe(10143);
    expect(summary.windowEpochs).toBe(3);
    expect(summary.sampleEpochs).toBe(3);
    expect(summary.avgFeesForPlayersWei).toBe("300");
    expect(summary.latestFinalizedEpoch).toEqual({ epochId: 9, feesForPlayersWei: "300", updatedBlock: 900 });
    expect(summary.currentEpoch).toEqual({
      epochId: Math.floor(1_700_000_000 / 3600),
      feesTotalWei: "0",
      feesForPlayersWei: "0",
      headBlock: 12_345
    });
  });

  it("returns zeroed summary when there are no finalized epochs yet", async () => {
    const db = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("FROM leaderboard_epoch_state")) {
          return [];
        }
        throw new Error(`unexpected_query:${sql}`);
      })
    } as any;

    const chain = {
      getBlockNumber: vi.fn(async () => 12_345n),
      publicClient: { getBlock: vi.fn(async () => ({ timestamp: 1_700_000_000n })) },
      readFeeVault: vi.fn(async (_fn: string, args: any[]) => {
        expect(args).toEqual([Math.floor(1_700_000_000 / 3600)]);
        return 1_000n;
      })
    } as any;
    const readModel = new AgentReadModel(stubEnv(), db, chain);
    const summary = await readModel.getRewardsSummary({ windowEpochs: 5 });

    expect(summary.chainId).toBe(10143);
    expect(summary.windowEpochs).toBe(5);
    expect(summary.sampleEpochs).toBe(0);
    expect(summary.avgFeesForPlayersWei).toBe("0");
    expect(summary.latestFinalizedEpoch).toBeNull();
    expect(summary.currentEpoch).toEqual({
      epochId: Math.floor(1_700_000_000 / 3600),
      feesTotalWei: "1000",
      feesForPlayersWei: "900",
      headBlock: 12_345
    });
  });
});
