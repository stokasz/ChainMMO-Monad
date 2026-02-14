import type { Env } from "../config/env.js";
import { ActionEngine } from "./engine.js";
import { normalizeError } from "./errors.js";
import { ActionMetrics } from "./metrics.js";
import { ActionRepository } from "./repository.js";

export class ActionWorker {
  private running = false;

  public constructor(
    private readonly env: Env,
    private readonly repository: ActionRepository,
    private readonly engine: ActionEngine,
    private readonly metrics: ActionMetrics
  ) {}

  public async runForever(): Promise<void> {
    this.running = true;
    const workers = Array.from({ length: this.env.ACTION_WORKER_CONCURRENCY }, (_value, index) => this.runLoop(index));
    await Promise.all(workers);
  }

  private async runLoop(_workerIndex: number): Promise<void> {
    while (this.running) {
      const action = await this.repository.claimNext();
      if (!action) {
        await sleep(this.env.ACTION_WORKER_POLL_MS);
        continue;
      }

      try {
        const result = await this.engine.execute(action.requestJson);
        await this.repository.markSucceeded(action.actionId, result, result.txHashes);
        this.metrics.recordSucceeded(action.actionType, result);
      } catch (error) {
        const normalized = normalizeError(error);
        if (normalized.retryable && action.attempts < this.env.ACTION_RETRY_MAX) {
          await this.repository.markRetry(action.actionId, normalized.code, normalized.message);
          this.metrics.recordRetry();
          await sleep(this.env.ACTION_RETRY_BACKOFF_MS * action.attempts);
          continue;
        }
        await this.repository.markFailed(action.actionId, normalized.code, normalized.message);
        this.metrics.recordFailed(action.actionType, normalized.code);
      }
    }
  }

  public stop(): void {
    this.running = false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
