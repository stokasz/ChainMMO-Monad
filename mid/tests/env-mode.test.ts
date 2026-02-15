import { describe, expect, it } from "vitest";
import { loadEnv } from "../src/config/env.js";

function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    prev[k] = process.env[k];
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  }
}

const baseRequired = {
  NODE_ENV: "test",
  CHAIN_RPC_URL: "http://127.0.0.1:8555",
  CHAIN_ID: "31337",
  GAMEWORLD_ADDRESS: "0x0000000000000000000000000000000000000001",
  FEEVAULT_ADDRESS: "0x0000000000000000000000000000000000000002",
  ITEMS_ADDRESS: "0x0000000000000000000000000000000000000003",
  MMO_ADDRESS: "0x0000000000000000000000000000000000000004",
  TRADE_ESCROW_ADDRESS: "0x0000000000000000000000000000000000000005",
  RFQ_MARKET_ADDRESS: "0x0000000000000000000000000000000000000006",
  DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:5432/chainmmo"
};

describe("env modes", () => {
  it("defaults to read-only mode when MID_MODE is unset", () => {
    const env = withEnv(
      {
        ...baseRequired,
        MID_MODE: undefined,
        SIGNER_PRIVATE_KEY: undefined
      },
      () => loadEnv()
    );
    expect(env.MID_MODE).toBe("read-only");
    expect(env.SIGNER_PRIVATE_KEY).toBeUndefined();
  });

  it("allows read-only mode without SIGNER_PRIVATE_KEY", () => {
    const env = withEnv(
      {
        ...baseRequired,
        MID_MODE: "read-only",
        SIGNER_PRIVATE_KEY: undefined
      },
      () => loadEnv()
    );
    expect(env.MID_MODE).toBe("read-only");
    expect(env.SIGNER_PRIVATE_KEY).toBeUndefined();
  });

  it("treats empty SIGNER_PRIVATE_KEY as unset", () => {
    const env = withEnv(
      {
        ...baseRequired,
        MID_MODE: "read-only",
        SIGNER_PRIVATE_KEY: ""
      },
      () => loadEnv()
    );
    expect(env.SIGNER_PRIVATE_KEY).toBeUndefined();
  });

  it("treats empty X oauth env as unset", () => {
    const env = withEnv(
      {
        ...baseRequired,
        MID_MODE: "read-only",
        X_CONSUMER_KEY: "",
        X_CONSUMER_SECRET: "",
        X_OAUTH_CALLBACK_URL: "",
        X_WEB_ORIGIN: ""
      },
      () => loadEnv()
    );
    expect(env.X_CONSUMER_KEY).toBeUndefined();
    expect(env.X_CONSUMER_SECRET).toBeUndefined();
    expect(env.X_OAUTH_CALLBACK_URL).toBeUndefined();
    expect(env.X_WEB_ORIGIN).toBeUndefined();
  });

  it("requires SIGNER_PRIVATE_KEY in full mode", () => {
    expect(() =>
      withEnv(
        {
          ...baseRequired,
          MID_MODE: "full",
          SIGNER_PRIVATE_KEY: undefined
        },
        () => loadEnv()
      )
    ).toThrow();
  });

  it("rejects empty SIGNER_PRIVATE_KEY in full mode", () => {
    expect(() =>
      withEnv(
        {
          ...baseRequired,
          MID_MODE: "full",
          SIGNER_PRIVATE_KEY: ""
        },
        () => loadEnv()
      )
    ).toThrow();
  });

  it("parses ACTION_REQUIRE_PREFLIGHT_SUCCESS boolean env", () => {
    const enabled = withEnv(
      {
        ...baseRequired,
        MID_MODE: "read-only",
        ACTION_REQUIRE_PREFLIGHT_SUCCESS: "true"
      },
      () => loadEnv()
    );
    expect(enabled.ACTION_REQUIRE_PREFLIGHT_SUCCESS).toBe(true);

    const disabled = withEnv(
      {
        ...baseRequired,
        MID_MODE: "read-only",
        ACTION_REQUIRE_PREFLIGHT_SUCCESS: "false"
      },
      () => loadEnv()
    );
    expect(disabled.ACTION_REQUIRE_PREFLIGHT_SUCCESS).toBe(false);
  });

  it("parses ACTION_ENABLE_DEPLOYER_CLAIMS boolean env", () => {
    const enabled = withEnv(
      {
        ...baseRequired,
        MID_MODE: "read-only",
        ACTION_ENABLE_DEPLOYER_CLAIMS: "true"
      },
      () => loadEnv()
    );
    expect(enabled.ACTION_ENABLE_DEPLOYER_CLAIMS).toBe(true);

    const disabled = withEnv(
      {
        ...baseRequired,
        MID_MODE: "read-only",
        ACTION_ENABLE_DEPLOYER_CLAIMS: "false"
      },
      () => loadEnv()
    );
    expect(disabled.ACTION_ENABLE_DEPLOYER_CLAIMS).toBe(false);
  });

  it("parses indexer rate-limit retry/backoff knobs", () => {
    const env = withEnv(
      {
        ...baseRequired,
        MID_MODE: "read-only",
        INDEXER_RATE_LIMIT_BACKOFF_MS: "750",
        INDEXER_RATE_LIMIT_RETRY_MAX: "6"
      },
      () => loadEnv()
    );
    expect(env.INDEXER_RATE_LIMIT_BACKOFF_MS).toBe(750);
    expect(env.INDEXER_RATE_LIMIT_RETRY_MAX).toBe(6);
  });

  it("parses grok arena openclaw client overrides", () => {
    const env = withEnv(
      {
        ...baseRequired,
        MID_MODE: "read-only",
        GROK_OPENCLAW_CLIENT_ID: "chainmmo-devnet",
        GROK_OPENCLAW_CLIENT_DISPLAY_NAME: "ChainMMO Devnet",
        GROK_OPENCLAW_CLIENT_MODE: "backend",
        GROK_OPENCLAW_CLIENT_PLATFORM: "linux",
        GROK_OPENCLAW_CLIENT_VERSION: "1.2.3",
        GROK_OPENCLAW_CLIENT_LOCALE: "en-CA",
        GROK_OPENCLAW_CLIENT_SCOPES: "operator.write,operator.admin,operator.approvals"
      },
      () => loadEnv()
    );
    expect(env.GROK_OPENCLAW_CLIENT_ID).toBe("chainmmo-devnet");
    expect(env.GROK_OPENCLAW_CLIENT_DISPLAY_NAME).toBe("ChainMMO Devnet");
    expect(env.GROK_OPENCLAW_CLIENT_MODE).toBe("backend");
    expect(env.GROK_OPENCLAW_CLIENT_PLATFORM).toBe("linux");
    expect(env.GROK_OPENCLAW_CLIENT_VERSION).toBe("1.2.3");
    expect(env.GROK_OPENCLAW_CLIENT_LOCALE).toBe("en-CA");
    expect(env.GROK_OPENCLAW_CLIENT_SCOPES).toEqual([
      "operator.write",
      "operator.admin",
      "operator.approvals"
    ]);
  });

  it("parses grok openclaw token caps", () => {
    const env = withEnv(
      {
        ...baseRequired,
        MID_MODE: "read-only",
        GROK_OPENCLAW_MAX_TOKENS: "1400",
        GROK_OPENCLAW_MAX_COMPLETION_TOKENS: "1300"
      },
      () => loadEnv()
    );

    expect(env.GROK_OPENCLAW_MAX_TOKENS).toBe(1400);
    expect(env.GROK_OPENCLAW_MAX_COMPLETION_TOKENS).toBe(1300);
  });

  it("allows local grok gateway URL on devnet chain", () => {
    const env = withEnv(
      {
        ...baseRequired,
        MID_MODE: "read-only",
        GROK_ARENA_ENABLED: "true",
        GROK_OPENCLAW_GATEWAY_URL: "ws://host.docker.internal:8788",
        GROK_OPENCLAW_GATEWAY_TOKEN: "t-1"
      },
      () => loadEnv()
    );
    expect(env.GROK_ARENA_ENABLED).toBe(true);
  });

  it("rejects local grok gateway URL on non-devnet chain", () => {
    expect(() =>
      withEnv(
        {
          ...baseRequired,
          CHAIN_ID: "143",
          MID_MODE: "read-only",
          GROK_ARENA_ENABLED: "true",
          GROK_OPENCLAW_GATEWAY_URL: "ws://127.0.0.1:8788",
          GROK_OPENCLAW_GATEWAY_TOKEN: "t-1"
        },
        () => loadEnv()
      )
    ).toThrow();
  });
});
