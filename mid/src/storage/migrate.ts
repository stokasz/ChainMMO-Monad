import { loadEnv } from "../config/env.js";
import { Database } from "./db.js";
import { runMigrations } from "./migration-runner.js";

async function main(): Promise<void> {
  const env = loadEnv();
  const db = new Database(env);
  try {
    await runMigrations(db);
  } finally {
    await db.close();
  }
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
