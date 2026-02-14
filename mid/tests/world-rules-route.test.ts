import { describe, expect, it, vi } from "vitest";
import { ActionMetrics } from "../src/action-engine/metrics.js";
import { buildApiServer } from "../src/agent-api/server.js";

describe("world rules route", () => {
  it("returns compact world rules payload", async () => {
    const getWorldRules = vi.fn(async () => ({
      chainId: 10143,
      enums: {
        difficulty: [0, 1, 2, 3, 4]
      }
    }));

    const app = await buildApiServer({
      env: {} as any,
      signerAddress: undefined,
      actionRepository: undefined,
      metrics: new ActionMetrics(),
      readModel: {
        getWorldRules
      } as any
    });

    try {
      const response = await app.inject({ method: "GET", url: "/agent/world-rules" });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        chainId: 10143,
        enums: {
          difficulty: [0, 1, 2, 3, 4]
        }
      });
      expect(getWorldRules).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });
});
