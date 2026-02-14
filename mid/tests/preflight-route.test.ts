import { describe, expect, it, vi } from "vitest";
import { buildApiServer } from "../src/agent-api/server.js";

describe("POST /agent/preflight", () => {
  it("returns preflight result for valid action payload", async () => {
    const preflight = {
      evaluate: vi.fn(async (action: any, options: { commitId?: number }) => ({
        actionType: action.type,
        willSucceed: true,
        code: "PRECHECK_OK",
        reason: "ok",
        retryable: false,
        requiredValueWei: "1000",
        suggestedParams: { commitId: options.commitId ?? null }
      }))
    } as any;

    const app = await buildApiServer({
      env: {} as any,
      metrics: {} as any,
      readModel: {} as any,
      signerAddress: "0x1111111111111111111111111111111111111111",
      actionRepository: {} as any,
      actionPreflight: preflight
    });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/agent/preflight?commitId=42",
        payload: {
          type: "start_dungeon",
          characterId: 7,
          difficulty: 0,
          dungeonLevel: 1,
          varianceMode: 1
        }
      });

      expect(response.statusCode).toBe(200);
      expect(preflight.evaluate).toHaveBeenCalledWith(
        expect.objectContaining({ type: "start_dungeon" }),
        { commitId: 42 }
      );
      const body = JSON.parse(response.body) as { code: string; requiredValueWei: string };
      expect(body.code).toBe("PRECHECK_OK");
      expect(body.requiredValueWei).toBe("1000");
    } finally {
      await app.close();
    }
  });

  it("rejects invalid payload and invalid commit id", async () => {
    const app = await buildApiServer({
      env: {
        API_KEY: "secret"
      } as any,
      metrics: {} as any,
      readModel: {} as any,
      signerAddress: "0x1111111111111111111111111111111111111111",
      actionRepository: {} as any,
      actionPreflight: { evaluate: vi.fn(async () => ({})) } as any
    });

    try {
      const unauthorized = await app.inject({
        method: "POST",
        url: "/agent/preflight",
        payload: {
          type: "create_character",
          race: 0,
          classType: 1,
          name: "x"
        }
      });
      expect(unauthorized.statusCode).toBe(401);

      const invalidPayload = await app.inject({
        method: "POST",
        url: "/agent/preflight",
        headers: { "x-api-key": "secret" },
        payload: {
          type: "open_lootboxes_max",
          characterId: 7,
          tier: 10,
          maxAmount: 0
        }
      });
      expect(invalidPayload.statusCode).toBe(400);

      const invalidCommit = await app.inject({
        method: "POST",
        url: "/agent/preflight?commitId=abc",
        headers: { "x-api-key": "secret" },
        payload: {
          type: "create_character",
          race: 0,
          classType: 1,
          name: "x"
        }
      });
      expect(invalidCommit.statusCode).toBe(400);
      expect(JSON.parse(invalidCommit.body)).toEqual({ error: "invalid_commit_id" });
    } finally {
      await app.close();
    }
  });
});
