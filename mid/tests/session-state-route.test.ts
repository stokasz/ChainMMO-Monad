import { describe, expect, it, vi } from "vitest";
import { ActionMetrics } from "../src/action-engine/metrics.js";
import { buildApiServer } from "../src/agent-api/server.js";

describe("session state route", () => {
  it("returns 404 when character does not exist", async () => {
    const app = await buildApiServer({
      env: {} as any,
      signerAddress: undefined,
      actionRepository: undefined,
      metrics: new ActionMetrics(),
      readModel: {
        getAgentState: vi.fn(async () => null)
      } as any
    });

    try {
      const response = await app.inject({ method: "GET", url: "/agent/session-state/9" });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: "character_not_found" });
    } finally {
      await app.close();
    }
  });

  it("returns commit context, last action, and next legal action", async () => {
    const getLatestByCharacter = vi.fn(async () => ({
      actionId: "a1",
      actionType: "start_dungeon",
      status: "succeeded",
      errorCode: null,
      attempts: 1,
      updatedAt: "2026-01-01T00:00:00.000Z",
      resultJson: {
        details: {
          commitId: "77"
        }
      }
    }));

    const app = await buildApiServer({
      env: {} as any,
      signerAddress: "0x1111111111111111111111111111111111111111",
      actionRepository: {
        getLatestByCharacter
      } as any,
      actionValidMenu: {
        getMenu: vi.fn(async () => ({
          validActions: [{ actionType: "next_room" }]
        }))
      } as any,
      metrics: new ActionMetrics(),
      readModel: {
        getAgentState: vi.fn(async () => ({ character: { characterId: 9 } })),
        getCommitWindow: vi.fn(async () => ({
          commitId: 77,
          startBlock: 100,
          endBlock: 356,
          canReveal: true,
          expired: false,
          resolved: false
        }))
      } as any
    });

    try {
      const response = await app.inject({ method: "GET", url: "/agent/session-state/9" });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        characterId: 9,
        commitId: 77,
        revealWindow: {
          commitId: 77,
          canReveal: true
        },
        lastAction: {
          actionId: "a1",
          actionType: "start_dungeon",
          status: "succeeded"
        },
        nextRecommendedLegalAction: "next_room",
        sessionSupported: true
      });
      expect(getLatestByCharacter).toHaveBeenCalledWith(9);
    } finally {
      await app.close();
    }
  });
});
