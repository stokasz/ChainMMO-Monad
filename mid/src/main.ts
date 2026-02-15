import { ActionEngine } from "./action-engine/engine.js";
import { ActionMetrics } from "./action-engine/metrics.js";
import { ActionCostEstimator } from "./action-engine/cost-estimator.js";
import { ActionPreflight } from "./action-engine/preflight.js";
import { ActionTxIntentBuilder } from "./action-engine/tx-intents.js";
import { ActionValidMenu } from "./action-engine/valid-actions.js";
import { ActionRepository } from "./action-engine/repository.js";
import { ActionWorker } from "./action-engine/worker.js";
import { buildApiServer } from "./agent-api/server.js";
import { AgentReadModel } from "./agent-api/read-model.js";
import { ChainAdapter } from "./chain-adapter/client.js";
import { loadEnv } from "./config/env.js";
import { applyContractsLatestToEnv, loadContractsLatestFile, resolveContractsLatestPath } from "./config/contracts.js";
import { ChainIndexer } from "./indexer/indexer.js";
import { Database } from "./storage/db.js";
import { runMigrations } from "./storage/migration-runner.js";
import { GrokArena } from "./grok/arena.js";
import { OpenClawGatewayClient } from "./grok/openclaw-client.js";

async function main(): Promise<void> {
  const baseEnv = loadEnv();
  const contractsPath = resolveContractsLatestPath(baseEnv);
  if (!contractsPath) {
    throw new Error("deployments/contracts.latest.json not found; set CONTRACTS_JSON_PATH or run deploy-and-sync");
  }
  const latest = loadContractsLatestFile(contractsPath);
  const env = applyContractsLatestToEnv(baseEnv, latest);

  const db = new Database(env);
  await runMigrations(db);

  const chain = new ChainAdapter(env);
  const indexer = new ChainIndexer(env, chain, db);
  const readModel = new AgentReadModel(env, db, chain);
  const actionMetrics = new ActionMetrics();
  const actionTxIntentBuilder = new ActionTxIntentBuilder(chain, env.CHAIN_ID);
  let grokArena: GrokArena | undefined;
  let openclawClient: OpenClawGatewayClient | undefined;

  let actionWorker: ActionWorker | undefined;
  let actionRepository: ActionRepository | undefined;
  let actionPreflight: ActionPreflight | undefined;
  let actionCostEstimator: ActionCostEstimator | undefined;
  let actionValidMenu: ActionValidMenu | undefined;
  let workerPromise: Promise<void> | undefined;

  if (env.MID_MODE === "full") {
    if (!chain.account) {
      throw new Error("SIGNER_PRIVATE_KEY required for MID_MODE=full");
    }
    actionRepository = new ActionRepository(db);
    actionPreflight = new ActionPreflight(chain, {
      allowDeployerClaims: env.ACTION_ENABLE_DEPLOYER_CLAIMS
    });
    actionCostEstimator = new ActionCostEstimator(chain);
    actionValidMenu = new ActionValidMenu(chain);
    const actionEngine = new ActionEngine(chain, {
      allowDeployerClaims: env.ACTION_ENABLE_DEPLOYER_CLAIMS
    });
    actionWorker = new ActionWorker(env, actionRepository, actionEngine, actionMetrics);
    workerPromise = actionWorker.runForever();
  }

  if (env.GROK_ARENA_ENABLED && env.GROK_OPENCLAW_GATEWAY_URL && env.GROK_OPENCLAW_GATEWAY_TOKEN) {
    openclawClient = new OpenClawGatewayClient({
      url: env.GROK_OPENCLAW_GATEWAY_URL,
      token: env.GROK_OPENCLAW_GATEWAY_TOKEN,
      requestTimeoutMs: env.GROK_OPENCLAW_REQUEST_TIMEOUT_MS,
      clientName: env.GROK_OPENCLAW_CLIENT_ID,
      clientDisplayName: env.GROK_OPENCLAW_CLIENT_DISPLAY_NAME,
      clientVersion: env.GROK_OPENCLAW_CLIENT_VERSION,
      mode: env.GROK_OPENCLAW_CLIENT_MODE,
      platform: env.GROK_OPENCLAW_CLIENT_PLATFORM,
      locale: env.GROK_OPENCLAW_CLIENT_LOCALE,
      scopes: env.GROK_OPENCLAW_CLIENT_SCOPES
    });
    openclawClient.start();
    grokArena = new GrokArena(env, db, openclawClient);
  }

  const api = await buildApiServer({
    env,
    metrics: actionMetrics,
    readModel,
    db,
    chain,
    signerAddress: chain.account?.address,
    actionRepository,
    actionPreflight,
    actionCostEstimator,
    actionTxIntentBuilder,
    actionValidMenu,
    grokArena
  });

  const indexerPromise = indexer.runForever();

  await api.listen({ host: env.API_HOST, port: env.API_PORT });
  // eslint-disable-next-line no-console
  console.log(`agent-api listening on ${env.API_HOST}:${env.API_PORT}`);

  const shutdown = async () => {
    actionWorker?.stop();
    indexer.stop();
    const background = [workerPromise, indexerPromise].filter((p): p is Promise<void> => Boolean(p));
    await Promise.allSettled(background);
    openclawClient?.stop();
    await api.close();
    await db.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
