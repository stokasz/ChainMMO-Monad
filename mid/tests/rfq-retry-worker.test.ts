import { describe, expect, it, vi } from "vitest";
import { ActionWorker } from "../src/action-engine/worker.js";
import { ActionMetrics } from "../src/action-engine/metrics.js";
import type { ActionSubmission } from "../src/action-engine/repository.js";
import type { AgentActionInput } from "../src/shared/schemas.js";

class InMemorySingleActionRepository {
  public row: ActionSubmission;
  public retryCount = 0;
  public failedCode: string | null = null;

  public constructor(action: AgentActionInput) {
    this.row = {
      actionId: "action-1",
      signer: "0xabc",
      idempotencyKey: "idem-1",
      actionType: action.type,
      requestJson: action,
      status: "queued",
      resultJson: null,
      errorCode: null,
      errorMessage: null,
      attempts: 0,
      txHashes: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    };
  }

  public async claimNext(): Promise<ActionSubmission | null> {
    if (this.row.status !== "queued" && this.row.status !== "retry") {
      return null;
    }
    this.row.status = "running";
    this.row.attempts += 1;
    return { ...this.row };
  }

  public async markSucceeded(actionId: string, result: unknown, txHashes: string[]): Promise<void> {
    if (actionId !== this.row.actionId) {
      throw new Error("missing_action");
    }
    this.row.status = "succeeded";
    this.row.resultJson = result;
    this.row.txHashes = txHashes;
  }

  public async markRetry(actionId: string, code: string, message: string): Promise<void> {
    if (actionId !== this.row.actionId) {
      throw new Error("missing_action");
    }
    this.row.status = "retry";
    this.row.errorCode = code;
    this.row.errorMessage = message;
    this.retryCount += 1;
  }

  public async markFailed(actionId: string, code: string, message: string): Promise<void> {
    if (actionId !== this.row.actionId) {
      throw new Error("missing_action");
    }
    this.row.status = "failed";
    this.row.errorCode = code;
    this.row.errorMessage = message;
    this.failedCode = code;
  }
}

describe("rfq worker retry behavior", () => {
  it("retries create_rfq on transient nonce error and eventually succeeds", async () => {
    const repository = new InMemorySingleActionRepository({
      type: "create_rfq",
      slot: 1,
      minTier: 2,
      acceptableSetMask: "0",
      mmoOffered: "100",
      expiry: 0
    });
    const metrics = new ActionMetrics();

    const engine = {
      execute: vi
        .fn()
        .mockRejectedValueOnce(new Error("nonce too low"))
        .mockResolvedValueOnce({ code: "RFQ_CREATED", txHashes: ["0xabc"], deltaEvents: [] })
    };

    const env = {
      ACTION_WORKER_CONCURRENCY: 1,
      ACTION_WORKER_POLL_MS: 1,
      ACTION_RETRY_MAX: 3,
      ACTION_RETRY_BACKOFF_MS: 1
    } as any;

    const worker = new ActionWorker(env, repository as any, engine as any, metrics);
    const runner = worker.runForever();

    await waitFor(() => repository.row.status === "succeeded", 1_000);

    worker.stop();
    await runner;

    expect(engine.execute).toHaveBeenCalledTimes(2);
    expect(repository.retryCount).toBe(1);
    expect(repository.row.attempts).toBe(2);
    expect(repository.failedCode).toBeNull();

    const snapshot = metrics.snapshot();
    expect(snapshot.totals.retried).toBe(1);
    expect(snapshot.totals.succeeded).toBe(1);
    expect(snapshot.byType.create_rfq?.succeeded).toBe(1);
  });

  it("marks fill_rfq as failed after retry budget is exhausted", async () => {
    const repository = new InMemorySingleActionRepository({
      type: "fill_rfq",
      rfqId: 7,
      itemTokenId: 99
    });
    const metrics = new ActionMetrics();

    const engine = {
      execute: vi.fn(async () => {
        throw new Error("replacement transaction underpriced");
      })
    };

    const env = {
      ACTION_WORKER_CONCURRENCY: 1,
      ACTION_WORKER_POLL_MS: 1,
      ACTION_RETRY_MAX: 2,
      ACTION_RETRY_BACKOFF_MS: 1
    } as any;

    const worker = new ActionWorker(env, repository as any, engine as any, metrics);
    const runner = worker.runForever();

    await waitFor(() => repository.row.status === "failed", 1_000);

    worker.stop();
    await runner;

    expect(engine.execute).toHaveBeenCalledTimes(2);
    expect(repository.retryCount).toBe(1);
    expect(repository.row.attempts).toBe(2);
    expect(repository.failedCode).toBe("INFRA_NONCE_CONFLICT");

    const snapshot = metrics.snapshot();
    expect(snapshot.totals.retried).toBe(1);
    expect(snapshot.totals.failed).toBe(1);
    expect(snapshot.byType.fill_rfq?.failed).toBe(1);
    expect(snapshot.revertTaxonomy.INFRA_NONCE_CONFLICT).toBe(1);
  });
});

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("wait_timeout");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
