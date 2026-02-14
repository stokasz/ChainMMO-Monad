import { describe, expect, it, vi } from "vitest";
import { buildApiServer } from "../src/agent-api/server.js";

describe("trade market routes", () => {
  it("serves filtered trade offers list", async () => {
    const readModel = {
      getMarketTrades: vi.fn(async () => ({ items: [] }))
    } as any;

    const app = await buildApiServer({
      env: {} as any,
      metrics: {} as any,
      readModel
    });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/market/trades?limit=25&activeOnly=true&maker=0x1111111111111111111111111111111111111111"
      });
      expect(response.statusCode).toBe(200);
      expect(readModel.getMarketTrades).toHaveBeenCalledWith({
        limit: 25,
        activeOnly: true,
        maker: "0x1111111111111111111111111111111111111111"
      });
    } finally {
      await app.close();
    }
  });

  it("serves trade offer detail and validates offer id", async () => {
    const readModel = {
      getMarketTrades: vi.fn(async () => ({ items: [] })),
      getMarketTradeOffer: vi.fn(async (offerId: number) => ({ offerId }))
    } as any;

    const app = await buildApiServer({
      env: {} as any,
      metrics: {} as any,
      readModel
    });

    try {
      const invalid = await app.inject({ method: "GET", url: "/market/trades/0" });
      expect(invalid.statusCode).toBe(400);

      const ok = await app.inject({ method: "GET", url: "/market/trades/9" });
      expect(ok.statusCode).toBe(200);
      expect(readModel.getMarketTradeOffer).toHaveBeenCalledWith(9);
    } finally {
      await app.close();
    }
  });
});
