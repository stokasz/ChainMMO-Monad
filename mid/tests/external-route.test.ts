import { describe, expect, it, vi } from "vitest";
import { buildApiServer } from "../src/agent-api/server.js";

describe("GET /meta/external", () => {
  it("returns 404 when external token meta is not configured", async () => {
    const readModel = {
      getExternalMeta: vi.fn(async () => null)
    } as any;

    const app = await buildApiServer({
      env: {} as any,
      signerAddress: undefined,
      actionRepository: undefined,
      metrics: {} as any,
      readModel
    });

    try {
      const res = await app.inject({ method: "GET", url: "/meta/external" });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: "external_not_configured" });
      expect(readModel.getExternalMeta).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });

  it("returns configured external token meta", async () => {
    const payload = {
      chainId: 143,
      mmo: {
        tokenAddress: "0xF383a61f1a68ee4A77a1b7F57D8f2d948B5f7777",
        poolAddress: "0xA7283d07812a02AFB7C09B60f8896bCEA3F90aCE",
        source: "nad.fun",
        url: "https://nad.fun/tokens/0xF383a61f1a68ee4A77a1b7F57D8f2d948B5f7777"
      }
    };

    const readModel = {
      getExternalMeta: vi.fn(async () => payload)
    } as any;

    const app = await buildApiServer({
      env: {} as any,
      signerAddress: undefined,
      actionRepository: undefined,
      metrics: {} as any,
      readModel
    });

    try {
      const res = await app.inject({ method: "GET", url: "/meta/external" });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(payload);
      expect(readModel.getExternalMeta).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });
});

