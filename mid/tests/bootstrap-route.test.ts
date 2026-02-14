import { describe, expect, it, vi } from "vitest";
import { buildApiServer } from "../src/agent-api/server.js";

describe("GET /agent/bootstrap", () => {
  it("serves bootstrap payload", async () => {
    const readModel = {
      getAgentBootstrap: vi.fn(async () => ({
        chainId: 10143,
        enums: {
          race: [0, 1, 2]
        }
      }))
    } as any;

    const app = await buildApiServer({
      env: {} as any,
      metrics: {} as any,
      readModel
    });

    try {
      const response = await app.inject({ method: "GET", url: "/agent/bootstrap" });
      expect(response.statusCode).toBe(200);
      expect(readModel.getAgentBootstrap).toHaveBeenCalledTimes(1);
      expect(JSON.parse(response.body)).toEqual({
        chainId: 10143,
        enums: {
          race: [0, 1, 2]
        }
      });
    } finally {
      await app.close();
    }
  });
});
