import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ quiet: true });

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const booleanFromEnv = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (value === true || value === false) {
    return value;
  }
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return value;
}, z.boolean());

const baseEnvSchema = z.object({
  MID_MODE: z.enum(["full", "read-only"]).default("read-only"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),

  CONTRACTS_JSON_PATH: z.string().min(1).optional(),
  EXTERNAL_TOKENS_JSON_PATH: z.string().min(1).optional(),
  PLAYBOOK_PATH: z.string().min(1).optional(),

  CHAIN_RPC_URL: z.string().url(),
  CHAIN_ID: z.coerce.number().int().positive(),
  CHAIN_CONFIRMATIONS: z.coerce.number().int().min(0).default(0),
  CHAIN_START_BLOCK: z.coerce.number().int().min(0).default(1),
  CHAIN_PUBLIC_RPC_URL: z.preprocess(
    (v) => (typeof v === "string" && v.trim().length === 0 ? undefined : v),
    z.string().url().optional()
  ),
  CHAIN_PUBLIC_RPC_URLS: z.preprocess(
    (v) => (typeof v === "string" && v.trim().length === 0 ? undefined : v),
    z.string().optional()
  ),
  CHAIN_EXPLORER_BASE_URL: z.string().url().default("https://monadvision.com"),

  GAMEWORLD_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).default(ZERO_ADDRESS),
  FEEVAULT_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).default(ZERO_ADDRESS),
  ITEMS_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).default(ZERO_ADDRESS),
  MMO_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).default(ZERO_ADDRESS),
  TRADE_ESCROW_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).default(ZERO_ADDRESS),
  RFQ_MARKET_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).default(ZERO_ADDRESS),
  MMODISTRIBUTOR_ADDRESS: z.preprocess(
    (v) => (typeof v === "string" && v.trim().length === 0 ? undefined : v),
    z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional()
  ),

  SIGNER_PRIVATE_KEY: z.preprocess(
    (v) => (typeof v === "string" && v.trim().length === 0 ? undefined : v),
    z
      .string()
      .regex(/^0x[a-fA-F0-9]{64}$/)
      .optional()
  ),

  DATABASE_URL: z.string().min(1),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(256).default(64),
  DATABASE_POOL_IDLE_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300_000).default(30_000),
  DATABASE_POOL_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(500).max(120_000).default(5_000),

  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().int().positive().default(8787),
  API_KEY: z.string().optional().transform((v) => (v && v.length > 0 ? v : undefined)),
  MCP_STIPEND_WALLET_PRIVATE_KEY: z.preprocess(
    (v) => (typeof v === "string" && v.trim().length === 0 ? undefined : v),
    z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional()
  ),
  MCP_STIPEND_ENABLED: booleanFromEnv.default(false),
  MCP_STIPEND_AMOUNT_WEI: z.coerce.string().default("100000000000000000"),
  MCP_STIPEND_MIN_BALANCE_WEI: z.coerce.string().default("100000000000000000"),
  MCP_STIPEND_WALLET_MIN_BALANCE_WEI: z.coerce.string().default("200000000000000000"),
  MCP_STIPEND_ADDRESS_COOLDOWN_SECONDS: z.coerce.number().int().min(60).default(900),
  MCP_STIPEND_PER_ADDRESS_LIMIT_PER_WINDOW: z.coerce.number().int().min(1).max(1000).default(2),
  MCP_STIPEND_GLOBAL_PER_HOUR_LIMIT: z.coerce.number().int().min(1).max(10000).default(60),

  GROK_ARENA_ENABLED: booleanFromEnv.default(false),
  GROK_OPENCLAW_GATEWAY_URL: z.preprocess(
    (v) => (typeof v === "string" && v.trim().length === 0 ? undefined : v),
    z.string().url().optional()
  ),
  GROK_OPENCLAW_GATEWAY_TOKEN: z.preprocess(
    (v) => (typeof v === "string" && v.trim().length === 0 ? undefined : v),
    z.string().min(1).optional()
  ),
  GROK_OPENCLAW_CLIENT_ID: z.preprocess(
    (v) => (typeof v === "string" && v.trim().length === 0 ? undefined : v),
    z.string().min(1).max(64).optional()
  ),
  GROK_OPENCLAW_CLIENT_DISPLAY_NAME: z.preprocess(
    (v) => (typeof v === "string" && v.trim().length === 0 ? undefined : v),
    z.string().min(1).max(64).optional()
  ),
  GROK_OPENCLAW_CLIENT_MODE: z.preprocess(
    (v) => (typeof v === "string" && v.trim().length === 0 ? undefined : v),
    z.string().min(1).max(24).optional()
  ),
  GROK_OPENCLAW_CLIENT_PLATFORM: z.preprocess(
    (v) => (typeof v === "string" && v.trim().length === 0 ? undefined : v),
    z.string().min(1).max(32).optional()
  ),
  GROK_OPENCLAW_CLIENT_VERSION: z.preprocess(
    (v) => (typeof v === "string" && v.trim().length === 0 ? undefined : v),
    z.string().min(1).max(64).optional()
  ),
  GROK_OPENCLAW_CLIENT_LOCALE: z.preprocess(
    (v) => (typeof v === "string" && v.trim().length === 0 ? undefined : v),
    z.string().min(1).max(32).optional()
  ),
  GROK_OPENCLAW_CLIENT_SCOPES: z.preprocess(
    (v) => {
      if (typeof v !== "string") return undefined;
      const trimmed = v.trim();
      if (!trimmed) return undefined;
      const items = trimmed.split(",").map((scope) => scope.trim()).filter(Boolean);
      return items.length ? items : undefined;
    },
    z.array(z.string().min(1)).optional()
  ),
  GROK_OPENCLAW_MAX_TOKENS: z.coerce.number().int().min(64).max(32000).default(1024),
  GROK_OPENCLAW_MAX_COMPLETION_TOKENS: z.coerce.number().int().min(64).max(32000).default(1024),
  GROK_OPENCLAW_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(15_000),
  GROK_GATEWAY_READY_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(5_000),
  GROK_AGENT_ID: z.string().min(1).default("chainmmo"),
  GROK_AGENT_ADDRESS: z.preprocess(
    (v) => (typeof v === "string" && v.trim().length === 0 ? undefined : v),
    z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional()
  ),
  GROK_PROMPT_MAX_CHARS: z.coerce.number().int().min(1).max(4000).default(600),
  GROK_HISTORY_LIMIT: z.coerce.number().int().min(1).max(200).default(10),
  GROK_RATE_LIMIT_COOLDOWN_SECONDS: z.coerce.number().int().min(1).max(3600).default(10),
  GROK_RATE_LIMIT_PER_HOUR: z.coerce.number().int().min(1).max(1000).default(20),
  GROK_IP_HASH_SALT: z.preprocess(
    (v) => (typeof v === "string" && v.trim().length === 0 ? undefined : v),
    z.string().optional()
  ),

  INDEXER_POLL_MS: z.coerce.number().int().positive().default(1500),
  INDEXER_BLOCK_CHUNK: z.coerce.number().int().positive().max(2000).default(200),
  INDEXER_MAX_BLOCKS_PER_TICK: z.coerce.number().int().positive().max(200_000).default(2000),
  INDEXER_RATE_LIMIT_BACKOFF_MS: z.coerce.number().int().positive().max(120_000).default(500),
  INDEXER_RATE_LIMIT_RETRY_MAX: z.coerce.number().int().min(0).max(20).default(4),
  ACTION_WORKER_POLL_MS: z.coerce.number().int().positive().default(500),
  ACTION_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(128).default(8),
  ACTION_RETRY_MAX: z.coerce.number().int().positive().default(3),
  ACTION_RETRY_BACKOFF_MS: z.coerce.number().int().positive().default(800),
  ACTION_REQUIRE_PREFLIGHT_SUCCESS: booleanFromEnv.default(false),
  ACTION_ENABLE_DEPLOYER_CLAIMS: booleanFromEnv.default(false),

  X_PROFILE_URL: z.string().url().default("https://x.com/stokasz"),

  // X OAuth 1.0a (Sign in with X) for linking wallet addresses to X identities.
  // Optional: when unset, /auth/x/* endpoints return 503 and the app runs normally.
  X_CONSUMER_KEY: z.preprocess(
    (v) => (typeof v === "string" && v.trim().length === 0 ? undefined : v),
    z.string().min(1).optional()
  ),
  X_CONSUMER_SECRET: z.preprocess(
    (v) => (typeof v === "string" && v.trim().length === 0 ? undefined : v),
    z.string().min(1).optional()
  ),
  X_OAUTH_CALLBACK_URL: z.preprocess(
    (v) => (typeof v === "string" && v.trim().length === 0 ? undefined : v),
    z.string().url().optional()
  ),
  X_WEB_ORIGIN: z.preprocess(
    (v) => (typeof v === "string" && v.trim().length === 0 ? undefined : v),
    z.string().url().optional()
  )
});

