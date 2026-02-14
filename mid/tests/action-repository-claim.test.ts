import { describe, expect, it } from "vitest";
import { ActionRepository } from "../src/action-engine/repository.js";

class FakeDb {
  public calls: Array<{ text: string; values: unknown[] }> = [];
  private readonly responses: unknown[][];

  public constructor(responses: unknown[][]) {
    this.responses = responses;
  }

  public async query<T>(text: string, values: unknown[] = []): Promise<T[]> {
    this.calls.push({ text, values });
    const next = this.responses.shift() ?? [];
    return next as T[];
  }
}

describe("action repository claimNext", () => {
  it("stores a character conflict key for character-scoped actions", async () => {
    const db = new FakeDb([
      [
        {
          action_id: "6ad6f7b3-6f70-4f44-b358-c6228cc3c79f",
          signer: "0xabc",
          idempotency_key: "idem-0",
          action_type: "start_dungeon",
          request_json: {
            type: "start_dungeon",
            characterId: 11,
            difficulty: 0,
            dungeonLevel: 1,
            varianceMode: 1
          },
          status: "queued",
          result_json: null,
          error_code: null,
          error_message: null,
          attempts: 0,
          tx_hashes: [],
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z"
        }
      ]
    ]);

    const repository = new ActionRepository(db as any);
    await repository.enqueue({
      signer: "0xAbC",
      idempotencyKey: "idem-0",
      action: {
        type: "start_dungeon",
        characterId: 11,
        difficulty: 0,
        dungeonLevel: 1,
        varianceMode: 1
      }
    });

    const values = db.calls[0]?.values ?? [];
    expect(values[5]).toBe("character:11");
  });

  it("uses skip-locked claim semantics and returns mapped submission", async () => {
    const db = new FakeDb([
      [
        {
          action_id: "b58f5f9f-f3af-4d4d-a2da-6f42ee74606f",
          signer: "0xabc",
          idempotency_key: "idem-1",
          action_type: "start_dungeon",
          request_json: {
            type: "start_dungeon",
            characterId: 7,
            difficulty: 0,
            dungeonLevel: 2,
            varianceMode: 1
          },
          status: "running",
          result_json: null,
          error_code: null,
          error_message: null,
          attempts: 1,
          tx_hashes: [],
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:01.000Z"
        }
      ]
    ]);

    const repository = new ActionRepository(db as any);
    const claimed = await repository.claimNext();

    expect(claimed?.actionId).toBe("b58f5f9f-f3af-4d4d-a2da-6f42ee74606f");
    expect(claimed?.status).toBe("running");

    const query = db.calls[0]?.text ?? "";
    expect(query).toContain("FOR UPDATE OF queued SKIP LOCKED");
    expect(query).toContain("target.status IN ('queued', 'retry')");
    expect(query).toContain("running.status = 'running'");
    expect(query).toContain("running.conflict_key = queued.conflict_key");
    expect(query).toContain("earlier.status IN ('queued', 'retry')");
    expect(query).toContain("earlier.action_id < queued.action_id");
  });

  it("queries latest action by character id from request_json payload", async () => {
    const db = new FakeDb([
      [
        {
          action_id: "a0f64fdf-f3af-4d4d-a2da-6f42ee74606f",
          signer: "0xabc",
          idempotency_key: "idem-2",
          action_type: "next_room",
          request_json: {
            type: "next_room",
            characterId: 42,
            potionChoice: 0,
            abilityChoice: 0
          },
          status: "succeeded",
          result_json: { code: "ROOM_RESOLVED" },
          error_code: null,
          error_message: null,
          attempts: 1,
          tx_hashes: ["0x1"],
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:01.000Z"
        }
      ]
    ]);

    const repository = new ActionRepository(db as any);
    const latest = await repository.getLatestByCharacter(42);

    expect(latest?.actionId).toBe("a0f64fdf-f3af-4d4d-a2da-6f42ee74606f");
    const query = db.calls[0]?.text ?? "";
    expect(query).toContain("request_json ? 'characterId'");
    expect(query).toContain("(request_json->>'characterId')::bigint = $1");
  });
});
