import Fastify from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { recoverMessageAddress } from "viem";
import type { Env } from "../config/env.js";
import {
  supportedReadApiEndpoints,
  supportedReadMcpTools,
  supportedWriteApiEndpoints,
  supportedWriteMcpTools
} from "../shared/capabilities.js";
import { agentActionInputSchema, paginationQuerySchema, rfqListingQuerySchema, tradeListingQuerySchema } from "../shared/schemas.js";
import type { ActionCostEstimator } from "../action-engine/cost-estimator.js";
import { ActionRepository } from "../action-engine/repository.js";
import type { ActionPreflight } from "../action-engine/preflight.js";
import type { ActionTxIntentBuilder } from "../action-engine/tx-intents.js";
import type { ActionValidMenu } from "../action-engine/valid-actions.js";
import { AgentReadModel } from "./read-model.js";
import { ActionMetrics } from "../action-engine/metrics.js";
import { loadPlaybookSectionsFromFile, resolveDefaultPlaybookPath, type PlaybookSection } from "./playbook.js";
import { normalizeError } from "../action-engine/errors.js";
import type { Database } from "../storage/db.js";
import { ChainAdapter } from "../chain-adapter/client.js";
import { createXOauth1Client, type XOAuth1Client } from "../auth/x-oauth1.js";

export interface ApiDependencies {
  env: Env;
  metrics: ActionMetrics;
  readModel: AgentReadModel;
  db?: Database;
  chain?: ChainAdapter;
  signerAddress?: string;
  actionRepository?: ActionRepository;
  actionPreflight?: ActionPreflight;
  actionCostEstimator?: ActionCostEstimator;
  actionTxIntentBuilder?: ActionTxIntentBuilder;
  actionValidMenu?: ActionValidMenu;
  xOAuthClient?: XOAuth1Client;
}

const WRITE_PATH_GAS_FLOOR = 250_000n;
const PUBLIC_MONAD_RPC_URLS_BY_CHAIN_ID: Record<number, string[]> = {
  143: ["https://rpc.monad.xyz", "https://monad-mainnet.api.onfinality.io/public"],
  10143: ["https://testnet-rpc.monad.xyz", "https://monad-testnet.api.onfinality.io/public"]
};

