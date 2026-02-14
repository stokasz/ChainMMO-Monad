import { randomUUID } from "node:crypto";
import type { AgentActionInput } from "../shared/schemas.js";
import { Database } from "../storage/db.js";

export type ActionStatus = "queued" | "retry" | "running" | "succeeded" | "failed";

export interface ActionSubmission {
  actionId: string;
  signer: string;
  idempotencyKey: string;
  actionType: string;
  requestJson: AgentActionInput;
  status: ActionStatus;
  resultJson: unknown;
  errorCode: string | null;
  errorMessage: string | null;
  attempts: number;
  txHashes: string[];
  createdAt: string;
  updatedAt: string;
}

export class ActionRepository {
  public constructor(private readonly db: Database) {}

  public async enqueue(params: {
    signer: string;
    idempotencyKey?: string;
    action: AgentActionInput;
  }): Promise<ActionSubmission> {
    const idempotencyKey = params.idempotencyKey ?? randomUUID();
    const actionId = randomUUID();

    const rows = await this.db.query<Row>(
      `INSERT INTO action_submissions(
         action_id, signer, idempotency_key, action_type, request_json, conflict_key, status
       ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, 'queued')
       ON CONFLICT (signer, idempotency_key) DO UPDATE
         SET signer = EXCLUDED.signer
       RETURNING *`,
      [
        actionId,
        params.signer.toLowerCase(),
        idempotencyKey,
        params.action.type,
        stringifyJson(params.action),
        deriveConflictKey(params.action)
      ]
    );

    return mapRow(rows[0]);
  }

  public async claimNext(): Promise<ActionSubmission | null> {
    const rows = await this.db.query<Row>(
      `WITH candidate AS (
         SELECT queued.action_id
         FROM action_submissions AS queued
         WHERE queued.status IN ('queued', 'retry')
           AND (
             queued.conflict_key IS NULL OR (
               NOT EXISTS (
                 SELECT 1
                 FROM action_submissions AS running
                 WHERE running.status = 'running'
                   AND running.conflict_key = queued.conflict_key
               )
               AND NOT EXISTS (
                 SELECT 1
                 FROM action_submissions AS earlier
                 WHERE earlier.status IN ('queued', 'retry')
                   AND earlier.conflict_key = queued.conflict_key
                   AND (
                     earlier.created_at < queued.created_at
                     OR (earlier.created_at = queued.created_at AND earlier.action_id < queued.action_id)
                   )
               )
             )
           )
         ORDER BY queued.created_at ASC
         FOR UPDATE OF queued SKIP LOCKED
         LIMIT 1
       )
       UPDATE action_submissions AS target
       SET status = 'running',
           attempts = attempts + 1,
           updated_at = NOW()
       FROM candidate
       WHERE target.action_id = candidate.action_id
         AND target.status IN ('queued', 'retry')
       RETURNING target.*`
    );

    if (rows.length === 0) {
      return null;
    }

    return mapRow(rows[0]);
  }

  public async markSucceeded(actionId: string, result: unknown, txHashes: string[]): Promise<void> {
    await this.db.query(
      `UPDATE action_submissions
       SET status = 'succeeded',
           result_json = $2::jsonb,
           tx_hashes = $3,
           error_code = NULL,
           error_message = NULL,
           updated_at = NOW()
       WHERE action_id = $1`,
      [actionId, stringifyJson(result), txHashes]
    );
  }

  public async markRetry(actionId: string, errorCode: string, errorMessage: string): Promise<void> {
    await this.db.query(
      `UPDATE action_submissions
       SET status = 'retry',
           error_code = $2,
           error_message = $3,
           updated_at = NOW()
       WHERE action_id = $1`,
      [actionId, errorCode, errorMessage]
    );
  }

  public async markFailed(actionId: string, errorCode: string, errorMessage: string): Promise<void> {
    await this.db.query(
      `UPDATE action_submissions
       SET status = 'failed',
           error_code = $2,
           error_message = $3,
           updated_at = NOW()
       WHERE action_id = $1`,
      [actionId, errorCode, errorMessage]
    );
  }

  public async getById(actionId: string): Promise<ActionSubmission | null> {
    const rows = await this.db.query<Row>("SELECT * FROM action_submissions WHERE action_id = $1", [actionId]);
    return rows.length === 0 ? null : mapRow(rows[0]);
  }

  public async getBySignerAndKey(signer: string, idempotencyKey: string): Promise<ActionSubmission | null> {
    const rows = await this.db.query<Row>(
      "SELECT * FROM action_submissions WHERE signer = $1 AND idempotency_key = $2",
      [signer.toLowerCase(), idempotencyKey]
    );
    return rows.length === 0 ? null : mapRow(rows[0]);
  }

  public async getLatestByCharacter(characterId: number): Promise<ActionSubmission | null> {
    const rows = await this.db.query<Row>(
      `SELECT *
       FROM action_submissions
       WHERE request_json ? 'characterId'
         AND (request_json->>'characterId')::bigint = $1
       ORDER BY created_at DESC, action_id DESC
       LIMIT 1`,
      [characterId]
    );
    return rows.length === 0 ? null : mapRow(rows[0]);
  }
}

interface Row {
  action_id: string;
  signer: string;
  idempotency_key: string;
  action_type: string;
  request_json: AgentActionInput;
  status: ActionStatus;
  result_json: unknown;
  error_code: string | null;
  error_message: string | null;
  attempts: number;
  tx_hashes: string[];
  created_at: string;
  updated_at: string;
}

function deriveConflictKey(action: AgentActionInput): string | null {
  switch (action.type) {
    case "start_dungeon":
    case "next_room":
    case "open_lootboxes_max":
    case "equip_best":
    case "reroll_item":
    case "forge_set_piece":
    case "buy_premium_lootboxes":
    case "claim_player":
      return `character:${action.characterId}`;
    case "fulfill_trade_offer":
    case "cancel_trade_offer":
    case "cancel_expired_trade_offer":
      return `trade_offer:${action.offerId}`;
    default:
      return null;
  }
}

function mapRow(row: Row): ActionSubmission {
  return {
    actionId: row.action_id,
    signer: row.signer,
    idempotencyKey: row.idempotency_key,
    actionType: row.action_type,
    requestJson: row.request_json,
    status: row.status,
    resultJson: row.result_json,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    attempts: row.attempts,
    txHashes: row.tx_hashes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function stringifyJson(value: unknown): string {
  return JSON.stringify(value, (_key, fieldValue) => {
    if (typeof fieldValue === "bigint") {
      return fieldValue.toString();
    }
    return fieldValue;
  });
}
