import { describe, expect, it, vi } from "vitest";
import { ActionMetrics } from "../src/action-engine/metrics.js";
import { buildApiServer } from "../src/agent-api/server.js";

describe("action preflight safety gate", () => {
  it("returns 503 when preflight gate is enabled but preflight service is unavailable", async () => {
    const enqueue = vi.fn(async () => ({
      actionId: "a1",
      status: "queued",
      actionType: "create_character",
      createdAt: "2026-01-01T00:00:00.000Z"
    }));

    const app = await buildApiServer({
      env: {
        MID_MODE: "full",
        CHAIN_ID: 10143,
        ACTION_REQUIRE_PREFLIGHT_SUCCESS: true
      } as any,
      signerAddress: "0x1111111111111111111111111111111111111111",
      actionRepository: {
        enqueue
      } as any,
      actionPreflight: undefined,
      metrics: new ActionMetrics(),
      readModel: {} as any
    });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/agent/action",
        payload: {
          type: "create_character",
          race: 0,
          classType: 0,
          name: "Ada"
        }
      });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ error: "preflight_unavailable" });
      expect(enqueue).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("blocks queued actions when preflight fails under safety gate", async () => {
    const enqueue = vi.fn();
    const evaluate = vi.fn(async () => ({
      actionType: "create_character",
      willSucceed: false,
      code: "PRECHECK_ONLY_CHARACTER_OWNER",
      reason: "Signer does not own the target character",
      retryable: false,
      requiredValueWei: "0"
    }));

    const app = await buildApiServer({
      env: {
        MID_MODE: "full",
        CHAIN_ID: 10143,
        ACTION_REQUIRE_PREFLIGHT_SUCCESS: true
      } as any,
      signerAddress: "0x1111111111111111111111111111111111111111",
      actionRepository: {
        enqueue
      } as any,
      actionPreflight: {
        evaluate
      } as any,
      metrics: new ActionMetrics(),
      readModel: {} as any
    });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/agent/action",
        payload: {
          type: "create_character",
          race: 0,
          classType: 0,
          name: "Ada"
        }
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({
        error: "preflight_failed",
        preflight: {
          willSucceed: false,
          code: "PRECHECK_ONLY_CHARACTER_OWNER"
        }
      });
      expect(enqueue).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("allows queueing when preflight succeeds under safety gate", async () => {
    const enqueue = vi.fn(async () => ({
      actionId: "a1",
      status: "queued",
      actionType: "create_character",
      createdAt: "2026-01-01T00:00:00.000Z"
    }));
    const evaluate = vi.fn(async () => ({
      actionType: "create_character",
      willSucceed: true,
      code: "PRECHECK_OK",
      reason: "ok",
      retryable: false,
      requiredValueWei: "0"
    }));

    const app = await buildApiServer({
      env: {
        MID_MODE: "full",
        CHAIN_ID: 10143,
        ACTION_REQUIRE_PREFLIGHT_SUCCESS: true
      } as any,
      signerAddress: "0x1111111111111111111111111111111111111111",
      actionRepository: {
        enqueue
      } as any,
      actionPreflight: {
        evaluate
      } as any,
      metrics: new ActionMetrics(),
      readModel: {} as any
    });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/agent/action",
        payload: {
          type: "create_character",
          race: 0,
          classType: 0,
          name: "Ada"
        }
      });

      expect(response.statusCode).toBe(200);
      expect(enqueue).toHaveBeenCalledTimes(1);
      expect(evaluate).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });
});
