import { describe, expect, it, vi } from "vitest";
import { ActionMetrics } from "../src/action-engine/metrics.js";
import { buildApiServer } from "../src/agent-api/server.js";
import { privateKeyToAccount } from "viem/accounts";

describe("X linking (wallet <-> X)", () => {
  it("POST /auth/x/start returns 503 when X OAuth is not configured", async () => {
    const app = await buildApiServer({
      env: {} as any,
      metrics: new ActionMetrics(),
      readModel: {} as any,
      db: { query: vi.fn() } as any
    });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/auth/x/start",
        payload: { address: "0x1111111111111111111111111111111111111111" }
      });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ error: "x_oauth_unavailable" });
    } finally {
      await app.close();
    }
  });

  it("POST /auth/x/start returns an authorize URL and stores the request token", async () => {
    const db = { query: vi.fn(async () => []) } as any;
    const xOAuthClient = {
      requestToken: vi.fn(async () => ({ oauthToken: "rt_1", oauthTokenSecret: "rts_1" }))
    };

    const app = await buildApiServer({
      env: {
        X_CONSUMER_KEY: "ck",
        X_CONSUMER_SECRET: "cs",
        X_OAUTH_CALLBACK_URL: "http://127.0.0.1:8787/auth/x/callback",
        X_WEB_ORIGIN: "http://localhost:5173"
      } as any,
      metrics: new ActionMetrics(),
      readModel: {} as any,
      db,
      xOAuthClient: xOAuthClient as any
    });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/auth/x/start",
        payload: { address: "0x1111111111111111111111111111111111111111" }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        authorizeUrl: "https://api.twitter.com/oauth/authenticate?oauth_token=rt_1"
      });
      expect(xOAuthClient.requestToken).toHaveBeenCalledWith("http://127.0.0.1:8787/auth/x/callback");
      expect(db.query).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });

  it("GET /auth/x/pending/:linkToken returns the message to sign", async () => {
    const db = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("FROM x_pending_link_tokens")) {
          return [
            {
              link_token: "lt_1",
              address: "0x1111111111111111111111111111111111111111",
              x_user_id: "123",
              x_username: "alice",
              created_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 60_000).toISOString()
            }
          ];
        }
        return [];
      })
    } as any;

    const app = await buildApiServer({
      env: { X_WEB_ORIGIN: "http://localhost:5173" } as any,
      metrics: new ActionMetrics(),
      readModel: {} as any,
      db
    });

    try {
      const response = await app.inject({ method: "GET", url: "/auth/x/pending/lt_1" });
      expect(response.statusCode).toBe(200);
      const json = response.json() as any;
      expect(json).toEqual(
        expect.objectContaining({
          address: "0x1111111111111111111111111111111111111111",
          xUserId: "123",
          xUsername: "alice",
          message: expect.stringContaining("ChainMMO")
        })
      );
    } finally {
      await app.close();
    }
  });

  it("POST /auth/x/finalize verifies signature and persists identity", async () => {
    const now = Date.now();
    const record = {
      link_token: "lt_2",
      address: "0x0000000000000000000000000000000000000000",
      x_user_id: "456",
      x_username: "bob",
      created_at: new Date(now).toISOString(),
      expires_at: new Date(now + 60_000).toISOString()
    };

    const db = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("FROM x_pending_link_tokens")) {
          return [record];
        }
        return [];
      })
    } as any;

    const account = privateKeyToAccount("0x0123456789012345678901234567890123456789012345678901234567890123");
    // Force the pending record to match the signing wallet.
    record.address = account.address.toLowerCase();

    const xOAuthClient = {};
    const app = await buildApiServer({
      env: { X_WEB_ORIGIN: "http://localhost:5173" } as any,
      metrics: new ActionMetrics(),
      readModel: {} as any,
      db,
      xOAuthClient: xOAuthClient as any
    });

    try {
      const pending = await app.inject({ method: "GET", url: "/auth/x/pending/lt_2" });
      expect(pending.statusCode).toBe(200);
      const message = (pending.json() as any).message as string;

      const signature = await account.signMessage({ message });

      const response = await app.inject({
        method: "POST",
        url: "/auth/x/finalize",
        payload: {
          address: account.address,
          linkToken: "lt_2",
          signature
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ ok: true });
      expect(db.query).toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});

