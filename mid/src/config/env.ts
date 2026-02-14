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

  X_PROFILE_URL: z.string().url().default("https://x.com/chainmmo"),

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
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  return envSchema.parse(process.env);
}
