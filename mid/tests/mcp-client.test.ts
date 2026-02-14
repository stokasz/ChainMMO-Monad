import { describe, expect, it, vi } from "vitest";
import { createAgentApiClient } from "../src/mcp-server/client.js";

describe("mcp agent api client", () => {
  it("sends x-api-key and idempotency-key on action submission", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: any) => {
      if (url === "http://example/agent/action") {
        expect(init.method).toBe("POST");
        expect(init.headers["x-api-key"]).toBe("k");
        expect(init.headers["idempotency-key"]).toBe("idem");
        return {
          ok: true,
          status: 200,
          json: async () => ({ actionId: "a1" })
        } as any;
      }
      if (url === "http://example/agent/action/a1") {
        expect(init?.method).toBeUndefined();
        expect(init?.headers?.["x-api-key"]).toBe("k");
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: "succeeded" })
        } as any;
      }
      throw new Error(`unexpected:${url}`);
    });

    const client = createAgentApiClient({
      baseUrl: "http://example",
      apiKey: "k",
      fetchImpl
    });

    const status = await client.submitAction({ type: "create_character" }, { wait: true, idempotencyKey: "idem" });
    expect(status).toMatchObject({ status: "succeeded", idempotencyKey: "idem" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("auto-generates idempotency-key when omitted", async () => {
    let sentIdempotencyKey: string | undefined;
    const fetchImpl = vi.fn(async (url: string, init?: any) => {
      if (url === "http://example/agent/action") {
        sentIdempotencyKey = init.headers["idempotency-key"];
        expect(typeof sentIdempotencyKey).toBe("string");
        expect(sentIdempotencyKey).toMatch(/^mcp-/);
        return {
          ok: true,
          status: 200,
          json: async () => ({ actionId: "a1" })
        } as any;
      }
      throw new Error(`unexpected:${url}`);
    });

    const client = createAgentApiClient({
      baseUrl: "http://example",
      fetchImpl
    });

    const queued = await client.submitAction({ type: "create_character" }, { wait: false });
    expect(queued).toMatchObject({
      actionId: "a1",
      idempotencyKey: sentIdempotencyKey
    });
  });

  it("includes x-api-key on GET requests", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: any) => {
      expect(url).toBe("http://example/health");
      expect(init?.headers?.["x-api-key"]).toBe("k");
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true })
      } as any;
    });

    const client = createAgentApiClient({
      baseUrl: "http://example",
      apiKey: "k",
      fetchImpl
    });

    await expect(client.getJson("/health")).resolves.toEqual({ ok: true });
  });

  it("sends x-api-key on POST JSON requests", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: any) => {
      expect(url).toBe("http://example/agent/preflight");
      expect(init.method).toBe("POST");
      expect(init.headers["content-type"]).toBe("application/json");
      expect(init.headers["x-api-key"]).toBe("k");
      expect(JSON.parse(init.body)).toEqual({
        type: "create_character",
        race: 0,
        classType: 0,
        name: "Ada"
      });
      return {
        ok: true,
        status: 200,
        json: async () => ({ willSucceed: true })
      } as any;
    });

    const client = createAgentApiClient({
      baseUrl: "http://example",
      apiKey: "k",
      fetchImpl
    });

    await expect(
      client.postJson("/agent/preflight", {
        type: "create_character",
        race: 0,
        classType: 0,
        name: "Ada"
      })
    ).resolves.toEqual({ willSucceed: true });
  });

  it("blocks write submit when session spend ceiling would be exceeded", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: any) => {
      if (url === "http://example/agent/estimate-cost") {
        expect(init.method).toBe("POST");
        return {
          ok: true,
          status: 200,
          json: async () => ({ totalEstimatedCostWei: "101" })
        } as any;
      }
      throw new Error(`unexpected:${url}`);
    });

    const client = createAgentApiClient({
      baseUrl: "http://example",
      fetchImpl,
      sessionSpendCeilingWei: "100"
    });

    const result = await client.submitAction({ type: "create_character" }, { wait: false });
    expect(result).toMatchObject({
      code: "SPEND_GUARD_CEILING_EXCEEDED"
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("blocks new writes after max failed tx guard is reached", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url === "http://example/agent/action") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ actionId: "a1" })
        } as any;
      }
      if (url === "http://example/agent/action/a1") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: "failed", errorCode: "CHAIN_INVALID_REVEAL" })
        } as any;
      }
      throw new Error(`unexpected:${url}`);
    });

    const client = createAgentApiClient({
      baseUrl: "http://example",
      fetchImpl,
      maxFailedTx: 1
    });

    const first = await client.submitAction({ type: "create_character" }, { wait: true });
    expect(first).toMatchObject({ status: "failed" });

    const second = await client.submitAction({ type: "create_character" }, { wait: true });
    expect(second).toMatchObject({ code: "FAILED_TX_GUARD_TRIGGERED", failedTxCount: 1, maxFailedTx: 1 });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
