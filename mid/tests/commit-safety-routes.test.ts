import { describe, expect, it, vi } from "vitest";
import { buildApiServer } from "../src/agent-api/server.js";

describe("commit/reveal safety routes", () => {
  it("serves commit fee, commit window, and potion balance reads", async () => {
    const readModel = {
      getCommitFee: vi.fn(async () => ({ chainId: 10143, commitFeeWei: "1000000000000000" })),
      getCommitWindow: vi.fn(async (commitId: number) => ({
        commitId,
        currentBlock: 500,
        startBlock: 402,
        endBlock: 656,
        canReveal: true,
        expired: false,
        resolved: false
      })),
      getPotionBalance: vi.fn(async (characterId: number, potionType: number, potionTier: number) => ({
        characterId,
        potionType,
        potionTier,
        balance: 2
      }))
    } as any;

    const app = await buildApiServer({
      env: {} as any,
      metrics: {} as any,
      readModel
    });

    try {
      const commitFeeRes = await app.inject({ method: "GET", url: "/agent/commit-fee" });
      expect(commitFeeRes.statusCode).toBe(200);
      expect(JSON.parse(commitFeeRes.body)).toEqual({ chainId: 10143, commitFeeWei: "1000000000000000" });

      const windowRes = await app.inject({ method: "GET", url: "/agent/commit-window/88" });
      expect(windowRes.statusCode).toBe(200);
      expect(readModel.getCommitWindow).toHaveBeenCalledWith(88);

      const potionRes = await app.inject({ method: "GET", url: "/agent/potion-balance/77/1/2" });
      expect(potionRes.statusCode).toBe(200);
      expect(readModel.getPotionBalance).toHaveBeenCalledWith(77, 1, 2);
    } finally {
      await app.close();
    }
  });

  it("validates commit id and potion enum ranges", async () => {
    const app = await buildApiServer({
      env: {} as any,
      metrics: {} as any,
      readModel: {} as any
    });

    try {
      const badCommitId = await app.inject({ method: "GET", url: "/agent/commit-window/not-a-number" });
      expect(badCommitId.statusCode).toBe(400);

      const badPotionType = await app.inject({ method: "GET", url: "/agent/potion-balance/77/3/1" });
      expect(badPotionType.statusCode).toBe(400);

      const badPotionTier = await app.inject({ method: "GET", url: "/agent/potion-balance/77/1/3" });
      expect(badPotionTier.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });
});
