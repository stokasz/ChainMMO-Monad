import { describe, expect, it, vi } from "vitest";
import { ActionMetrics } from "../src/action-engine/metrics.js";
import { buildApiServer } from "../src/agent-api/server.js";

describe("characters route", () => {
  it("validates owner address", async () => {
    const app = await buildApiServer({
      env: {} as any,
      signerAddress: undefined,
      actionRepository: undefined,
      metrics: new ActionMetrics(),
      readModel: {
        listMyCharacters: vi.fn()
      } as any
    });

    try {
      const response = await app.inject({ method: "GET", url: "/agent/characters/not-an-address" });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: "invalid_owner" });
    } finally {
      await app.close();
    }
  });

  it("returns owner-scoped character list", async () => {
    const listMyCharacters = vi.fn(async () => ({
      owner: "0x1111111111111111111111111111111111111111",
      items: [{ characterId: 7, name: "Ada", bestLevel: 3 }]
    }));

    const app = await buildApiServer({
      env: {} as any,
      signerAddress: undefined,
      actionRepository: undefined,
      metrics: new ActionMetrics(),
      readModel: {
        listMyCharacters
      } as any
    });

    try {
      const owner = "0x1111111111111111111111111111111111111111";
      const response = await app.inject({ method: "GET", url: `/agent/characters/${owner}` });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        owner,
        items: [{ characterId: 7, name: "Ada", bestLevel: 3 }]
      });
      expect(listMyCharacters).toHaveBeenCalledWith(owner);
    } finally {
      await app.close();
    }
  });
});
