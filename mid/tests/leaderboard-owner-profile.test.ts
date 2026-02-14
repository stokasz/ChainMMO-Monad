import { describe, expect, it, vi } from "vitest";
import { AgentReadModel } from "../src/agent-api/read-model.js";

describe("leaderboard ownerProfile", () => {
  it("includes ownerProfile when wallet_x_identity is present", async () => {
    const env = {
      CHAIN_ID: 10143,
      GAMEWORLD_ADDRESS: "0x0000000000000000000000000000000000000001",
      FEEVAULT_ADDRESS: "0x0000000000000000000000000000000000000002",
      ITEMS_ADDRESS: "0x0000000000000000000000000000000000000003",
      MMO_ADDRESS: "0x0000000000000000000000000000000000000004",
      TRADE_ESCROW_ADDRESS: "0x0000000000000000000000000000000000000005",
      RFQ_MARKET_ADDRESS: "0x0000000000000000000000000000000000000006",
      MMODISTRIBUTOR_ADDRESS: "0x0000000000000000000000000000000000000007",
      X_PROFILE_URL: "https://x.com/chainmmo"
    } as any;

    const db = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("FROM indexer_cursor")) {
          return [{ last_processed_block: "0" }];
        }
        if (sql.includes("COALESCE(MAX(updated_block)")) {
          return [{ updated_block: "0" }];
        }
        if (sql.includes("LEFT JOIN wallet_x_identity")) {
          return [
            {
              character_id: "1",
              owner: "0x1111111111111111111111111111111111111111",
              best_level: 10,
              last_level_up_epoch: "1",
              x_user_id: "123",
              x_username: "alice",
              rank: "1",
              total: "1"
            }
          ];
        }
        throw new Error(`unexpected_query:${sql}`);
      })
    } as any;

    const chain = {} as any;

    const readModel = new AgentReadModel(env, db, chain);
    const page = await readModel.getLiveLeaderboard({ limit: 10 });
    expect(page.items?.[0]).toEqual(
      expect.objectContaining({
        owner: "0x1111111111111111111111111111111111111111",
        ownerProfile: { xUserId: "123", xUsername: "alice" }
      })
    );
  });
});

