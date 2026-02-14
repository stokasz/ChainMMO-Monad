export interface ActionMetricSnapshot {
  totals: {
    succeeded: number;
    failed: number;
    queued: number;
    retried: number;
  };
  byType: Record<string, { succeeded: number; failed: number }>;
  revertTaxonomy: Record<string, number>;
  revertTaxonomyByType: Record<string, Record<string, number>>;
  stageLatencyMs: {
    commitSubmitP95: number | null;
    mineWaitP95: number | null;
    revealSubmitP95: number | null;
  };
}

export class ActionMetrics {
  private succeeded = 0;
  private failed = 0;
  private queued = 0;
  private retried = 0;

  private byType = new Map<string, { succeeded: number; failed: number }>();
  private revertTaxonomy = new Map<string, number>();
  private revertTaxonomyByType = new Map<string, Map<string, number>>();
  private commitSubmitLatency: number[] = [];
  private mineWaitLatency: number[] = [];
  private revealSubmitLatency: number[] = [];

  public recordQueued(): void {
    this.queued += 1;
  }

  public recordSucceeded(actionType: string, result: unknown): void {
    this.succeeded += 1;
    const bucket = this.byType.get(actionType) ?? { succeeded: 0, failed: 0 };
    bucket.succeeded += 1;
    this.byType.set(actionType, bucket);

    const stage = extractStageLatency(result);
    if (stage) {
      this.pushLatency(this.commitSubmitLatency, stage.commitSubmit);
      this.pushLatency(this.mineWaitLatency, stage.mineWait);
      this.pushLatency(this.revealSubmitLatency, stage.revealSubmit);
    }
  }

  public recordRetry(): void {
    this.retried += 1;
  }

  public recordFailed(actionType: string, errorCode: string): void {
    this.failed += 1;
    const bucket = this.byType.get(actionType) ?? { succeeded: 0, failed: 0 };
    bucket.failed += 1;
    this.byType.set(actionType, bucket);

    this.revertTaxonomy.set(errorCode, (this.revertTaxonomy.get(errorCode) ?? 0) + 1);
    const byType = this.revertTaxonomyByType.get(actionType) ?? new Map<string, number>();
    byType.set(errorCode, (byType.get(errorCode) ?? 0) + 1);
    this.revertTaxonomyByType.set(actionType, byType);
  }

  public snapshot(): ActionMetricSnapshot {
    return {
      totals: {
        succeeded: this.succeeded,
        failed: this.failed,
        queued: this.queued,
        retried: this.retried
      },
      byType: Object.fromEntries(this.byType.entries()),
      revertTaxonomy: Object.fromEntries(this.revertTaxonomy.entries()),
      revertTaxonomyByType: Object.fromEntries(
        [...this.revertTaxonomyByType.entries()].map(([actionType, taxonomy]) => [
          actionType,
          Object.fromEntries(taxonomy.entries())
        ])
      ),
      stageLatencyMs: {
        commitSubmitP95: percentile95(this.commitSubmitLatency),
        mineWaitP95: percentile95(this.mineWaitLatency),
        revealSubmitP95: percentile95(this.revealSubmitLatency)
      }
    };
  }

  private pushLatency(bucket: number[], value: number): void {
    if (Number.isFinite(value) && value >= 0) {
      bucket.push(value);
      if (bucket.length > 512) {
        bucket.splice(0, bucket.length - 512);
      }
    }
  }
}

function percentile95(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.floor(sorted.length * 0.95) - 1;
  return sorted[Math.max(index, 0)];
}

function extractStageLatency(result: unknown):
  | {
      commitSubmit: number;
      mineWait: number;
      revealSubmit: number;
    }
  | undefined {
  if (!result || typeof result !== "object") {
    return undefined;
  }
  const details = (result as { details?: unknown }).details;
  if (!details || typeof details !== "object") {
    return undefined;
  }
  const stage = (details as { stageLatencyMs?: unknown }).stageLatencyMs;
  if (!stage || typeof stage !== "object") {
    return undefined;
  }
  const candidate = stage as {
    commitSubmit?: number;
    mineWait?: number;
    revealSubmit?: number;
  };

  if (
    typeof candidate.commitSubmit !== "number" ||
    typeof candidate.mineWait !== "number" ||
    typeof candidate.revealSubmit !== "number"
  ) {
    return undefined;
  }

  return {
    commitSubmit: candidate.commitSubmit,
    mineWait: candidate.mineWait,
    revealSubmit: candidate.revealSubmit
  };
}
