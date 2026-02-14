import { ChainAdapter } from "../chain-adapter/client.js";
import { loadEnv } from "../config/env.js";
import { applyContractsLatestToEnv, loadContractsLatestFile, resolveContractsLatestPath } from "../config/contracts.js";
import { Database } from "../storage/db.js";
import { ChainIndexer } from "./indexer.js";

async function main(): Promise<void> {
  const baseEnv = loadEnv();
  const contractsPath = resolveContractsLatestPath(baseEnv);
  if (!contractsPath) {
    throw new Error("deployments/contracts.latest.json not found; set CONTRACTS_JSON_PATH or run deploy-and-sync");
  }
  const latest = loadContractsLatestFile(contractsPath);
  const env = applyContractsLatestToEnv(baseEnv, latest);
  const db = new Database(env);
  const chain = new ChainAdapter(env);
  const indexer = new ChainIndexer(env, chain, db);

  process.on("SIGINT", async () => {
    indexer.stop();
    await db.close();
    process.exit(0);
  });

  await indexer.runForever();
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
