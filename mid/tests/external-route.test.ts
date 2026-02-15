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
	        tokenAddress: "0x1111111111111111111111111111111111111111",
	        poolAddress: "0x2222222222222222222222222222222222222222",
	        source: "nad.fun",
	        url: "https://nad.fun/tokens/0x1111111111111111111111111111111111111111"
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
