import { describe, expect, it, vi } from "vitest";
import { AgentReadModel } from "../src/agent-api/read-model.js";

describe("leaderboard read path", () => {
  it("does not require an RPC call to serve leaderboard pages", async () => {
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

    const db = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("FROM indexer_cursor")) {
          return [{ last_processed_block: "0" }];
        }
        if (sql.includes("COALESCE(MAX(updated_block)")) {
          return [{ updated_block: "0" }];
        }
        // Live leaderboard query.
        if (sql.includes("FROM (\n         SELECT")) {
          return [];
        }
        throw new Error(`unexpected_query:${sql}`);
      })
    } as any;

    const chain = {
      getBlockNumber: vi.fn(async () => {
        throw new Error("rpc_should_not_be_required");
      })
    } as any;

    const readModel = new AgentReadModel(env, db, chain);
    await expect(readModel.getLiveLeaderboard({ limit: 10 })).resolves.toBeTruthy();
    expect(chain.getBlockNumber).not.toHaveBeenCalled();
  });
});
