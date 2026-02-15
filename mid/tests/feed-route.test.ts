import { describe, expect, it, vi } from "vitest";
import { buildApiServer } from "../src/agent-api/server.js";
import { ActionMetrics } from "../src/action-engine/metrics.js";

describe("feed route", () => {
  it("returns compact deltas globally", async () => {
    const getRecentStateDeltas = vi.fn(async () => ({
      items: [
        {
          blockNumber: 12,
          logIndex: 1,
          txHash: "0xfeed",
          characterId: 4,
          kind: "RFQCreated",
          payload: { slot: 1 }
        }
      ]
    }));

    const app = await buildApiServer({
      env: {
        CHAIN_ID: 143,
        MID_MODE: "read-only"
      } as any,
      metrics: new ActionMetrics(),
      readModel: { getRecentStateDeltas } as any
    });

    try {
      const response = await app.inject({ method: "GET", url: "/feed/recent?limit=15&sinceBlock=100" });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        items: [
          {
            blockNumber: 12,
            logIndex: 1,
            txHash: "0xfeed",
            characterId: 4,
            kind: "RFQCreated",
            payload: { slot: 1 }
          }
        ]
      });
      expect(getRecentStateDeltas).toHaveBeenCalledWith(15, 100);
    } finally {
      await app.close();
    }
  });

  it("rejects non-numeric limit", async () => {
    const app = await buildApiServer({
      env: {
        CHAIN_ID: 143,
        MID_MODE: "read-only"
      } as any,
      metrics: new ActionMetrics(),
      readModel: { getRecentStateDeltas: vi.fn() } as any
    });

    try {
      const response = await app.inject({ method: "GET", url: "/feed/recent?limit=abc" });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: "invalid_limit" });
    } finally {
      await app.close();
    }
  });
});
