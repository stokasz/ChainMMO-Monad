import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import WebSocket from "ws";

export type OpenClawGatewayEvent = {
  event: string;
  payload?: unknown;
  seq?: number;
  stateVersion?: number;
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout?: NodeJS.Timeout;
};

export type OpenClawGatewayOptions = {
  url: string;
  token: string;
  requestTimeoutMs?: number;
  clientName?: string;
  clientDisplayName?: string;
  clientVersion?: string;
  mode?: string;
  scopes?: string[];
  platform?: string;
  locale?: string;
  userAgent?: string;
};

const DEFAULT_SCOPES = [
  "operator.admin",
  "operator.approvals",
  "operator.pairing",
  "operator.write"
] as const;
const DEFAULT_PROTOCOL = 3;
const DEFAULT_CAPS = ["tool-events"] as const;
const CONNECT_CHALLENGE_FALLBACK_MS = 500;

export class OpenClawGatewayClient extends EventEmitter {
  private readonly opts: OpenClawGatewayOptions;
  private ws: WebSocket | null = null;
  private readonly pending = new Map<string, PendingRequest>();
  private backoffMs = 800;
  private closed = false;
  private connectNonce: string | null = null;
  private connectSent = false;
  private connectTimer: NodeJS.Timeout | null = null;
  private readyPromise: Promise<void> | null = null;
  private readyResolve: (() => void) | null = null;
  private readyReject: ((error: Error) => void) | null = null;

  public connected = false;

  constructor(opts: OpenClawGatewayOptions) {
    super();
    this.opts = opts;
  }

  public start(): void {
    this.closed = false;
    this.connect();
  }

  public stop(): void {
    this.closed = true;
    this.connected = false;
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
    this.readyReject?.(new Error("openclaw_gateway_stopped"));
    this.readyPromise = null;
    this.readyResolve = null;
    this.readyReject = null;
    this.flushPending(new Error("openclaw_gateway_stopped"));
    this.ws?.close();
    this.ws = null;
  }

  public async waitUntilReady(timeoutMs = 5000): Promise<void> {
    if (this.connected) return;
    if (!this.readyPromise) {
      this.readyPromise = new Promise<void>((resolve, reject) => {
        this.readyResolve = resolve;
        this.readyReject = reject;
      });
    }
    if (timeoutMs <= 0) return this.readyPromise;
    await Promise.race([
      this.readyPromise,
      new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error("openclaw_gateway_ready_timeout")), timeoutMs);
      })
    ]);
  }

  public async request(method: string, params: unknown): Promise<unknown> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("openclaw_gateway_not_connected");
    }
    const id = randomUUID();
    const payload = { type: "req", id, method, params };

    return new Promise((resolve, reject) => {
      const timeoutMs = this.opts.requestTimeoutMs ?? 15000;
      const entry: PendingRequest = { resolve, reject };
      if (timeoutMs > 0) {
        entry.timeout = setTimeout(() => {
          this.pending.delete(id);
          reject(new Error(`openclaw_gateway_timeout:${method}`));
        }, timeoutMs);
      }
      this.pending.set(id, entry);
      this.ws?.send(JSON.stringify(payload));
    });
  }

  private connect(): void {
    if (this.closed) return;
    this.ws = new WebSocket(this.opts.url);
    this.ws.on("open", () => {
      // Some gateways emit connect.challenge (legacy) but others expect connect immediately.
      // Start a fallback timer so we don't hang forever when no challenge event is sent.
      if (this.connectTimer) clearTimeout(this.connectTimer);
      this.connectTimer = setTimeout(() => {
        this.connectTimer = null;
        void this.sendConnect();
      }, CONNECT_CHALLENGE_FALLBACK_MS);
    });
    this.ws.on("message", (data) => this.handleMessage(String(data)));
    this.ws.on("close", (code, reason) => {
      const reasonText = reason?.toString() ?? "";
      this.connected = false;
      this.connectNonce = null;
      this.connectSent = false;
      if (this.connectTimer) {
        clearTimeout(this.connectTimer);
        this.connectTimer = null;
      }
      this.readyReject?.(new Error(`openclaw_gateway_closed:${code}:${reasonText}`));
      this.readyPromise = null;
      this.readyResolve = null;
      this.readyReject = null;
      this.flushPending(new Error(`openclaw_gateway_closed:${code}`));
      if (this.closed) return;
      this.scheduleReconnect();
    });
    this.ws.on("error", () => {
      // Errors are handled via close events.
    });
  }

  private scheduleReconnect(): void {
    if (this.closed) return;
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 1.7, 15000);
    setTimeout(() => this.connect(), delay);
  }

  private flushPending(error: Error): void {
    for (const [, entry] of this.pending) {
      if (entry.timeout) clearTimeout(entry.timeout);
      entry.reject(error);
    }
    this.pending.clear();
  }

  private async sendConnect(): Promise<void> {
    if (this.connectSent || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.connectSent = true;
    const requestedScopes = this.opts.scopes && this.opts.scopes.length > 0 ? this.opts.scopes : [...DEFAULT_SCOPES];
    const scopeSet = new Set<string>();
    for (const scope of requestedScopes) {
      const value = typeof scope === "string" ? scope.trim() : "";
      if (value) {
        scopeSet.add(value);
      }
    }
    const scopes = [...scopeSet];

    const clientName = this.opts.clientName ?? "gateway-client";
    const params = {
      minProtocol: DEFAULT_PROTOCOL,
      maxProtocol: DEFAULT_PROTOCOL,
      client: {
        id: clientName,
        displayName: this.opts.clientDisplayName,
        version: this.opts.clientVersion ?? "1.0.0",
        platform: this.opts.platform ?? "node",
        mode: this.opts.mode ?? "backend",
        instanceId: randomUUID()
      },
      role: "operator",
      scopes,
      caps: [...DEFAULT_CAPS],
      auth: { token: this.opts.token },
      userAgent: this.opts.userAgent ?? clientName,
      locale: this.opts.locale ?? "en-US"
    } as const;

    try {
      await this.request("connect", params);
      this.connected = true;
      this.backoffMs = 800;
      this.readyResolve?.();
      this.emit("ready");
    } catch (error) {
      this.ws?.close(4008, "connect failed");
      const err = error instanceof Error ? error : new Error(String(error));
      this.readyReject?.(err);
    }
  }

  private handleMessage(raw: string): void {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg?.type === "event") {
      const event = msg as OpenClawGatewayEvent & { event: string; payload?: any };
      if (event.event === "connect.challenge") {
        this.connectNonce = typeof event.payload?.nonce === "string" ? event.payload.nonce : null;
        if (this.connectTimer) {
          clearTimeout(this.connectTimer);
          this.connectTimer = null;
        }
        void this.sendConnect();
        return;
      }
      this.emit("event", event);
      return;
    }
    if (msg?.type === "res") {
      const entry = this.pending.get(msg.id);
      if (!entry) return;
      this.pending.delete(msg.id);
      if (entry.timeout) clearTimeout(entry.timeout);
      if (msg.ok) {
        entry.resolve(msg.payload);
      } else {
        const message = msg.error?.message ?? "openclaw_gateway_request_failed";
        entry.reject(new Error(message));
      }
    }
  }
}
