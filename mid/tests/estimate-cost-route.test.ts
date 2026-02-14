import { describe, expect, it, vi } from "vitest";
import { buildApiServer } from "../src/agent-api/server.js";

describe("POST /agent/estimate-cost", () => {
  it("returns cost estimate for valid action payload", async () => {
    const estimator = {
      estimate: vi.fn(async () => ({
        actionType: "start_dungeon",
        code: "ESTIMATE_OK",
        reason: "Estimated via eth_estimateGas",
        estimatedGas: "12345",
        maxFeePerGas: "99",
        estimatedTxCostWei: "1222155",
        requiredValueWei: "7",
        totalEstimatedCostWei: "1222162",
        signerNativeBalanceWei: "999999999",
        canAfford: true
      }))
    } as any;

    const app = await buildApiServer({
      env: {} as any,
      metrics: {} as any,
      readModel: {} as any,
      signerAddress: "0x1111111111111111111111111111111111111111",
      actionRepository: {} as any,
      actionCostEstimator: estimator
    });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/agent/estimate-cost",
        payload: {
          type: "start_dungeon",
          characterId: 7,
          difficulty: 0,
          dungeonLevel: 1,
          varianceMode: 1
        }
      });

      expect(response.statusCode).toBe(200);
      expect(estimator.estimate).toHaveBeenCalledWith(
        expect.objectContaining({ type: "start_dungeon" })
      );
      const body = JSON.parse(response.body) as { code: string; canAfford: boolean };
      expect(body.code).toBe("ESTIMATE_OK");
      expect(body.canAfford).toBe(true);
    } finally {
      await app.close();
    }
  });

  it("rejects invalid payload and enforces api key", async () => {
    const app = await buildApiServer({
      env: {
        API_KEY: "secret"
      } as any,
      metrics: {} as any,
      readModel: {} as any,
      signerAddress: "0x1111111111111111111111111111111111111111",
      actionRepository: {} as any,
      actionCostEstimator: { estimate: vi.fn(async () => ({})) } as any
    });

    try {
      const unauthorized = await app.inject({
        method: "POST",
        url: "/agent/estimate-cost",
        payload: {
          type: "create_character",
          race: 0,
          classType: 0,
          name: "x"
        }
      });
      expect(unauthorized.statusCode).toBe(401);

      const invalid = await app.inject({
        method: "POST",
        url: "/agent/estimate-cost",
        headers: { "x-api-key": "secret" },
        payload: {
          type: "open_lootboxes_max",
          characterId: 7,
          tier: 1,
          maxAmount: 0
        }
      });
      expect(invalid.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });
});
