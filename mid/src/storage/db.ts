import { Pool, type PoolClient, type QueryResultRow } from "pg";
import type { Env } from "../config/env.js";

export class Database {
  private readonly pool: Pool;

  public constructor(env: Env) {
    this.pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: env.DATABASE_POOL_MAX,
      idleTimeoutMillis: env.DATABASE_POOL_IDLE_TIMEOUT_MS,
      connectionTimeoutMillis: env.DATABASE_POOL_CONNECTION_TIMEOUT_MS
    });
  }

  public async query<T = QueryResultRow>(text: string, values: unknown[] = []): Promise<T[]> {
    const result = await this.pool.query(text, values);
    return result.rows as T[];
  }

  public async withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const out = await fn(client);
      await client.query("COMMIT");
      return out;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }
}
