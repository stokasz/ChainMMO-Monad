import { describe, expect, it, vi } from "vitest";
import { ActionMetrics } from "../src/action-engine/metrics.js";
import { buildApiServer } from "../src/agent-api/server.js";

describe("economy routes", () => {
  it("validates quote-premium query", async () => {
    const app = await buildApiServer({
      env: {} as any,
      signerAddress: undefined,
      actionRepository: undefined,
      metrics: new ActionMetrics(),
      readModel: {
        quotePremiumPurchase: vi.fn()
      } as any
    });

    try {
      const response = await app.inject({ method: "GET", url: "/economy/quote-premium" });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: "invalid_character_id" });
    } finally {
      await app.close();
    }
  });

  it("quotes premium purchase costs", async () => {
    const quotePremiumPurchase = vi.fn(async () => ({ totalCost: { nativeWei: "1", mmoWei: "2" } }));
    const app = await buildApiServer({
      env: {} as any,
      signerAddress: undefined,
      actionRepository: undefined,
      metrics: new ActionMetrics(),
      readModel: {
        quotePremiumPurchase
      } as any
    });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/economy/quote-premium?characterId=7&difficulty=2&amount=3&monPriceUsdHint=0.02"
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ totalCost: { nativeWei: "1", mmoWei: "2" } });
      expect(quotePremiumPurchase).toHaveBeenCalledWith(7, 2, 3, { monPriceUsdHint: 0.02 });
    } finally {
      await app.close();
    }
  });

  it("returns 404 for unknown character ROI estimate", async () => {
    const estimateEpochRoi = vi.fn(async () => null);
    const app = await buildApiServer({
      env: {} as any,
      signerAddress: undefined,
      actionRepository: undefined,
      metrics: new ActionMetrics(),
      readModel: {
        estimateEpochRoi
      } as any
    });

    try {
      const response = await app.inject({ method: "GET", url: "/economy/estimate-epoch-roi/9" });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: "character_not_found" });
    } finally {
      await app.close();
    }
  });

  it("estimates epoch ROI with parsed options", async () => {
    const estimateEpochRoi = vi.fn(async () => ({ projectedNetWei: "100" }));
    const app = await buildApiServer({
      env: {} as any,
      signerAddress: undefined,
      actionRepository: undefined,
      metrics: new ActionMetrics(),
      readModel: {
        estimateEpochRoi
      } as any
    });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/economy/estimate-epoch-roi/9?windowEpochs=12&pushCostWei=1234"
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ projectedNetWei: "100" });
      expect(estimateEpochRoi).toHaveBeenCalledWith(9, {
        windowEpochs: 12,
        pushCostWei: 1234n
      });
    } finally {
      await app.close();
    }
  });
});