const envSchema = baseEnvSchema.superRefine((env, ctx) => {
  if (env.MID_MODE !== "read-only" && !env.SIGNER_PRIVATE_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["SIGNER_PRIVATE_KEY"],
      message: "SIGNER_PRIVATE_KEY is required unless MID_MODE=read-only"
    });
  }

  if (env.GROK_ARENA_ENABLED) {
    if (!env.GROK_OPENCLAW_GATEWAY_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["GROK_OPENCLAW_GATEWAY_URL"],
        message: "GROK_OPENCLAW_GATEWAY_URL is required when GROK_ARENA_ENABLED=true"
      });
    }
    if (!env.GROK_OPENCLAW_GATEWAY_TOKEN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["GROK_OPENCLAW_GATEWAY_TOKEN"],
        message: "GROK_OPENCLAW_GATEWAY_TOKEN is required when GROK_ARENA_ENABLED=true"
      });
    }

    // Production safety rail: devnet can point at a local gateway, but non-devnet deployments should not.
    // In containerized deployments, localhost almost never refers to the intended gateway and causes a silent outage.
    if (env.GROK_OPENCLAW_GATEWAY_URL && env.CHAIN_ID !== 31337) {
      try {
        const parsed = new URL(env.GROK_OPENCLAW_GATEWAY_URL);
        const host = parsed.hostname.toLowerCase();
        const localHosts = new Set([
          "localhost",
          "127.0.0.1",
          "0.0.0.0",
          "::1",
          "host.docker.internal"
        ]);
        if (localHosts.has(host)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["GROK_OPENCLAW_GATEWAY_URL"],
            message:
              "GROK_OPENCLAW_GATEWAY_URL must not point at localhost/host.docker.internal for non-devnet chains; use a server-hosted OpenClaw gateway reachable from the deployed middleware"
          });
        }
      } catch {
        // If URL parsing fails, zod's url() validation will already reject it.
      }
    }
  }
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  return envSchema.parse(process.env);
}
