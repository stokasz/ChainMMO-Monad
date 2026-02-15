import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { Database } from "../src/storage/db.js";
import type { Env } from "../src/config/env.js";
import { GrokArena } from "../src/grok/arena.js";

class FakeOpenClawClient extends EventEmitter {
  public async waitUntilReady(): Promise<void> {
    return;
  }

  public async request(_method: string, _params: unknown): Promise<unknown> {
    return {};
  }
}

function createArenaWithDb() {
  const db = {
    query: vi.fn(async () => [])
  } as unknown as Database;

  const env = {
    CHAIN_EXPLORER_BASE_URL: "https://monadvision.com",
    GROK_HISTORY_LIMIT: 10,
    GROK_RATE_LIMIT_COOLDOWN_SECONDS: 10,
    GROK_RATE_LIMIT_PER_HOUR: 20,
    GROK_PROMPT_MAX_CHARS: 600,
    GROK_OPENCLAW_MAX_TOKENS: 1024,
    GROK_OPENCLAW_MAX_COMPLETION_TOKENS: 1024,
    GROK_GATEWAY_READY_TIMEOUT_MS: 500,
    GROK_AGENT_ID: "chainmmo",
    GROK_IP_HASH_SALT: "salt"
  } as unknown as Env;

  const openclaw = new FakeOpenClawClient();
  const arena = new GrokArena(env, db, openclaw as unknown as any);

  return {
    arena,
    db,
    openclaw
  };
}

describe("GrokArena", () => {
  it("emits a final stream event even when chat final has no message", async () => {
    const { arena } = createArenaWithDb();
    const { runId, messageId } = await arena.submitPrompt({
      sessionId: "session-1",
      message: "hello",
      clientId: "client",
      ip: null
    });

    const events: Array<{ type: string; data: unknown }> = [];
    const detach = arena.attach(runId, (event) => {
      events.push(event);
    });

    try {
      arena["handleGatewayEvent"]({
        event: "chat",
        payload: {
          sessionKey: "agent:chainmmo:web:direct:session-1",
          runId,
          state: "final"
        }
      } as any);

      expect(events).toEqual([
        {
          type: "final",
          data: {
            text: "",
            messageId
          }
        }
      ]);
      expect(arena.isRunClosed(runId)).toBeTruthy();
    } finally {
      detach?.();
    }
  });

  it("extracts assistant text from content arrays (OpenAI-style)", async () => {
    const { arena } = createArenaWithDb();
    const { runId, messageId } = await arena.submitPrompt({
      sessionId: "session-content-array",
      message: "hello",
      clientId: null,
      ip: null
    });

    const events: Array<{ type: string; data: unknown }> = [];
    arena.attach(runId, (event) => events.push(event));

    arena["handleGatewayEvent"]({
      event: "chat",
      payload: {
        sessionKey: "agent:chainmmo:web:direct:session-content-array",
        runId,
        state: "final",
        message: {
          role: "assistant",
          content: [{ type: "output_text", text: "Hello there." }]
        }
      }
    } as any);

    expect(events).toContainEqual({
      type: "final",
      data: { text: "Hello there.", messageId }
    });
    expect(arena.isRunClosed(runId)).toBeTruthy();
  });

  it("emits final with assistant text and closes the run", async () => {
    const { arena } = createArenaWithDb();
    const { runId, messageId } = await arena.submitPrompt({
      sessionId: "session-2",
      message: "hello",
      clientId: null,
      ip: null
    });

    const events: Array<{ type: string; data: unknown }> = [];
    arena.attach(runId, (event) => events.push(event));

    arena["handleGatewayEvent"]({
      event: "chat",
      payload: {
        sessionKey: "agent:chainmmo:web:direct:session-2",
        runId,
        state: "final",
        message: "Done."
      }
    } as any);

    expect(events).toContainEqual({
      type: "final",
      data: { text: "Done.", messageId }
    });
    expect(arena.isRunClosed(runId)).toBeTruthy();
  });

  it("resolves session-scoped chat events without runId", async () => {
    const { arena, openclaw } = createArenaWithDb();
    const run = vi.spyOn(openclaw, "request");
    const { runId, messageId } = await arena.submitPrompt({
      sessionId: "session-3",
      message: "hello",
      clientId: null,
      ip: null
    });

    const events: Array<{ type: string; data: unknown }> = [];
    arena.attach(runId, (event) => events.push(event));

    arena["handleGatewayEvent"]({
      event: "chat",
      payload: {
        sessionKey: "agent:chainmmo:web:direct:session-3",
        state: "final",
        message: "Done."
      }
    } as any);

    expect(events).toContainEqual({
      type: "final",
      data: { text: "Done.", messageId }
    });
    expect(arena.isRunClosed(runId)).toBeTruthy();
    expect(run.mock.calls.at(0)?.[0]).toBe("chat.send");
    expect(run.mock.calls.at(0)?.[1]).toMatchObject({
      sessionKey: "agent:chainmmo:web:direct:session-3",
      message: "hello",
      deliver: true,
      idempotencyKey: runId
    });
    const params = run.mock.calls.at(0)?.[1] as Record<string, unknown>;
    expect(params).not.toHaveProperty("max_tokens");
    expect(params).not.toHaveProperty("max_completion_tokens");
    expect(params).not.toHaveProperty("maxCompletionTokens");
    expect(params).not.toHaveProperty("maxTokens");
    run.mockRestore();
  });
});
