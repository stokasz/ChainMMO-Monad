import { describe, expect, it } from "vitest";
import { ActionMetrics } from "../src/action-engine/metrics.js";

describe("action metrics", () => {
  it("tracks success, failure, and latency percentiles", () => {
    const metrics = new ActionMetrics();
    metrics.recordQueued();
    metrics.recordSucceeded("start_dungeon", {
      details: {
        stageLatencyMs: {
          commitSubmit: 30,
          mineWait: 900,
          revealSubmit: 40
        }
      }
    });
    metrics.recordFailed("start_dungeon", "CHAIN_INVALID_REVEAL");
    metrics.recordFailed("start_dungeon", "CHAIN_REVEAL_TOO_EARLY");
    metrics.recordFailed("fill_rfq", "CHAIN_RFQ_EXPIRED");

    const snapshot = metrics.snapshot();
    expect(snapshot.totals.queued).toBe(1);
    expect(snapshot.totals.succeeded).toBe(1);
    expect(snapshot.totals.failed).toBe(3);
    expect(snapshot.byType.start_dungeon.succeeded).toBe(1);
    expect(snapshot.revertTaxonomy.CHAIN_INVALID_REVEAL).toBe(1);
    expect(snapshot.revertTaxonomyByType.start_dungeon.CHAIN_INVALID_REVEAL).toBe(1);
    expect(snapshot.revertTaxonomyByType.start_dungeon.CHAIN_REVEAL_TOO_EARLY).toBe(1);
    expect(snapshot.revertTaxonomyByType.fill_rfq.CHAIN_RFQ_EXPIRED).toBe(1);
    expect(snapshot.stageLatencyMs.mineWaitP95).toBe(900);
  });
});
