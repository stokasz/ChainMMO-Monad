import { describe, expect, it, vi } from "vitest";
import { buildApiServer } from "../src/agent-api/server.js";

describe("GET /agent/valid-actions/:characterId", () => {
  it("returns valid-action menu for character", async () => {
    const validMenu = {
      getMenu: vi.fn(async () => ({
        characterId: 7,
        validActions: [],
        invalidActions: []
      }))
    } as any;

    const app = await buildApiServer({
      env: {} as any,
      metrics: {} as any,
      readModel: {} as any,
      signerAddress: "0x1111111111111111111111111111111111111111",
      actionRepository: {} as any,
      actionValidMenu: validMenu
    });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/agent/valid-actions/7?dungeonLevel=9&difficulty=1&varianceMode=1&tier=2&maxAmount=5&commitId=99"
      });
      expect(response.statusCode).toBe(200);
      expect(validMenu.getMenu).toHaveBeenCalledWith({
        characterId: 7,
        dungeonLevel: 9,
        difficulty: 1,
        varianceMode: 1,
        tier: 2,
        maxAmount: 5,
        commitId: 99
      });
    } finally {
      await app.close();
    }
  });

  it("validates query and enforces api key", async () => {
    const app = await buildApiServer({
      env: { API_KEY: "secret" } as any,
      metrics: {} as any,
      readModel: {} as any,
      signerAddress: "0x1111111111111111111111111111111111111111",
      actionRepository: {} as any,
      actionValidMenu: { getMenu: vi.fn(async () => ({})) } as any
    });

    try {
      const unauthorized = await app.inject({
        method: "GET",
        url: "/agent/valid-actions/7"
      });
      expect(unauthorized.statusCode).toBe(401);

      const invalidDifficulty = await app.inject({
        method: "GET",
        url: "/agent/valid-actions/7?difficulty=9",
        headers: { "x-api-key": "secret" }
      });
      expect(invalidDifficulty.statusCode).toBe(400);
      expect(JSON.parse(invalidDifficulty.body)).toEqual({ error: "invalid_difficulty" });
    } finally {
      await app.close();
    }
  });
});
