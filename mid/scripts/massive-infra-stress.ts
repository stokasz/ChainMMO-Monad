import { ActionWorker } from "../src/action-engine/worker.js";
import { ActionMetrics } from "../src/action-engine/metrics.js";
import type { ActionSubmission } from "../src/action-engine/repository.js";
import type { AgentActionInput } from "../src/shared/schemas.js";

class InMemoryQueueRepository {
  private readonly submissions: ActionSubmission[];
  public readonly claimed = new Set<string>();
  public duplicateClaims = 0;
  public succeeded = 0;
  public failed = 0;

  public constructor(total: number) {
    this.submissions = Array.from({ length: total }, (_value, index) => {
      const action: AgentActionInput = {
        type: "open_lootboxes_max",
        characterId: index + 1,
        tier: 2,
        maxAmount: 1,
        varianceMode: 1
      };
      return {
        actionId: `stress-action-${index}`,
        signer: "0xabc",
        idempotencyKey: `idem-${index}`,
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
    });
  }

  public async claimNext(): Promise<ActionSubmission | null> {
    const candidate = this.submissions.find((row) => row.status === "queued" || row.status === "retry");
    if (!candidate) {
      return null;
    }

    if (candidate.status === "running") {
      this.duplicateClaims += 1;
      return null;
    }

    candidate.status = "running";
    candidate.attempts += 1;

    if (this.claimed.has(candidate.actionId)) {
      this.duplicateClaims += 1;
    }
    this.claimed.add(candidate.actionId);

    return { ...candidate };
  }

  public async markSucceeded(actionId: string, result: unknown, txHashes: string[]): Promise<void> {
    const row = this.submissions.find((entry) => entry.actionId === actionId);
    if (!row) {
      throw new Error("missing_action");
    }
    row.status = "succeeded";
    row.resultJson = result;
    row.txHashes = txHashes;
    this.succeeded += 1;
  }

  public async markRetry(actionId: string, code: string, message: string): Promise<void> {
    const row = this.submissions.find((entry) => entry.actionId === actionId);
    if (!row) {
      throw new Error("missing_action");
    }
    row.status = "retry";
    row.errorCode = code;
    row.errorMessage = message;
  }

  public async markFailed(actionId: string, code: string, message: string): Promise<void> {
    const row = this.submissions.find((entry) => entry.actionId === actionId);
    if (!row) {
      throw new Error("missing_action");
    }
    row.status = "failed";
    row.errorCode = code;
    row.errorMessage = message;
    this.failed += 1;
  }
}

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("stress_timeout");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function main(): Promise<void> {
  const totalActions = 25_000;
  const repository = new InMemoryQueueRepository(totalActions);
  const metrics = new ActionMetrics();

  const engine = {
    execute: async (action: AgentActionInput) => {
      await Promise.resolve();
      const characterId = "characterId" in action ? action.characterId : 0;
      return {
        code: "STRESS_OK",
        txHashes: [`0x${characterId.toString(16)}`],
        deltaEvents: []
      };
    }
  };

  const env = {
    ACTION_WORKER_CONCURRENCY: 128,
    ACTION_WORKER_POLL_MS: 1,
    ACTION_RETRY_MAX: 3,
    ACTION_RETRY_BACKOFF_MS: 1
  } as const;

  const worker = new ActionWorker(env as any, repository as any, engine as any, metrics);

  const start = Date.now();
  const runner = worker.runForever();

  await waitFor(() => repository.succeeded === totalActions, 30_000);

  worker.stop();
  await runner;
  const elapsedMs = Date.now() - start;

  const result = {
    totalActions,
    elapsedMs,
    throughputActionsPerSec: Number(((totalActions * 1000) / elapsedMs).toFixed(2)),
    duplicateClaims: repository.duplicateClaims,
    failed: repository.failed,
    metrics: metrics.snapshot().totals
  };

  if (repository.failed > 0 || repository.duplicateClaims > 0 || repository.succeeded !== totalActions) {
    // eslint-disable-next-line no-console
    console.error(JSON.stringify({ status: "failed", ...result }, null, 2));
    process.exitCode = 1;
    return;
  }

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ status: "ok", ...result }, null, 2));
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
