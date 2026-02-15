import { afterEach, describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";
import { OpenClawGatewayClient } from "../src/grok/openclaw-client.js";

function startServer(handler: (ws: import("ws").WebSocket) => void): Promise<{
  wss: WebSocketServer;
  url: string;
}> {
  return new Promise((resolve) => {
    const wss = new WebSocketServer({ port: 0 });
    wss.on("connection", (ws) => handler(ws));
    wss.on("listening", () => {
      const address = wss.address();
      if (!address || typeof address === "string") {
        throw new Error("expected_tcp_listener");
      }
      resolve({ wss, url: `ws://127.0.0.1:${address.port}` });
    });
  });
}

describe("OpenClawGatewayClient", () => {
  let wss: WebSocketServer | null = null;

  afterEach(async () => {
    await new Promise<void>((resolve) => wss?.close(() => resolve()));
    wss = null;
  });

  it("connects when gateway sends connect.challenge", async () => {
    let connectParams: any = null;
    const started = await startServer((ws) => {
      ws.send(JSON.stringify({ type: "event", event: "connect.challenge", payload: { nonce: "n-1" } }));
      ws.on("message", (raw) => {
        const msg = JSON.parse(String(raw));
        if (msg?.type !== "req") return;
        if (msg.method !== "connect") return;
        connectParams = msg.params;
        ws.send(JSON.stringify({ type: "res", id: msg.id, ok: true, payload: {} }));
      });
    });
    wss = started.wss;

    const client = new OpenClawGatewayClient({ url: started.url, token: "t-1", requestTimeoutMs: 2000 });
    client.start();
    try {
      await client.waitUntilReady(2000);
      expect(client.connected).toBe(true);
      expect(Array.isArray(connectParams?.scopes)).toBe(true);
      expect(connectParams?.scopes).toContain("operator.write");
      expect(connectParams?.scopes).toContain("operator.admin");
      expect(connectParams?.scopes).toContain("operator.approvals");
      expect(connectParams?.scopes).toContain("operator.pairing");
    } finally {
      client.stop();
    }
  });

  it("connects when gateway does not send connect.challenge", async () => {
    let connectParams: any = null;
    const started = await startServer((ws) => {
      ws.on("message", (raw) => {
        const msg = JSON.parse(String(raw));
        if (msg?.type !== "req") return;
        if (msg.method !== "connect") return;
        connectParams = msg.params;
        ws.send(JSON.stringify({ type: "res", id: msg.id, ok: true, payload: {} }));
      });
    });
    wss = started.wss;

    const client = new OpenClawGatewayClient({ url: started.url, token: "t-1", requestTimeoutMs: 2000 });
    client.start();
    try {
      await client.waitUntilReady(2000);
      expect(client.connected).toBe(true);
      expect(connectParams?.client?.id).toBe("gateway-client");
      expect(connectParams?.client?.displayName).toBeUndefined();
      expect(connectParams?.client?.version).toBe("1.0.0");
      expect(connectParams?.client?.platform).toBe("node");
      expect(connectParams?.client?.mode).toBe("backend");
      expect(connectParams?.scopes).toContain("operator.write");
    } finally {
      client.stop();
    }
  });

  it("accepts explicit client and scope overrides", async () => {
    let connectParams: any = null;
    const started = await startServer((ws) => {
      ws.on("message", (raw) => {
        const msg = JSON.parse(String(raw));
        if (msg?.type !== "req") return;
        if (msg.method !== "connect") return;
        connectParams = msg.params;
        ws.send(JSON.stringify({ type: "res", id: msg.id, ok: true, payload: {} }));
      });
    });
    wss = started.wss;

    const client = new OpenClawGatewayClient({
      url: started.url,
      token: "t-1",
      requestTimeoutMs: 2000,
      clientName: "chainmmo-devnet",
      clientDisplayName: "ChainMMO Devnet",
      clientVersion: "0.1.0",
      platform: "linux",
      mode: "backend",
      locale: "en-CA",
      userAgent: "chainmmo-mid",
      scopes: ["operator.read", "operator.write"]
    });
    client.start();
    try {
      await client.waitUntilReady(2000);
      expect(connectParams?.client?.id).toBe("chainmmo-devnet");
      expect(connectParams?.client?.displayName).toBe("ChainMMO Devnet");
      expect(connectParams?.client?.version).toBe("0.1.0");
      expect(connectParams?.client?.platform).toBe("linux");
      expect(connectParams?.client?.mode).toBe("backend");
      expect(connectParams?.userAgent).toBe("chainmmo-mid");
      expect(connectParams?.locale).toBe("en-CA");
      expect(connectParams?.scopes).toEqual(["operator.read", "operator.write"]);
    } finally {
      client.stop();
    }
  });
});
