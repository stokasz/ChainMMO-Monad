import { describe, expect, it } from "vitest";
import { ActionMetrics } from "../src/action-engine/metrics.js";
import { buildApiServer } from "../src/agent-api/server.js";

describe("API_KEY scoping", () => {
  it("does not gate public endpoints, but gates /metrics", async () => {
    const metrics = new ActionMetrics();
    const app = await buildApiServer({
      env: {
        API_KEY: "secret"
      } as any,
      signerAddress: "0x0000000000000000000000000000000000000000",
      actionRepository: {} as any,
      metrics,
      readModel: {} as any,
      worker: {} as any,
      indexer: {} as any
    });

    try {
      const health = await app.inject({ method: "GET", url: "/health" });
      expect(health.statusCode).toBe(200);

      const root = await app.inject({ method: "GET", url: "/" });
      expect(root.statusCode).toBe(200);

      const metricsNoKey = await app.inject({ method: "GET", url: "/metrics" });
      expect(metricsNoKey.statusCode).toBe(401);

      const metricsWithKey = await app.inject({
        method: "GET",
        url: "/metrics",
        headers: { "x-api-key": "secret" }
      });
      expect(metricsWithKey.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});