export async function buildApiServer(deps: ApiDependencies) {
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });
  await app.register(sensible);
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const frontRoot = path.resolve(__dirname, "../../../front");
  const frontDistRoot = path.join(frontRoot, "dist");
  const frontPublicRoot = path.join(frontRoot, "public");

  const distAvailable = await (async () => {
    try {
      await fs.stat(path.join(frontDistRoot, "index.html"));
      return true;
    } catch (error: any) {
      if (error?.code === "ENOENT") return false;
      throw error;
    }
  })();

  const safePathJoin = (root: string, rel: string) => {
    const resolved = path.resolve(root, rel.replace(/^\/+/, ""));
    const expectedPrefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
    if (!resolved.startsWith(expectedPrefix)) {
      return null;
    }
    return resolved;
  };

  const resolveWebAsset = (name: string) => {
    if (distAvailable) {
      const fromDist = path.join(frontDistRoot, name);
      return fromDist;
    }
    return path.join(frontPublicRoot, name);
  };

  const playbookPath = deps.env.PLAYBOOK_PATH ?? resolveDefaultPlaybookPath();
  let playbookSections: PlaybookSection[] | null = null;
  try {
    playbookSections = await loadPlaybookSectionsFromFile(playbookPath);
  } catch (error: any) {
    if (error?.code !== "ENOENT") {
      // Keep the API up even if playbook loading fails; the route will report unavailability.
      // eslint-disable-next-line no-console
      console.error("failed to load playbook", { playbookPath, error });
    }
    playbookSections = null;
  }

  const actionsEnabled = Boolean(deps.signerAddress && deps.actionRepository);
  const mode = actionsEnabled ? "full" : "read-only";
  const onboardConfig = getOnboardConfig(deps.env);
  const onboardFundsEnabled =
    deps.db !== undefined &&
    deps.chain !== undefined &&
    onboardConfig.enabled &&
    Boolean(
      (deps.chain.onboardAccount?.address ?? deps.chain.account?.address)
    );
  const supportedWriteApiEndpointsForMode = (() => {
    const endpoints = actionsEnabled ? [...supportedWriteApiEndpoints] : [];
    if (onboardFundsEnabled && !endpoints.includes("/agent/onboard/fund")) {
      endpoints.push("/agent/onboard/fund");
    }
    return endpoints.filter((endpoint, index, arr) => arr.indexOf(endpoint) === index);
  })();
  const supportedWriteMcpToolsForMode = (() => {
    const tools = actionsEnabled ? [...supportedWriteMcpTools] : [];
    if (onboardFundsEnabled && !tools.includes("request_onboard_funds")) {
      tools.push("request_onboard_funds");
    }
    if (onboardFundsEnabled && !tools.includes("onboard_player")) {
      tools.push("onboard_player");
    }
    if (!onboardFundsEnabled) {
      return tools.filter((tool) => tool !== "request_onboard_funds" && tool !== "onboard_player");
    }
    return tools.filter((tool, index, arr) => arr.indexOf(tool) === index);
  })();

  app.get("/health", async () => ({
    ok: true,
    chainId: deps.env.CHAIN_ID,
    midMode: deps.env.MID_MODE,
    actionsEnabled
  }));
  app.get("/meta/capabilities", async () => ({
    chainId: deps.env.CHAIN_ID,
    mode,
    actionsEnabled,
    actionToolAvailability: actionsEnabled ? "enabled" : "disabled",
    actionsEnabledSemantics:
      "When actionsEnabled=true, server-side signer path is active (custodial write execution by middleware signer).",
    auth: {
      apiKeyRequired: Boolean(deps.env.API_KEY),
      requiredHeader: "x-api-key"
    },
    api: {
      supportedReadEndpoints: [...supportedReadApiEndpoints],
      supportedWriteEndpoints: supportedWriteApiEndpointsForMode
    },
    mcp: {
      supportedReadTools: [...supportedReadMcpTools],
      supportedWriteTools: supportedWriteMcpToolsForMode
    }
  }));

  app.post("/auth/x/start", async (request, reply) => {
    if (!deps.db) {
      return reply.status(503).send({ error: "x_oauth_unavailable" });
    }
    const configured = getXOAuthStartConfig(deps.env);
    if (!configured) {
      return reply.status(503).send({ error: "x_oauth_unavailable" });
    }

    const address = (request.body as { address?: unknown } | null | undefined)?.address;
    if (typeof address !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return reply.status(400).send({ error: "invalid_address" });
    }

    const client = deps.xOAuthClient ?? createXOauth1Client({ consumerKey: configured.consumerKey, consumerSecret: configured.consumerSecret });
    const token = await client.requestToken(configured.callbackUrl);

    const webOrigin = configured.webOrigin;
    await deps.db.query(
      `INSERT INTO x_oauth_request_tokens(oauth_token, oauth_token_secret, address, web_origin, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '10 minutes')
       ON CONFLICT (oauth_token) DO UPDATE SET
         oauth_token_secret = EXCLUDED.oauth_token_secret,
         address = EXCLUDED.address,
         web_origin = EXCLUDED.web_origin,
         expires_at = EXCLUDED.expires_at`,
      [token.oauthToken, token.oauthTokenSecret, address.toLowerCase(), webOrigin]
    );

    return {
      authorizeUrl: `https://api.twitter.com/oauth/authenticate?oauth_token=${encodeURIComponent(token.oauthToken)}`
    };
  });

  app.get("/auth/x/callback", async (request, reply) => {
    if (!deps.db) {
      return reply.status(503).send({ error: "x_oauth_unavailable" });
    }
    const configured = getXOAuthStartConfig(deps.env);
    if (!configured) {
      return reply.status(503).send({ error: "x_oauth_unavailable" });
    }

    const query = request.query as { oauth_token?: string; oauth_verifier?: string };
    const oauthToken = query.oauth_token;
    const oauthVerifier = query.oauth_verifier;
    if (typeof oauthToken !== "string" || oauthToken.length === 0) {
      return reply.status(400).send({ error: "missing_oauth_token" });
    }
    if (typeof oauthVerifier !== "string" || oauthVerifier.length === 0) {
      return reply.status(400).send({ error: "missing_oauth_verifier" });
    }

    const rows = await deps.db.query<{
      oauth_token_secret: string;
      address: string;
      web_origin: string | null;
    }>(
      `SELECT oauth_token_secret, address, web_origin
       FROM x_oauth_request_tokens
       WHERE oauth_token = $1
         AND expires_at > NOW()`,
      [oauthToken]
    );
    if (rows.length === 0) {
      return reply.status(400).send({ error: "invalid_or_expired_oauth_token" });
    }
    const state = rows[0];
    await deps.db.query("DELETE FROM x_oauth_request_tokens WHERE oauth_token = $1", [oauthToken]);

    const client = deps.xOAuthClient ?? createXOauth1Client({ consumerKey: configured.consumerKey, consumerSecret: configured.consumerSecret });
    const identity = await client.accessToken({
      oauthToken,
      oauthTokenSecret: state.oauth_token_secret,
      oauthVerifier
    });

    const linkToken = randomUUID();
    await deps.db.query(
      `INSERT INTO x_pending_link_tokens(link_token, address, x_user_id, x_username, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '10 minutes')`,
      [linkToken, state.address.toLowerCase(), identity.userId, identity.screenName]
    );

    const webOrigin = state.web_origin ?? configured.webOrigin;
    const redirectUrl = new URL(webOrigin);
    redirectUrl.searchParams.set("xlink", linkToken);
    const callbackOrigin = new URL(configured.callbackUrl).origin;
    if (redirectUrl.origin !== callbackOrigin) {
      redirectUrl.searchParams.set("api", callbackOrigin);
    }
    reply.header("Cache-Control", "no-cache");
    return reply.redirect(redirectUrl.toString());
  });

  app.get("/auth/x/pending/:linkToken", async (request, reply) => {
    if (!deps.db) {
      return reply.status(503).send({ error: "x_oauth_unavailable" });
    }
    const webOrigin = getXWebOrigin(deps.env);
    if (!webOrigin) {
      return reply.status(503).send({ error: "x_oauth_unavailable" });
    }

    const linkToken = (request.params as { linkToken?: string }).linkToken;
    if (typeof linkToken !== "string" || linkToken.length === 0) {
      return reply.status(400).send({ error: "invalid_link_token" });
    }

    const rows = await deps.db.query<{
      link_token: string;
      address: string;
      x_user_id: string;
      x_username: string;
      created_at: string;
      expires_at: string;
    }>(
      `SELECT link_token, address, x_user_id, x_username, created_at, expires_at
       FROM x_pending_link_tokens
       WHERE link_token = $1
         AND expires_at > NOW()`,
      [linkToken]
    );
    if (rows.length === 0) {
      return reply.status(404).send({ error: "link_token_not_found" });
    }
    const row = rows[0];
    const message = buildXLinkMessage({
      address: row.address,
      xUserId: row.x_user_id,
      xUsername: row.x_username,
      linkToken: row.link_token,
      issuedAt: row.created_at,
      webOrigin
    });
    reply.header("Cache-Control", "no-cache");
    return {
      address: row.address,
      xUserId: row.x_user_id,
      xUsername: row.x_username,
      message
    };
  });

  app.post("/auth/x/finalize", async (request, reply) => {
    if (!deps.db) {
      return reply.status(503).send({ error: "x_oauth_unavailable" });
    }
    const webOrigin = getXWebOrigin(deps.env);
    if (!webOrigin) {
      return reply.status(503).send({ error: "x_oauth_unavailable" });
    }

    const body = request.body as { address?: unknown; linkToken?: unknown; signature?: unknown } | null | undefined;
    const address = body?.address;
    const linkToken = body?.linkToken;
    const signature = body?.signature;

    if (typeof address !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return reply.status(400).send({ error: "invalid_address" });
    }
    if (typeof linkToken !== "string" || linkToken.length === 0) {
      return reply.status(400).send({ error: "invalid_link_token" });
    }
    if (typeof signature !== "string" || !/^0x[a-fA-F0-9]{130}$/.test(signature)) {
      return reply.status(400).send({ error: "invalid_signature" });
    }

    const rows = await deps.db.query<{
      link_token: string;
      address: string;
      x_user_id: string;
      x_username: string;
      created_at: string;
    }>(
      `SELECT link_token, address, x_user_id, x_username, created_at
       FROM x_pending_link_tokens
       WHERE link_token = $1
         AND expires_at > NOW()`,
      [linkToken]
    );
    if (rows.length === 0) {
      return reply.status(404).send({ error: "link_token_not_found" });
    }
    const row = rows[0];
    if (row.address.toLowerCase() !== address.toLowerCase()) {
      return reply.status(409).send({ error: "link_token_address_mismatch" });
    }

    const message = buildXLinkMessage({
      address: row.address,
      xUserId: row.x_user_id,
      xUsername: row.x_username,
      linkToken: row.link_token,
      issuedAt: row.created_at,
      webOrigin
    });

    const recovered = await recoverMessageAddress({ message, signature: signature as `0x${string}` });
    if (recovered.toLowerCase() !== address.toLowerCase()) {
      return reply.status(400).send({ error: "invalid_signature" });
    }

    try {
      await deps.db.query(
        `INSERT INTO wallet_x_identity(address, x_user_id, x_username, verified_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (address) DO UPDATE SET
           x_user_id = EXCLUDED.x_user_id,
           x_username = EXCLUDED.x_username,
           verified_at = EXCLUDED.verified_at`,
        [address.toLowerCase(), row.x_user_id, row.x_username]
      );
    } catch (error: any) {
      // Postgres unique violation.
      if (error && error.code === "23505") {
        return reply.status(409).send({ error: "x_account_already_linked" });
      }
      throw error;
    }

    await deps.db.query("DELETE FROM x_pending_link_tokens WHERE link_token = $1", [row.link_token]);
    reply.header("Cache-Control", "no-cache");
    return { ok: true };
  });

  app.get("/", async (_, reply) => {
    reply.header("Cache-Control", "no-cache");
    await sendStatic(
      reply,
      distAvailable ? path.join(frontDistRoot, "index.html") : path.join(frontRoot, "index.html"),
      "text/html; charset=utf-8"
    );
  });

  // Vite production assets are emitted under /assets/* (hashed filenames). In dev, this will 404 unless Vite dev server is used.
  app.get("/assets/*", async (request, reply) => {
    if (!distAvailable) {
      return reply.status(404).send({ error: "not_found" });
    }
    reply.header("Cache-Control", "public, max-age=31536000, immutable");
    const rel = (request.params as { "*": string })["*"];
    const abs = safePathJoin(frontDistRoot, `assets/${rel}`);
    if (!abs) {
      return reply.status(400).send({ error: "invalid_path" });
    }
    await sendStatic(reply, abs, guessContentType(abs), null);
  });

  app.get("/robots.txt", async (_, reply) => sendStatic(reply, resolveWebAsset("robots.txt"), "text/plain; charset=utf-8"));
  app.get("/sitemap.xml", async (_, reply) => sendStatic(reply, resolveWebAsset("sitemap.xml"), "application/xml; charset=utf-8"));
  app.get("/favicon.ico", async (_, reply) => sendStatic(reply, resolveWebAsset("favicon.ico"), "image/x-icon", null));
  app.get("/favicon-16x16.png", async (_, reply) => sendStatic(reply, resolveWebAsset("favicon-16x16.png"), "image/png", null));
  app.get("/favicon-32x32.png", async (_, reply) => sendStatic(reply, resolveWebAsset("favicon-32x32.png"), "image/png", null));
  app.get("/apple-touch-icon.png", async (_, reply) => sendStatic(reply, resolveWebAsset("apple-touch-icon.png"), "image/png", null));
  app.get("/android-chrome-192x192.png", async (_, reply) =>
    sendStatic(reply, resolveWebAsset("android-chrome-192x192.png"), "image/png", null)
  );
  app.get("/android-chrome-512x512.png", async (_, reply) =>
    sendStatic(reply, resolveWebAsset("android-chrome-512x512.png"), "image/png", null)
  );
  app.get("/site.webmanifest", async (_, reply) => {
    reply.header("Cache-Control", "no-cache");
    await sendStatic(reply, resolveWebAsset("site.webmanifest"), "application/manifest+json; charset=utf-8");
  });
  app.get("/og.png", async (_, reply) => sendStatic(reply, resolveWebAsset("og.png"), "image/png", null));

  app.get("/fonts/*", async (request, reply) => {
    reply.header("Cache-Control", "public, max-age=604800");
    const rel = (request.params as { "*": string })["*"];
    const root = distAvailable ? frontDistRoot : frontPublicRoot;
    const abs = safePathJoin(root, `fonts/${rel}`);
    if (!abs) {
      return reply.status(400).send({ error: "invalid_path" });
    }
    await sendStatic(reply, abs, guessContentType(abs), null);
  });

  // This file is synced by the contracts deploy pipeline and is a stable fallback when /meta/contracts is unavailable.
  app.get("/contracts.latest.json", async (_, reply) =>
    sendStatic(reply, path.join(frontRoot, "contracts.latest.json"), "application/json; charset=utf-8")
  );

  if (deps.signerAddress && deps.actionRepository) {
    const signerAddress = deps.signerAddress;
    const actionRepository = deps.actionRepository;
    const actionPreflight = deps.actionPreflight;
    const actionCostEstimator = deps.actionCostEstimator;
    const actionValidMenu = deps.actionValidMenu;
    const requirePreflightSuccess = Boolean(deps.env.ACTION_REQUIRE_PREFLIGHT_SUCCESS);
    const requireKey = requireApiKey(deps);
    app.post(
      "/agent/action",
      { preHandler: requireKey },
      async (request, reply) => {
        const parsed = agentActionInputSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.status(400).send({
            error: "invalid_action_payload",
            issues: parsed.error.issues
          });
        }

        if (requirePreflightSuccess) {
          if (!actionPreflight) {
            return reply.status(503).send({ error: "preflight_unavailable" });
          }
          const preflight = await actionPreflight.evaluate(parsed.data);
          if (!preflight.willSucceed) {
            return reply.status(409).send({
              error: "preflight_failed",
              preflight
            });
          }
        }

        const idempotencyKey = request.headers["idempotency-key"];
        const submission = await actionRepository.enqueue({
          signer: signerAddress,
          idempotencyKey: typeof idempotencyKey === "string" ? idempotencyKey : undefined,
          action: parsed.data
        });
        deps.metrics.recordQueued();

        return {
          actionId: submission.actionId,
          status: submission.status,
          actionType: submission.actionType,
          createdAt: submission.createdAt
        };
      }
    );

    app.get(
      "/agent/action/:actionId",
      { preHandler: requireKey },
      async (request, reply) => {
        const actionId = (request.params as { actionId: string }).actionId;
        const action = await actionRepository.getById(actionId);
        if (!action) {
          return reply.status(404).send({ error: "action_not_found" });
        }

        return {
          actionId: action.actionId,
          status: action.status,
          actionType: action.actionType,
          attempts: action.attempts,
          txHashes: action.txHashes,
          result: action.resultJson,
          errorCode: action.errorCode,
          errorMessage: action.errorMessage,
          updatedAt: action.updatedAt
        };
      }
    );

    if (actionPreflight) {
      app.post(
        "/agent/preflight",
        { preHandler: requireKey },
        async (request, reply) => {
          const parsed = agentActionInputSchema.safeParse(request.body);
          if (!parsed.success) {
            return reply.status(400).send({
              error: "invalid_action_payload",
              issues: parsed.error.issues
            });
          }

          const commitIdRaw = request.query && typeof (request.query as { commitId?: string }).commitId === "string"
            ? Number((request.query as { commitId?: string }).commitId)
            : undefined;
          if (
            commitIdRaw !== undefined &&
            (!Number.isFinite(commitIdRaw) || !Number.isInteger(commitIdRaw) || commitIdRaw <= 0)
          ) {
            return reply.status(400).send({ error: "invalid_commit_id" });
          }

          return actionPreflight.evaluate(parsed.data, {
            commitId: commitIdRaw
          });
        }
      );
    }

    if (actionCostEstimator) {
      app.post(
        "/agent/estimate-cost",
        { preHandler: requireKey },
        async (request, reply) => {
          const parsed = agentActionInputSchema.safeParse(request.body);
          if (!parsed.success) {
            return reply.status(400).send({
              error: "invalid_action_payload",
              issues: parsed.error.issues
            });
          }

          return actionCostEstimator.estimate(parsed.data);
        }
      );
    }

    if (actionValidMenu) {
      app.get(
        "/agent/valid-actions/:characterId",
        { preHandler: requireKey },
        async (request, reply) => {
          const params = request.params as { characterId: string };
          const characterId = Number(params.characterId);
          if (!Number.isInteger(characterId) || characterId <= 0) {
            return reply.status(400).send({ error: "invalid_character_id" });
          }

          const query = request.query as {
            dungeonLevel?: string;
            difficulty?: string;
            varianceMode?: string;
            tier?: string;
            maxAmount?: string;
            commitId?: string;
          };
          const optionalNumber = (value?: string): number | undefined => (typeof value === "string" ? Number(value) : undefined);
          const dungeonLevel = optionalNumber(query.dungeonLevel);
          const difficulty = optionalNumber(query.difficulty);
          const varianceMode = optionalNumber(query.varianceMode);
          const tier = optionalNumber(query.tier);
          const maxAmount = optionalNumber(query.maxAmount);
          const commitId = optionalNumber(query.commitId);

          if (dungeonLevel !== undefined && (!Number.isInteger(dungeonLevel) || dungeonLevel <= 0)) {
            return reply.status(400).send({ error: "invalid_dungeon_level" });
          }
          if (difficulty !== undefined && (!Number.isInteger(difficulty) || difficulty < 0 || difficulty > 4)) {
            return reply.status(400).send({ error: "invalid_difficulty" });
          }
          if (varianceMode !== undefined && (!Number.isInteger(varianceMode) || varianceMode < 0 || varianceMode > 2)) {
            return reply.status(400).send({ error: "invalid_variance_mode" });
          }
          if (tier !== undefined && (!Number.isInteger(tier) || tier <= 0)) {
            return reply.status(400).send({ error: "invalid_tier" });
          }
          if (maxAmount !== undefined && (!Number.isInteger(maxAmount) || maxAmount <= 0 || maxAmount > 65535)) {
            return reply.status(400).send({ error: "invalid_max_amount" });
          }
          if (commitId !== undefined && (!Number.isInteger(commitId) || commitId <= 0)) {
            return reply.status(400).send({ error: "invalid_commit_id" });
          }

          return actionValidMenu.getMenu({
            characterId,
            dungeonLevel,
            difficulty,
            varianceMode,
            tier,
            maxAmount,
            commitId
          });
        }
      );
    }
  }

  app.get("/agent/state/:characterId", async (request, reply) => {
    const characterId = Number((request.params as { characterId: string }).characterId);
    let state = await deps.readModel.getAgentState(characterId);
    if (!state) {
      const deadline = Date.now() + 4_000;
      while (!state && Date.now() < deadline) {
        await sleep(250);
        state = await deps.readModel.getAgentState(characterId);
      }
    }
    if (!state) {
      return reply.status(404).send({ error: "character_not_found" });
    }

    const sinceBlock = request.query && typeof (request.query as { sinceBlock?: string }).sinceBlock === "string"
      ? Number((request.query as { sinceBlock?: string }).sinceBlock)
      : undefined;

    const deltas = await deps.readModel.getStateDeltas(characterId, sinceBlock);

    return {
      state,
      deltas
    };
  });

  app.get("/agent/bootstrap", async () => deps.readModel.getAgentBootstrap());

  const txIntentBuilder = deps.actionTxIntentBuilder;
  if (txIntentBuilder) {
    app.post(
      "/agent/tx-intent",
      { preHandler: requireApiKey(deps) },
      async (request, reply) => {
        const body = request.body as {
          actor?: unknown;
          action?: unknown;
        };
        if (typeof body?.actor !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(body.actor)) {
          return reply.status(400).send({ error: "invalid_actor" });
        }
        const parsedAction = agentActionInputSchema.safeParse(body?.action);
        if (!parsedAction.success) {
          return reply.status(400).send({
            error: "invalid_action_payload",
            issues: parsedAction.error.issues
          });
        }

        try {
          return await txIntentBuilder.build({
            actor: body.actor as `0x${string}`,
            action: parsedAction.data
          });
        } catch (error) {
          const normalized = normalizeError(error);
          return reply.status(409).send({
            error: "tx_intent_build_failed",
            code: normalized.code,
            reason: normalized.message,
            retryable: normalized.retryable
          });
        }
      }
    );
  }

  app.get("/agent/commit-fee", async () => deps.readModel.getCommitFee());

  app.get("/agent/commit-window/:commitId", async (request, reply) => {
    const commitId = Number((request.params as { commitId: string }).commitId);
    if (!Number.isInteger(commitId) || commitId <= 0) {
      return reply.status(400).send({ error: "invalid_commit_id" });
    }
    return deps.readModel.getCommitWindow(commitId);
  });

  app.get("/agent/potion-balance/:characterId/:potionType/:potionTier", async (request, reply) => {
    const params = request.params as {
      characterId: string;
      potionType: string;
      potionTier: string;
    };
    const characterId = Number(params.characterId);
    const potionType = Number(params.potionType);
    const potionTier = Number(params.potionTier);

    if (!Number.isInteger(characterId) || characterId <= 0) {
      return reply.status(400).send({ error: "invalid_character_id" });
    }
    if (!Number.isInteger(potionType) || potionType < 0 || potionType > 2) {
      return reply.status(400).send({ error: "invalid_potion_type" });
    }
    if (!Number.isInteger(potionTier) || potionTier < 0 || potionTier > 2) {
      return reply.status(400).send({ error: "invalid_potion_tier" });
    }

    return deps.readModel.getPotionBalance(characterId, potionType, potionTier);
  });

  app.get("/agent/characters/:owner", async (request, reply) => {
    const owner = (request.params as { owner: string }).owner;
    if (!/^0x[a-fA-F0-9]{40}$/.test(owner)) {
      return reply.status(400).send({ error: "invalid_owner" });
    }
    return deps.readModel.listMyCharacters(owner as `0x${string}`);
  });

  app.get("/agent/world-rules", async () => deps.readModel.getWorldRules());

  app.get(
    "/agent/session-state/:characterId",
    { preHandler: requireApiKey(deps) },
    async (request, reply) => {
      const characterId = Number((request.params as { characterId: string }).characterId);
      if (!Number.isInteger(characterId) || characterId <= 0) {
        return reply.status(400).send({ error: "invalid_character_id" });
      }

      const state = await deps.readModel.getAgentState(characterId);
      if (!state) {
        return reply.status(404).send({ error: "character_not_found" });
      }

      const lastAction = deps.actionRepository
        ? await deps.actionRepository.getLatestByCharacter(characterId)
        : null;

      const commitId = extractCommitId(lastAction?.resultJson);
      const revealWindow = commitId ? await deps.readModel.getCommitWindow(commitId) : null;
      const validMenu = deps.actionValidMenu
        ? await deps.actionValidMenu.getMenu({ characterId, commitId: commitId ?? undefined })
        : null;
      const nextRecommendedLegalAction = validMenu?.validActions?.[0]?.actionType ?? null;

      return {
        characterId,
        commitId,
        revealWindow,
        lastAction: lastAction
          ? {
              actionId: lastAction.actionId,
              actionType: lastAction.actionType,
              status: lastAction.status,
              errorCode: lastAction.errorCode,
              attempts: lastAction.attempts,
              updatedAt: lastAction.updatedAt
            }
          : null,
        nextRecommendedLegalAction,
        sessionSupported: Boolean(deps.actionRepository)
      };
    }
  );

  app.get(
    "/agent/healthcheck-write-path",
    { preHandler: requireApiKey(deps) },
    async () => {
      const failCodes = new Set<string>();
      const warnings = new Set<string>();
      const signerAddress = deps.signerAddress ?? null;

      const contractsMeta = deps.readModel.getContractMeta() as Record<string, unknown>;
      const contractsManifest = assessContractsManifest(contractsMeta, deps.env.CHAIN_ID);
      if (!contractsManifest.ok && contractsManifest.code) {
        failCodes.add(contractsManifest.code);
      }

      const apiKeyRequired = Boolean(deps.env.API_KEY);
      const apiKeyScope = {
        ok: apiKeyRequired,
        code: apiKeyRequired ? null : "API_KEY_SCOPE_DISABLED",
        apiKeyRequired,
        requiredHeader: "x-api-key"
      };
      if (!apiKeyScope.ok) {
        warnings.add("API_KEY_SCOPE_DISABLED");
      }

      const actionSubmission = {
        ok: actionsEnabled,
        code: actionsEnabled ? null : "WRITE_PATH_DISABLED",
        actionsEnabled
      };
      if (!actionSubmission.ok && actionSubmission.code) {
        failCodes.add(actionSubmission.code);
      }

      let gasAffordabilityFloor: Record<string, unknown> = {
        ok: false,
        code: "SIGNER_UNAVAILABLE",
        signerAddress,
        signerNativeBalanceWei: null,
        commitFeeWei: null,
        maxFeePerGasWei: null,
        assumedGasUnits: WRITE_PATH_GAS_FLOOR.toString(),
        requiredFloorWei: null
      };

      if (!signerAddress) {
        failCodes.add("SIGNER_UNAVAILABLE");
      } else {
        try {
          const [commitFeeRaw, feeEstimateRaw, signerBalanceRaw] = await Promise.all([
            deps.readModel.getCommitFee(),
            deps.readModel.getFeeEstimate(),
            deps.readModel.getNativeBalance(signerAddress as `0x${string}`)
          ]);

          const commitFeeWei = toBigIntOrZero((commitFeeRaw as Record<string, unknown>).commitFeeWei);
          const maxFeePerGasWei = toBigIntOrZero((feeEstimateRaw as Record<string, unknown>).maxFeePerGasWei);
          const signerNativeBalanceWei = toBigIntOrZero((signerBalanceRaw as Record<string, unknown>).balanceWei);
          const requiredFloorWei = commitFeeWei + maxFeePerGasWei * WRITE_PATH_GAS_FLOOR;
          const affordabilityOk = signerNativeBalanceWei >= requiredFloorWei;
          const affordabilityCode = affordabilityOk ? null : "SIGNER_BALANCE_BELOW_FLOOR";

          gasAffordabilityFloor = {
            ok: affordabilityOk,
            code: affordabilityCode,
            signerAddress,
            signerNativeBalanceWei: signerNativeBalanceWei.toString(),
            commitFeeWei: commitFeeWei.toString(),
            maxFeePerGasWei: maxFeePerGasWei.toString(),
            assumedGasUnits: WRITE_PATH_GAS_FLOOR.toString(),
            requiredFloorWei: requiredFloorWei.toString()
          };

          if (!affordabilityOk) {
            failCodes.add("SIGNER_BALANCE_BELOW_FLOOR");
          }
        } catch {
          gasAffordabilityFloor = {
            ...gasAffordabilityFloor,
            code: "FEE_ESTIMATE_UNAVAILABLE"
          };
          failCodes.add("FEE_ESTIMATE_UNAVAILABLE");
        }
      }

      return {
        chainId: deps.env.CHAIN_ID,
        mode,
        actionsEnabled,
        ready: failCodes.size === 0,
        failCodes: [...failCodes.values()],
        warnings: [...warnings.values()],
        checks: {
          actionSubmission,
          contractsManifest,
          apiKeyScope,
          gasAffordabilityFloor
        }
      };
    }
  );

  app.get("/leaderboard", async (request, reply) => {
    const query = request.query as {
      mode?: string;
      limit?: string;
      cursor?: string;
      epochId?: string;
    };

    const parsedPagination = paginationQuerySchema.safeParse({
      limit: query.limit ? Number(query.limit) : undefined,
      cursor: query.cursor
    });

    if (!parsedPagination.success) {
      return reply.status(400).send({ error: "invalid_pagination", issues: parsedPagination.error.issues });
    }

    if (query.mode === "epoch") {
      if (!query.epochId) {
        return reply.status(400).send({ error: "epochId_required_for_epoch_mode" });
      }
      return deps.readModel.getEpochLeaderboard({
        epochId: Number(query.epochId),
        limit: parsedPagination.data.limit,
        cursor: parsedPagination.data.cursor
      });
    }

    return deps.readModel.getLiveLeaderboard({
      limit: parsedPagination.data.limit,
      cursor: parsedPagination.data.cursor
    });
  });

  app.get("/leaderboard/character/:characterId", async (request, reply) => {
    const characterId = Number((request.params as { characterId: string }).characterId);
    const rank = await deps.readModel.getCharacterRank(characterId);
    if (!rank) {
      return reply.status(404).send({ error: "character_not_found" });
    }
    return rank;
  });

  app.get("/leaderboard/epochs/:epochId", async (request, reply) => {
    const epochId = Number((request.params as { epochId: string }).epochId);
    const epoch = await deps.readModel.getLeaderboardEpoch(epochId);
    if (!epoch) {
      return reply.status(404).send({ error: "epoch_not_found" });
    }
    return epoch;
  });

  app.get("/leaderboard/claims/:characterId", async (request, reply) => {
    const characterId = Number((request.params as { characterId: string }).characterId);
    const claims = await deps.readModel.getClaimableEpochs(characterId);
    return claims;
  });

  app.get("/market/rfqs", async (request, reply) => {
    const query = request.query as {
      limit?: string;
      activeOnly?: string | boolean;
      includeExpired?: string | boolean;
      slot?: string;
      maxMinTier?: string;
      targetSetId?: string;
      maker?: string;
    };

    const activeOnly = parseBooleanQuery(query.activeOnly);
    if (query.activeOnly !== undefined && activeOnly === undefined) {
      return reply.status(400).send({ error: "invalid_boolean", field: "activeOnly" });
    }

    const includeExpired = parseBooleanQuery(query.includeExpired);
    if (query.includeExpired !== undefined && includeExpired === undefined) {
      return reply.status(400).send({ error: "invalid_boolean", field: "includeExpired" });
    }

    const parsed = rfqListingQuerySchema.safeParse({
      limit: query.limit ? Number(query.limit) : undefined,
      activeOnly,
      includeExpired,
      slot: query.slot ? Number(query.slot) : undefined,
      maxMinTier: query.maxMinTier ? Number(query.maxMinTier) : undefined,
      targetSetId: query.targetSetId ? Number(query.targetSetId) : undefined,
      maker: query.maker
    });

    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_rfq_query", issues: parsed.error.issues });
    }

    return deps.readModel.getMarketRfqs(parsed.data);
  });

  app.get("/market/trades", async (request, reply) => {
    const query = request.query as {
      limit?: string;
      activeOnly?: string | boolean;
      maker?: string;
    };

    const activeOnly = parseBooleanQuery(query.activeOnly);
    if (query.activeOnly !== undefined && activeOnly === undefined) {
      return reply.status(400).send({ error: "invalid_boolean", field: "activeOnly" });
    }

    const parsed = tradeListingQuerySchema.safeParse({
      limit: query.limit ? Number(query.limit) : undefined,
      activeOnly,
      maker: query.maker
    });

    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_trade_query", issues: parsed.error.issues });
    }

    return deps.readModel.getMarketTrades(parsed.data);
  });

  app.get("/market/trades/:offerId", async (request, reply) => {
    const offerId = Number((request.params as { offerId: string }).offerId);
    if (!Number.isInteger(offerId) || offerId <= 0) {
      return reply.status(400).send({ error: "invalid_offer_id" });
    }

    const offer = await deps.readModel.getMarketTradeOffer(offerId);
    if (!offer) {
      return reply.status(404).send({ error: "offer_not_found" });
    }
    return offer;
  });

  app.get("/economy/quote-premium", async (request, reply) => {
    const query = request.query as {
      characterId?: string;
      difficulty?: string;
      amount?: string;
      monPriceUsdHint?: string;
    };
    const characterId = Number(query.characterId);
    const difficulty = Number(query.difficulty);
    const amount = Number(query.amount);
    const monPriceUsdHint =
      typeof query.monPriceUsdHint === "string" ? Number(query.monPriceUsdHint) : undefined;

    if (!Number.isInteger(characterId) || characterId <= 0) {
      return reply.status(400).send({ error: "invalid_character_id" });
    }
    if (!Number.isInteger(difficulty) || difficulty < 0 || difficulty > 4) {
      return reply.status(400).send({ error: "invalid_difficulty" });
    }
    if (!Number.isInteger(amount) || amount <= 0 || amount > 65535) {
      return reply.status(400).send({ error: "invalid_amount" });
    }
    if (
      monPriceUsdHint !== undefined &&
      (!Number.isFinite(monPriceUsdHint) || monPriceUsdHint <= 0)
    ) {
      return reply.status(400).send({ error: "invalid_monPriceUsdHint" });
    }

    return deps.readModel.quotePremiumPurchase(characterId, difficulty, amount, { monPriceUsdHint });
  });

  app.get("/economy/estimate-epoch-roi/:characterId", async (request, reply) => {
    const characterId = Number((request.params as { characterId: string }).characterId);
    if (!Number.isInteger(characterId) || characterId <= 0) {
      return reply.status(400).send({ error: "invalid_character_id" });
    }

    const query = request.query as {
      windowEpochs?: string;
      pushCostWei?: string;
    };
    const windowEpochs = query.windowEpochs !== undefined ? Number(query.windowEpochs) : undefined;
    if (
      windowEpochs !== undefined &&
      (!Number.isInteger(windowEpochs) || windowEpochs <= 0 || windowEpochs > 100)
    ) {
      return reply.status(400).send({ error: "invalid_windowEpochs" });
    }

    const pushCostWeiRaw = query.pushCostWei;
    if (pushCostWeiRaw !== undefined && !/^\d+$/.test(pushCostWeiRaw)) {
      return reply.status(400).send({ error: "invalid_pushCostWei" });
    }

    const roi = await deps.readModel.estimateEpochRoi(characterId, {
      windowEpochs,
      pushCostWei: pushCostWeiRaw !== undefined ? BigInt(pushCostWeiRaw) : undefined
    });
    if (!roi) {
      return reply.status(404).send({ error: "character_not_found" });
    }
    return roi;
  });

  app.get("/meta/contracts", async () => deps.readModel.getContractMeta());
  app.get("/meta/external", async (_, reply) => {
    const external = await deps.readModel.getExternalMeta();
    if (!external) {
      return reply.status(404).send({ error: "external_not_configured" });
    }
    return external;
  });
  app.get("/meta/diagnostics", async () => deps.readModel.getDiagnostics());
  app.get("/meta/rewards", async (request, reply) => {
    const windowEpochsRaw =
      request.query && typeof (request.query as { windowEpochs?: string }).windowEpochs === "string"
        ? Number((request.query as { windowEpochs?: string }).windowEpochs)
        : undefined;
    if (
      windowEpochsRaw !== undefined &&
      (!Number.isFinite(windowEpochsRaw) || !Number.isInteger(windowEpochsRaw) || windowEpochsRaw <= 0)
    ) {
      return reply.status(400).send({ error: "invalid_windowEpochs" });
    }
    const windowEpochs = windowEpochsRaw ?? 5;
    return deps.readModel.getRewardsSummary({ windowEpochs });
  });
  app.get("/meta/playbook", async (_, reply) => {
    if (!playbookSections || playbookSections.length === 0) {
      return reply.status(404).send({ error: "playbook_not_available" });
    }
    return { sections: playbookSections.map(({ id, title }) => ({ id, title })) };
  });
  app.get("/meta/playbook/:sectionId", async (request, reply) => {
    if (!playbookSections || playbookSections.length === 0) {
      return reply.status(404).send({ error: "playbook_not_available" });
    }
    const sectionId = (request.params as { sectionId: string }).sectionId;
    const found = playbookSections.find((s) => s.id === sectionId);
    if (!found) {
      return reply.status(404).send({ error: "playbook_section_not_found" });
    }
    const format = request.query && typeof (request.query as { format?: string }).format === "string"
      ? (request.query as { format?: string }).format
      : undefined;
    if (format === "markdown") {
      reply.type("text/markdown; charset=utf-8");
      return found.markdown;
    }
    return found;
  });
  app.get("/meta/rpc", async (_, reply) => {
    const publicRpcInfo = getPublicRpcInfo(deps.env);
    if (publicRpcInfo.rpcUrls.length === 0) {
      return reply.status(404).send({ error: "public_rpc_not_configured" });
    }
    return {
      chainId: deps.env.CHAIN_ID,
      rpcUrl: publicRpcInfo.rpcUrls[0],
      rpcUrls: publicRpcInfo.rpcUrls,
      source: publicRpcInfo.source
    };
  });
  app.post("/agent/onboard/fund", { preHandler: requireApiKey(deps) }, async (request, reply) => {
    if (!deps.db) {
      return reply.status(503).send({ error: "onboard_unavailable" });
    }
    if (!deps.chain) {
      return reply.status(503).send({ error: "onboard_signer_unavailable" });
    }

    const config = getOnboardConfig(deps.env);
    if (!config.enabled) {
      return reply.status(404).send({ error: "onboard_not_configured" });
    }
    const faucetAddress = (deps.chain.onboardAccount?.address ?? deps.chain.account?.address)?.toLowerCase();
    if (faucetAddress === undefined) {
      return reply.status(503).send({ error: "onboard_faucet_unconfigured" });
    }

    const body = request.body as {
      address?: unknown;
      idempotencyKey?: unknown;
    } | null | undefined;
    const address = body?.address;
    const idempotencyKey = body?.idempotencyKey;

    if (typeof address !== "string" || !isHexAddress(address)) {
      return reply.status(400).send({ error: "invalid_address" });
    }
    if (idempotencyKey !== undefined && typeof idempotencyKey !== "string") {
      return reply.status(400).send({ error: "invalid_idempotency_key" });
    }
    const resolvedIdempotencyKey = idempotencyKey?.trim();
    if (resolvedIdempotencyKey !== undefined && resolvedIdempotencyKey.length === 0) {
      return reply.status(400).send({ error: "invalid_idempotency_key" });
    }
    if (
      resolvedIdempotencyKey !== undefined &&
      (resolvedIdempotencyKey.length > 128 || !/^[A-Za-z0-9._-]+$/.test(resolvedIdempotencyKey))
    ) {
      return reply.status(400).send({ error: "invalid_idempotency_key" });
    }
    const actorAddress = address.toLowerCase();

    if (actorAddress === faucetAddress) {
      return reply.status(400).send({ error: "invalid_address", reason: "faucet_wallet_not_allowed" });
    }

    if (resolvedIdempotencyKey !== undefined) {
      const repeated = await deps.db.query<{
        idempotency_key: string | null;
        status: string;
        address: string;
        amount_wei: string;
        tx_hash: string | null;
        created_at: string;
        failure_reason: string | null;
      }>(
        `SELECT idempotency_key, status, address, amount_wei, tx_hash, created_at
         FROM mcp_onboard_faucet_grants
         WHERE idempotency_key = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [resolvedIdempotencyKey]
      );
      if (repeated.length > 0) {
        const row = repeated[0];
        if (row.address.toLowerCase() !== actorAddress) {
          return reply.status(409).send({ error: "idempotency_address_mismatch" });
        }
        return {
          status: row.status,
          address: row.address,
          amountWei: row.amount_wei,
          txHash: row.tx_hash,
          idempotencyKey: row.idempotency_key,
          createdAt: row.created_at
        };
      }
    }

	    const [walletBalanceRaw, targetBalanceRaw] = await Promise.all([
	      deps.readModel.getNativeBalance(faucetAddress as `0x${string}`),
	      deps.readModel.getNativeBalance(actorAddress as `0x${string}`)
	    ]);
	    const walletBalanceWei = toBigIntOrZero(walletBalanceRaw.balanceWei);
	    const targetBalanceWei = toBigIntOrZero(targetBalanceRaw.balanceWei);
	    if (targetBalanceWei >= config.minTargetBalanceWei) {
	      if (resolvedIdempotencyKey !== undefined) {
	        await deps.db.query(
	          `INSERT INTO mcp_onboard_faucet_grants(address, status, amount_wei, idempotency_key, tx_hash)
	           VALUES ($1, 'skipped', $2, $3, NULL)`,
          [actorAddress, config.amountWei.toString(), resolvedIdempotencyKey]
        );
      }
      return {
        status: "skipped",
        reason: "already_funded",
        address: actorAddress,
        chainId: deps.env.CHAIN_ID
      };
    }

    const [addressWindowCountRows, globalWindowCountRows] = await Promise.all([
      deps.db.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
           FROM mcp_onboard_faucet_grants
          WHERE address = $1
            AND status IN ('pending', 'funded')
            AND created_at > (NOW() - $2 * INTERVAL '1 second')`,
        [actorAddress, config.addressCooldownSeconds]
      ),
      deps.db.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
           FROM mcp_onboard_faucet_grants
          WHERE status IN ('pending', 'funded')
          AND created_at > (NOW() - INTERVAL '1 hour')`,
        []
      )
    ]);

    const addressWindowCount = Number(addressWindowCountRows[0]?.count ?? "0");
    const globalWindowCount = Number(globalWindowCountRows[0]?.count ?? "0");
    if (addressWindowCount >= config.perAddressWindowLimit) {
      return reply.status(429).send({ error: "onboard_rate_limited", reason: "address_window_limit_reached" });
    }
    if (globalWindowCount >= config.globalHourLimit) {
      return reply.status(429).send({ error: "onboard_rate_limited", reason: "global_hour_limit_reached" });
    }

    if (walletBalanceWei < config.minFaucetBalanceWei + config.amountWei) {
      return reply.status(503).send({
        error: "faucet_balance_insufficient",
        faucetBalanceWei: walletBalanceWei.toString()
      });
    }

    const grantAmountWei = config.amountWei.toString();
    let pendingGrantId: number | null = null;

    if (resolvedIdempotencyKey !== undefined) {
      try {
        const inserted = await deps.db.query<{ grant_id: number }>(
          `INSERT INTO mcp_onboard_faucet_grants(address, status, amount_wei, idempotency_key, tx_hash)
           VALUES ($1, 'pending', $2, $3, NULL)
           RETURNING grant_id`,
          [actorAddress, grantAmountWei, resolvedIdempotencyKey]
        );
        pendingGrantId = inserted[0]?.grant_id ?? null;
      } catch (error: any) {
        if (error?.code !== "23505") {
          throw error;
        }
        const repeated = await deps.db.query<{
          idempotency_key: string | null;
          status: string;
          address: string;
          amount_wei: string;
          tx_hash: string | null;
          created_at: string;
        }>(
          `SELECT idempotency_key, status, address, amount_wei, tx_hash, created_at
           FROM mcp_onboard_faucet_grants
           WHERE idempotency_key = $1
           ORDER BY created_at DESC
           LIMIT 1`,
          [resolvedIdempotencyKey]
        );
        if (repeated.length > 0) {
          const row = repeated[0];
          if (row.address.toLowerCase() !== actorAddress) {
            return reply.status(409).send({ error: "idempotency_address_mismatch" });
          }
          return {
            status: row.status,
            address: row.address,
            amountWei: row.amount_wei,
            txHash: row.tx_hash,
            idempotencyKey: row.idempotency_key,
            createdAt: row.created_at
          };
        }
      }
    } else {
      try {
        const inserted = await deps.db.query<{ grant_id: number }>(
          `INSERT INTO mcp_onboard_faucet_grants(address, status, amount_wei, idempotency_key, tx_hash)
           VALUES ($1, 'pending', $2, NULL, NULL)
           RETURNING grant_id`,
          [actorAddress, grantAmountWei]
        );
        pendingGrantId = inserted[0]?.grant_id ?? null;
      } catch (error: any) {
        if (error?.code === "23505") {
          const inFlight = await deps.db.query<{
            grant_id: number;
            status: string;
            address: string;
            amount_wei: string;
            tx_hash: string | null;
            failure_reason: string | null;
            created_at: string;
          }>(
            `SELECT grant_id, status, address, amount_wei, tx_hash, failure_reason, created_at
             FROM mcp_onboard_faucet_grants
            WHERE address = $1
              AND status = 'pending'
            ORDER BY created_at DESC
            LIMIT 1`,
            [actorAddress]
          );
          if (inFlight.length > 0) {
            const row = inFlight[0];
            if (row.status === "pending" && row.amount_wei === grantAmountWei) {
              return reply.status(409).send({
                error: "onboard_request_inflight",
                status: "pending",
                address: row.address,
                amountWei: row.amount_wei,
                createdAt: row.created_at,
                id: row.grant_id
              });
            }
          }
        }
        throw error;
      }
    }
    if (pendingGrantId === null) {
      return reply.status(500).send({ error: "onboard_grant_create_failed" });
    }

    try {
      const txHash = await deps.chain.sendNativeCurrency(actorAddress as `0x${string}`, config.amountWei);
      await deps.db.query(
        `UPDATE mcp_onboard_faucet_grants
            SET status = 'funded', tx_hash = $2, failure_reason = NULL, updated_at = NOW()
          WHERE grant_id = $1`,
        [pendingGrantId, txHash]
      );
      return {
        status: "funded",
        address: actorAddress,
        txHash,
        amountWei: grantAmountWei,
        chainId: deps.env.CHAIN_ID,
        id: pendingGrantId
      };
    } catch (error: any) {
      const reason = error instanceof Error ? error.message : String(error);
      await deps.db.query(
        `UPDATE mcp_onboard_faucet_grants
           SET status = 'failed', failure_reason = $2, updated_at = NOW()
         WHERE grant_id = $1`,
        [pendingGrantId, reason]
      );
      return reply.status(502).send({
        error: "onboard_transfer_failed",
        reason,
        address: actorAddress
      });
    }
  });
  app.get("/metrics", { preHandler: requireApiKey(deps) }, async () => deps.metrics.snapshot());

  return app;
}

async function sendStatic(
  reply: any,
  filePath: string,
  contentType: string,
  encoding: BufferEncoding | null = "utf8"
): Promise<void> {
  let file: string | Buffer;
  try {
    file = encoding ? await fs.readFile(filePath, encoding) : await fs.readFile(filePath);
  } catch (error: any) {
    if (error && error.code === "ENOENT") {
      await reply.status(404).send({ error: "not_found" });
      return;
    }
    throw error;
  }
  reply.type(contentType);
  await reply.send(file);
}

function guessContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
    case ".mjs":
      return "application/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
    case ".map":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".ico":
      return "image/x-icon";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    case ".ttf":
      return "font/ttf";
    case ".otf":
      return "font/otf";
    case ".webmanifest":
      return "application/manifest+json; charset=utf-8";
    case ".txt":
      return "text/plain; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

function assessContractsManifest(contractsMeta: Record<string, unknown>, expectedChainId: number) {
  const requiredAddressFields = ["gameWorld", "feeVault", "items", "mmoToken", "tradeEscrow", "rfqMarket"] as const;
  const invalidFields = requiredAddressFields.filter((field) => !isHexAddress(contractsMeta[field]));
  const chainIdRaw = contractsMeta.chainId;
  const chainId = typeof chainIdRaw === "number" ? chainIdRaw : Number(chainIdRaw);
  const chainIdMatches = Number.isInteger(chainId) && chainId === expectedChainId;

  if (!chainIdMatches) {
    return {
      ok: false,
      code: "CONTRACT_CHAIN_ID_MISMATCH",
      expectedChainId,
      manifestChainId: Number.isFinite(chainId) ? chainId : null,
      invalidFields
    };
  }

  if (invalidFields.length > 0) {
    return {
      ok: false,
      code: "CONTRACT_MANIFEST_INVALID",
      expectedChainId,
      manifestChainId: chainId,
      invalidFields
    };
  }

  return {
    ok: true,
    code: null,
    expectedChainId,
    manifestChainId: chainId,
    invalidFields
  };
}

function isHexAddress(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function toBigIntOrZero(value: unknown): bigint {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.max(0, Math.trunc(value)));
  }
  if (typeof value === "string" && value.trim().length > 0) {
    try {
      return BigInt(value);
    } catch {
      return 0n;
    }
  }
  return 0n;
}

function extractCommitId(resultJson: unknown): number | null {
  if (!resultJson || typeof resultJson !== "object") {
    return null;
  }
  const details = (resultJson as { details?: unknown }).details;
  if (!details || typeof details !== "object") {
    return null;
  }
  const commitIdRaw = (details as { commitId?: unknown }).commitId;
  if (typeof commitIdRaw === "number" && Number.isInteger(commitIdRaw) && commitIdRaw > 0) {
    return commitIdRaw;
  }
  if (typeof commitIdRaw === "string" && /^\d+$/.test(commitIdRaw)) {
    return Number(commitIdRaw);
  }
  return null;
}

function parseBooleanQuery(value: unknown): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return undefined;
}

function getXOAuthStartConfig(env: Env): {
  consumerKey: string;
  consumerSecret: string;
  callbackUrl: string;
  webOrigin: string;
} | null {
  const consumerKey = env.X_CONSUMER_KEY;
  const consumerSecret = env.X_CONSUMER_SECRET;
  const callbackUrl = env.X_OAUTH_CALLBACK_URL;
  const webOrigin = env.X_WEB_ORIGIN;

  if (typeof consumerKey !== "string" || consumerKey.length === 0) return null;
  if (typeof consumerSecret !== "string" || consumerSecret.length === 0) return null;
  if (typeof callbackUrl !== "string" || callbackUrl.length === 0) return null;
  if (typeof webOrigin !== "string" || webOrigin.length === 0) return null;

  try {
    // Normalize and validate inputs early.
    const cb = new URL(callbackUrl);
    const web = new URL(webOrigin);
    return {
      consumerKey,
      consumerSecret,
      callbackUrl: cb.toString(),
      webOrigin: web.toString().replace(/\/$/, "")
    };
  } catch {
    return null;
  }
}

function getXWebOrigin(env: Env): string | null {
  const webOrigin = env.X_WEB_ORIGIN;
  if (typeof webOrigin === "string" && webOrigin.length > 0) {
    try {
      return new URL(webOrigin).toString().replace(/\/$/, "");
    } catch {
      return null;
    }
  }

  // Fallback: if served on the same origin as the API, use the callback URL origin.
  const callbackUrl = env.X_OAUTH_CALLBACK_URL;
  if (typeof callbackUrl === "string" && callbackUrl.length > 0) {
    try {
      return new URL(callbackUrl).origin;
    } catch {
      return null;
    }
  }

  return null;
}

function buildXLinkMessage(params: {
  address: string;
  xUserId: string;
  xUsername: string;
  linkToken: string;
  issuedAt: string;
  webOrigin: string;
}): string {
  return [
    "ChainMMO X account linking",
    "",
    `Wallet: ${params.address.toLowerCase()}`,
    `X: @${params.xUsername} (id ${params.xUserId})`,
    `Nonce: ${params.linkToken}`,
    `Issued At: ${params.issuedAt}`,
    `Origin: ${params.webOrigin}`
  ].join("\n");
}

interface OnboardStipendConfig {
  enabled: boolean;
  amountWei: bigint;
  minTargetBalanceWei: bigint;
  minFaucetBalanceWei: bigint;
  addressCooldownSeconds: number;
  perAddressWindowLimit: number;
  globalHourLimit: number;
}

function getOnboardConfig(env: Env): OnboardStipendConfig {
  const amountWei = parseBigIntOrDefault(env.MCP_STIPEND_AMOUNT_WEI, 100_000_000_000_000_000n);
  const minTargetBalanceWei = parseBigIntOrDefault(env.MCP_STIPEND_MIN_BALANCE_WEI, 100_000_000_000_000_000n);
  const minFaucetBalanceWei = parseBigIntOrDefault(env.MCP_STIPEND_WALLET_MIN_BALANCE_WEI, 200_000_000_000_000_000n);
  const enabled = env.MCP_STIPEND_ENABLED && amountWei > 0n && minTargetBalanceWei >= 0n && minFaucetBalanceWei >= 0n;
  return {
    enabled,
    amountWei,
    minTargetBalanceWei,
    minFaucetBalanceWei,
    addressCooldownSeconds: env.MCP_STIPEND_ADDRESS_COOLDOWN_SECONDS,
    perAddressWindowLimit: env.MCP_STIPEND_PER_ADDRESS_LIMIT_PER_WINDOW,
    globalHourLimit: env.MCP_STIPEND_GLOBAL_PER_HOUR_LIMIT
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getPublicRpcInfo(env: Env): { rpcUrls: string[]; source: string } {
  const explicitUrls = normalizeRpcUrlList(env.CHAIN_PUBLIC_RPC_URLS);
  if (explicitUrls.length > 0) {
    return {
      rpcUrls: explicitUrls,
      source: "CHAIN_PUBLIC_RPC_URLS"
    };
  }

  const legacyUrl = normalizeRpcUrlList(env.CHAIN_PUBLIC_RPC_URL);
  if (legacyUrl.length > 0) {
    return {
      rpcUrls: legacyUrl,
      source: "CHAIN_PUBLIC_RPC_URL"
    };
  }

  const defaultUrls = PUBLIC_MONAD_RPC_URLS_BY_CHAIN_ID[env.CHAIN_ID];
  if (defaultUrls !== undefined && defaultUrls.length > 0) {
    return {
      rpcUrls: defaultUrls,
      source: `default_chain_${env.CHAIN_ID}`
    };
  }

  return {
    rpcUrls: [],
    source: "unconfigured"
  };
}

function normalizeRpcUrlList(raw: string | undefined): string[] {
  if (!raw || typeof raw !== "string") {
    return [];
  }
  const entries = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  const normalized: string[] = [];
  for (const url of entries) {
    const safe = normalizeSingleRpcUrl(url);
    if (safe) {
      normalized.push(safe);
    }
  }
  return [...new Set(normalized)];
}

function normalizeSingleRpcUrl(raw: string): string | null {
  try {
    return new URL(raw).toString();
  } catch {
    return null;
  }
}

function parseBigIntOrDefault(value: string | undefined, fallback: bigint): bigint {
  if (value === undefined) {
    return fallback;
  }
  try {
    return BigInt(value);
  } catch {
    return fallback;
  }
}

function requireApiKey(deps: ApiDependencies) {
  return async (request: any, reply: any) => {
    if (!deps.env.API_KEY) {
      return;
    }
    const provided = request.headers["x-api-key"];
    if (provided !== deps.env.API_KEY) {
      return reply.status(401).send({ error: "unauthorized" });
    }
  };
}
