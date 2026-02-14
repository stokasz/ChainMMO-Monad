import { describe, expect, it, vi } from "vitest";
import { AgentReadModel } from "../src/agent-api/read-model.js";

describe("diagnostics", () => {
  it("reports indexer cursor, leaderboard state, and chain head", async () => {
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
          return [
            {
              name: "chainmmo_main",
              last_processed_block: "120",
              last_processed_log_index: 7,
              updated_at: "2026-02-10T00:00:00.000Z"
            }
          ];
        }
        if (sql.includes("COALESCE(MAX(updated_block)")) {
          return [{ updated_block: "111" }];
        }
        throw new Error(`unexpected_query:${sql}`);
      })
    } as any;

    const chain = {
      getBlockNumber: vi.fn(async () => 130n)
    } as any;

    const readModel = new AgentReadModel(env, db, chain);
    const d = await readModel.getDiagnostics();

    expect(d.chainId).toBe(10143);
    expect(d.indexer.cursor.lastProcessedBlock).toBe(120);
    expect(d.indexer.chainHeadBlock).toBe(130);
    expect(d.indexer.chainLagBlocks).toBe(10);
    expect(d.leaderboard.updatedAtBlock).toBe(111);
    expect(d.leaderboard.stateLagBlocks).toBe(9);
  });

  it("does not fail if chain head cannot be fetched", async () => {
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
          return [
            {
              name: "chainmmo_main",
              last_processed_block: "120",
              last_processed_log_index: 7,
              updated_at: "2026-02-10T00:00:00.000Z"
            }
          ];
        }
        if (sql.includes("COALESCE(MAX(updated_block)")) {
          return [{ updated_block: "111" }];
        }
        throw new Error(`unexpected_query:${sql}`);
      })
    } as any;

    const chain = {
      getBlockNumber: vi.fn(async () => {
        throw new Error("rpc_down");
      })
    } as any;

    const readModel = new AgentReadModel(env, db, chain);
    const d = await readModel.getDiagnostics();

    expect(d.indexer.chainHeadBlock).toBeNull();
    expect(d.indexer.chainLagBlocks).toBeNull();
    expect(d.leaderboard.stateLagBlocks).toBe(9);
  });
});
