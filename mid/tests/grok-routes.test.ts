import { describe, expect, it, vi } from "vitest";
import { buildApiServer } from "../src/agent-api/server.js";
import { ActionMetrics } from "../src/action-engine/metrics.js";
import type { GrokArena } from "../src/grok/arena.js";

describe("grok routes", () => {
  it("creates sessions and returns history", async () => {
    const grokArena = {
      createSession: vi.fn(async () => "session-1"),
      getHistory: vi.fn(async () => []),
      getStatus: vi.fn(() => ({ online: true, queueDepth: 0, lastSeenAt: null })),
      submitPrompt: vi.fn(async () => ({ runId: "run-1", messageId: "msg-1" })),
      attach: vi.fn(() => null),
      isRunClosed: vi.fn(() => false)
    } as unknown as GrokArena;

    const app = await buildApiServer({
      env: {
        CHAIN_ID: 143,
        MID_MODE: "read-only",
        GROK_HISTORY_LIMIT: 10
      } as any,
      metrics: new ActionMetrics(),
      readModel: {} as any,
      grokArena
    });

    try {
      const sessionResp = await app.inject({
        method: "POST",
        url: "/grok/session",
        payload: { clientId: "web" }
      });
      expect(sessionResp.statusCode).toBe(200);
      expect(sessionResp.json()).toEqual({ sessionId: "session-1" });
      expect(grokArena.createSession).toHaveBeenCalledTimes(1);

      const historyResp = await app.inject({ method: "GET", url: "/grok/history?limit=3" });
      expect(historyResp.statusCode).toBe(200);
      expect(historyResp.json()).toEqual({ items: [] });
      expect(grokArena.getHistory).toHaveBeenCalledWith(3);

      const scopedHistoryResp = await app.inject({ method: "GET", url: "/grok/history?limit=3&sessionId=session-1" });
      expect(scopedHistoryResp.statusCode).toBe(200);
      expect(scopedHistoryResp.json()).toEqual({ items: [] });
      expect(grokArena.getHistory).toHaveBeenLastCalledWith(3, "session-1");
    } finally {
      await app.close();
    }
  });

  it("streams a prompt response", async () => {
    const grokArena = {
      createSession: vi.fn(async () => "session-1"),
      getHistory: vi.fn(async () => []),
      getStatus: vi.fn(() => ({ online: true, queueDepth: 0, lastSeenAt: null })),
      submitPrompt: vi.fn(async () => ({ runId: "run-1", messageId: "msg-1" })),
      attach: vi.fn((runId: string, handler: any) => {
        handler({ type: "final", data: { text: "hello", messageId: "msg-1" } });
        return () => undefined;
      }),
      isRunClosed: vi.fn(() => false)
    } as unknown as GrokArena;

    const app = await buildApiServer({
      env: {
        CHAIN_ID: 143,
        MID_MODE: "read-only",
        GROK_HISTORY_LIMIT: 10,
        GROK_AGENT_ADDRESS: "0x1111111111111111111111111111111111111111"
      } as any,
      metrics: new ActionMetrics(),
      readModel: {
        listMyCharacters: vi.fn(async () => ({ items: [{ characterId: 1, bestLevel: 10 }] }))
      } as any,
      grokArena
    });

    try {
      const promptResp = await app.inject({
        method: "POST",
        url: "/grok/prompt",
        payload: { sessionId: "session-1", message: "hi" }
      });
      expect(promptResp.statusCode).toBe(200);
      const promptBody = promptResp.json();
      expect(promptBody.runId).toBe("run-1");
      expect(promptBody.streamUrl).toContain("/grok/stream?runId=");

      const streamResp = await app.inject({
        method: "GET",
        url: "/grok/stream?runId=run-1"
      });
      expect(streamResp.statusCode).toBe(200);
      expect(streamResp.body).toContain("event: final");

      const statusResp = await app.inject({ method: "GET", url: "/grok/status" });
      expect(statusResp.statusCode).toBe(200);
      expect(statusResp.json().agentCharacterId).toBe(1);
    } finally {
      await app.close();
    }
  });
});
