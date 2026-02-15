import { createHash, randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import type { Database } from "../storage/db.js";
import type { Env } from "../config/env.js";
import { OpenClawGatewayClient, type OpenClawGatewayEvent } from "./openclaw-client.js";

export type GrokHistoryMessage = {
  messageId: string;
  sessionId: string;
  role: string;
  content: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type GrokStatus = {
  online: boolean;
  queueDepth: number;
  lastSeenAt: string | null;
};

export type GrokStreamEvent =
  | { type: "token"; data: { text: string } }
  | { type: "action"; data: { txHash: string; url: string } }
  | { type: "final"; data: { text: string; messageId: string } }
  | { type: "error"; data: { error: string } };

type RunState = {
  runId: string;
  sessionId: string;
  sessionKey: string;
  messageId: string;
  createdAt: number;
  lastText: string;
  events: GrokStreamEvent[];
  listeners: Set<(event: GrokStreamEvent) => void>;
  seenTxHashes: Set<string>;
  closed: boolean;
  closedAt: number | null;
  cleanupTimer: ReturnType<typeof setTimeout> | null;
  runTimer: ReturnType<typeof setTimeout> | null;
};

type RateState = {
  lastAt: number;
  windowStart: number;
  count: number;
};

const TX_HASH_RE = /0x[a-fA-F0-9]{64}/g;
const CHAT_FINAL_STATES = new Set(["final", "done", "complete", "completed", "finished", "success"]);
const CHAT_ERROR_STATES = new Set(["error", "aborted", "failed", "canceled", "cancelled", "timeout"]);
const TOOL_RESULT_STATES = new Set(["result", "done", "complete", "completed", "success"]);
const RUN_TIMEOUT_MS = 120_000;

function extractMessageText(message: any): string | null {
  if (!message) return null;
  if (typeof message === "string") return message;
  if (typeof message.text === "string") return message.text;
  if (typeof message.content === "string") return message.content;
  if (typeof message.output_text === "string") return message.output_text;
  if (typeof message.outputText === "string") return message.outputText;
  if (message.message) {
    const nested = extractMessageText(message.message);
    if (nested) return nested;
  }
  if (Array.isArray(message.content)) {
    const parts = message.content
      .map((entry: any) => {
        if (!entry) return null;
        if (typeof entry === "string") return entry;
        if (typeof entry.text === "string") return entry.text;
        if (typeof entry.delta === "string") return entry.delta;
        if (typeof entry.value === "string") return entry.value;
        if (typeof entry.content === "string") return entry.content;
        if (entry.text && typeof entry.text === "object" && typeof entry.text.value === "string") return entry.text.value;
        return null;
      })
      .filter((entry: string | null): entry is string => Boolean(entry));
    if (parts.length > 0) return parts.join("\n");
  }
  return null;
}

function extractTxHashes(value: string | null): string[] {
  if (!value) return [];
  const matches = value.match(TX_HASH_RE) ?? [];
  return Array.from(new Set(matches));
}

function buildSessionKey(agentId: string, sessionId: string): string {
  return `agent:${agentId}:web:direct:${sessionId}`;
}

function hashIp(ip: string, salt?: string): string {
  return createHash("sha256").update(ip + (salt ?? "")).digest("hex");
}

export class GrokArena {
  private readonly env: Env;
  private readonly db: Database;
  private readonly openclaw: OpenClawGatewayClient;
  private readonly runs = new Map<string, RunState>();
  private readonly activeBySession = new Map<string, string>();
  private readonly rateByIp = new Map<string, RateState>();
  private lastSeenAt: string | null = null;

  public constructor(env: Env, db: Database, openclaw: OpenClawGatewayClient) {
    this.env = env;
    this.db = db;
    this.openclaw = openclaw;
    this.openclaw.on("event", (event: OpenClawGatewayEvent) => this.handleGatewayEvent(event));
  }

  public async createSession(origin: string, clientId: string | null, ip: string | null): Promise<string> {
    const sessionId = randomUUID();
    const ipHash = ip ? hashIp(ip, this.env.GROK_IP_HASH_SALT) : null;
    await this.db.query(
      `INSERT INTO grok_sessions(session_id, origin, client_id, ip_hash)
       VALUES ($1, $2, $3, $4)`,
      [sessionId, origin, clientId, ipHash]
    );
    return sessionId;
  }

  public async ensureSession(sessionId: string, origin: string, clientId: string | null, ip: string | null) {
    const rows = await this.db.query<{ session_id: string }>(
      "SELECT session_id FROM grok_sessions WHERE session_id = $1",
      [sessionId]
    );
    if (rows.length > 0) return;
    const ipHash = ip ? hashIp(ip, this.env.GROK_IP_HASH_SALT) : null;
    await this.db.query(
      `INSERT INTO grok_sessions(session_id, origin, client_id, ip_hash)
       VALUES ($1, $2, $3, $4)`,
      [sessionId, origin, clientId, ipHash]
    );
  }

  public getStatus(): GrokStatus {
    return {
      online: this.openclaw.connected,
      queueDepth: this.runs.size,
      lastSeenAt: this.lastSeenAt
    };
  }

  public async getHistory(limit: number, sessionId?: string | null): Promise<GrokHistoryMessage[]> {
    const trimmedSessionId = typeof sessionId === "string" ? sessionId.trim() : "";
    const rows = await this.db.query<{
      message_id: string;
      session_id: string;
      role: string;
      content: string;
      metadata: Record<string, unknown> | null;
      created_at: string;
    }>(
      trimmedSessionId
        ? `SELECT m.message_id, m.session_id, m.role, m.content, m.metadata, m.created_at
           FROM grok_messages m
           JOIN grok_sessions s ON s.session_id = m.session_id
           WHERE s.origin = 'web' AND m.session_id = $2
           ORDER BY m.created_at DESC
           LIMIT $1`
        : `SELECT m.message_id, m.session_id, m.role, m.content, m.metadata, m.created_at
         FROM grok_messages m
         JOIN grok_sessions s ON s.session_id = m.session_id
         WHERE s.origin = 'web'
         ORDER BY m.created_at DESC
         LIMIT $1`,
      trimmedSessionId ? [limit, trimmedSessionId] : [limit]
    );

    return rows
      .map((row) => ({
        messageId: row.message_id,
        sessionId: row.session_id,
        role: row.role,
        content: row.content,
        metadata: row.metadata,
        createdAt: row.created_at
      }))
      .reverse();
  }

  public async clearHistory(sessionId?: string): Promise<void> {
    if (sessionId) {
      await this.db.query(
        "DELETE FROM grok_messages WHERE session_id = $1",
        [sessionId]
      );
    } else {
      await this.db.query(
        `DELETE FROM grok_messages WHERE session_id IN (
           SELECT session_id FROM grok_sessions WHERE origin = 'web'
         )`,
        []
      );
    }
  }

  public async submitPrompt(params: {
    sessionId: string;
    message: string;
    clientId: string | null;
    ip: string | null;
  }): Promise<{ runId: string; messageId: string }> {
    const trimmed = params.message.trim();
    if (!trimmed) {
      throw new Error("empty_message");
    }
    if (trimmed.length > this.env.GROK_PROMPT_MAX_CHARS) {
      throw new Error("message_too_long");
    }

    this.applyRateLimit(params.ip);

    if (this.activeBySession.has(params.sessionId)) {
      throw new Error("session_busy");
    }

    await this.ensureSession(params.sessionId, "web", params.clientId, params.ip);

    const runId = randomUUID();
    const messageId = randomUUID();
    const sessionKey = buildSessionKey(this.env.GROK_AGENT_ID, params.sessionId);

    await this.db.query(
      `INSERT INTO grok_messages(message_id, session_id, role, content)
       VALUES ($1, $2, $3, $4)`,
      [messageId, params.sessionId, "user", trimmed]
    );

    const run: RunState = {
      runId,
      sessionId: params.sessionId,
      sessionKey,
      messageId,
      createdAt: Date.now(),
      lastText: "",
      events: [],
      listeners: new Set(),
      seenTxHashes: new Set(),
      closed: false,
      closedAt: null,
      cleanupTimer: null,
      runTimer: null
    };
    this.runs.set(runId, run);
    this.activeBySession.set(params.sessionId, runId);

    run.runTimer = setTimeout(() => {
      if (run.closed) return;
      const finalText = run.lastText || "";
      if (finalText) {
        void this.persistAssistantMessage(run, finalText);
      }
      this.pushEvent(run, {
        type: "final",
        data: { text: finalText, messageId: run.messageId }
      });
      this.closeRun(run.runId);
    }, RUN_TIMEOUT_MS);

    try {
      await this.openclaw.waitUntilReady(this.env.GROK_GATEWAY_READY_TIMEOUT_MS);
      await this.openclaw.request("chat.send", {
        sessionKey,
        message: trimmed,
        deliver: true,
        idempotencyKey: runId
      });
    } catch (error) {
      this.closeRun(runId);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`openclaw_send_failed:${message}`);
    }

    return { runId, messageId };
  }

  public attach(runId: string, handler: (event: GrokStreamEvent) => void): (() => void) | null {
    const run = this.runs.get(runId);
    if (!run) return null;
    run.events.forEach(handler);
    run.listeners.add(handler);
    return () => {
      run.listeners.delete(handler);
    };
  }

  public isRunClosed(runId: string): boolean {
    const run = this.runs.get(runId);
    return Boolean(run?.closed);
  }

  private applyRateLimit(ip: string | null): void {
    if (!ip) return;
    const ipHash = hashIp(ip, this.env.GROK_IP_HASH_SALT);
    const now = Date.now();
    const cooldownMs = this.env.GROK_RATE_LIMIT_COOLDOWN_SECONDS * 1000;
    const windowMs = 60 * 60 * 1000;
    const entry = this.rateByIp.get(ipHash) ?? {
      lastAt: 0,
      windowStart: now,
      count: 0
    };

    if (entry.lastAt && now - entry.lastAt < cooldownMs) {
      throw new Error("rate_limited_cooldown");
    }

    if (now - entry.windowStart >= windowMs) {
      entry.windowStart = now;
      entry.count = 0;
    }

    entry.count += 1;
    entry.lastAt = now;

    if (entry.count > this.env.GROK_RATE_LIMIT_PER_HOUR) {
      this.rateByIp.set(ipHash, entry);
      throw new Error("rate_limited_hourly");
    }

    this.rateByIp.set(ipHash, entry);
  }

  private handleGatewayEvent(event: OpenClawGatewayEvent): void {
    if (!event || typeof event.event !== "string") return;
    this.lastSeenAt = new Date().toISOString();
    if (event.event === "chat") {
      this.handleChatEvent(event.payload);
      return;
    }
    if (event.event === "agent") {
      this.handleAgentEvent(event.payload);
    }
  }

  private handleChatEvent(payload: any): void {
    if (!payload || typeof payload !== "object") return;
    const sessionKey = typeof payload.sessionKey === "string" ? payload.sessionKey : null;
    const run = this.resolveRunForEvent(payload.sessionKey, payload.runId);
    if (!run) return;
    if (sessionKey && sessionKey !== run.sessionKey) return;

    const state = typeof payload.state === "string" ? payload.state : "";
    const text = extractMessageText(payload.message);

    if (state === "delta") {
      if (!text) return;
      if (text.length > run.lastText.length) {
        const delta = text.startsWith(run.lastText) ? text.slice(run.lastText.length) : text;
        run.lastText = text.startsWith(run.lastText) ? text : run.lastText + text;
        if (delta) {
          this.pushEvent(run, { type: "token", data: { text: delta } });
        }
      }
      return;
    }

    if (CHAT_FINAL_STATES.has(state)) {
      const candidateText = text ?? "";
      const finalText = candidateText && candidateText.length >= run.lastText.length ? candidateText : run.lastText;
      if (finalText) {
        void this.persistAssistantMessage(run, finalText);
        this.detectAndEmitActions(run, finalText);
      }
      this.pushEvent(run, {
        type: "final",
        data: {
          text: finalText,
          messageId: run.messageId
        }
      });
      this.closeRun(run.runId);
      return;
    }

    if (CHAT_ERROR_STATES.has(state)) {
      const errorMessage = payload.errorMessage
        ? String(payload.errorMessage)
        : payload.error
          ? String(payload.error)
          : "run_failed";
      void this.persistAssistantMessage(run, `Error: ${errorMessage}`);
      this.pushEvent(run, { type: "error", data: { error: errorMessage } });
      this.closeRun(run.runId);
    }
  }

  private handleAgentEvent(payload: any): void {
    if (!payload || typeof payload !== "object") return;
    const stream = typeof payload.stream === "string" ? payload.stream : "";
    const run = this.resolveRunForEvent(payload.sessionKey, payload.runId);

    if (stream === "assistant" && run) {
      const data = payload.data ?? {};
      const delta = typeof data.delta === "string" ? data.delta : null;
      const text = typeof data.text === "string" ? data.text : null;
      if (delta && delta.length > 0) {
        run.lastText = text ?? (run.lastText + delta);
        this.pushEvent(run, { type: "token", data: { text: delta } });
      }
      return;
    }

    if (stream === "tool" && run) {
      const data = payload.data ?? {};
      const phase = typeof data.phase === "string" ? data.phase : "";
      if (!TOOL_RESULT_STATES.has(phase)) return;
      const result = typeof data.result === "string" ? data.result : JSON.stringify(data.result ?? {});
      this.detectAndEmitActions(run, result);
    }
  }

  private detectAndEmitActions(run: RunState, text: string): void {
    const hashes = extractTxHashes(text);
    if (hashes.length === 0) return;
    for (const txHash of hashes) {
      if (run.seenTxHashes.has(txHash)) continue;
      run.seenTxHashes.add(txHash);
      const url = `${this.env.CHAIN_EXPLORER_BASE_URL.replace(/\/$/, "")}/tx/${txHash}`;
      this.pushEvent(run, { type: "action", data: { txHash, url } });
      void this.persistActionMessage(run, txHash, url);
    }
  }

  private pushEvent(run: RunState, event: GrokStreamEvent): void {
    run.events.push(event);
    if (run.events.length > 200) {
      run.events.shift();
    }
    for (const listener of run.listeners) {
      listener(event);
    }
  }

  private resolveRunForEvent(sessionKeyCandidate: unknown, runIdCandidate: unknown): RunState | null {
    const runId = typeof runIdCandidate === "string" ? runIdCandidate : null;
    if (runId) {
      const run = this.runs.get(runId);
      if (run && !run.closed) return run;
    }

    if (typeof sessionKeyCandidate === "string") {
      const sessionId = this.extractSessionIdFromSessionKey(sessionKeyCandidate);
      if (!sessionId) return null;
      const activeRunId = this.activeBySession.get(sessionId);
      if (!activeRunId) return null;
      const run = this.runs.get(activeRunId);
      if (run && !run.closed) return run;
    }

    return null;
  }

  private extractSessionIdFromSessionKey(sessionKey: string): string | null {
    const prefix = `agent:${this.env.GROK_AGENT_ID}:web:direct:`;
    if (!sessionKey.startsWith(prefix)) {
      return null;
    }
    const sessionId = sessionKey.slice(prefix.length);
    return sessionId.length > 0 ? sessionId : null;
  }

  private closeRun(runId: string): void {
    const run = this.runs.get(runId);
    if (!run) return;
    run.closed = true;
    run.closedAt = Date.now();
    if (run.runTimer) {
      clearTimeout(run.runTimer);
      run.runTimer = null;
    }
    if (run.cleanupTimer) {
      clearTimeout(run.cleanupTimer);
    }
    run.cleanupTimer = setTimeout(() => {
      const current = this.runs.get(runId);
      if (current && current.closed && current.closedAt === run.closedAt) {
        this.runs.delete(runId);
      }
    }, 60_000);
    this.activeBySession.delete(run.sessionId);
  }

  private async persistAssistantMessage(run: RunState, content: string): Promise<void> {
    await this.db.query(
      `INSERT INTO grok_messages(message_id, session_id, role, content)
       VALUES ($1, $2, $3, $4)`,
      [randomUUID(), run.sessionId, "assistant", content]
    );
    await this.pruneHistory();
  }

  private async persistActionMessage(run: RunState, txHash: string, url: string): Promise<void> {
    await this.db.query(
      `INSERT INTO grok_messages(message_id, session_id, role, content, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), run.sessionId, "action", txHash, { txHash, url }]
    );
    await this.pruneHistory();
  }

  private async pruneHistory(): Promise<void> {
    await this.db.query(
      `DELETE FROM grok_messages
       WHERE message_id IN (
         SELECT m.message_id
         FROM grok_messages m
         JOIN grok_sessions s ON s.session_id = m.session_id
         WHERE s.origin = 'web'
         ORDER BY m.created_at DESC
         OFFSET $1
       )`,
      [this.env.GROK_HISTORY_LIMIT]
    );
  }
}
