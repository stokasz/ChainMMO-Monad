import { describe, expect, it } from "vitest";
import { computeHarnessMetrics, evaluateHarnessGates } from "../src/benchmark/harness-metrics.js";

describe("blind harness metrics", () => {
  it("computes revert rate and actions-per-level-up", () => {
    const metrics = computeHarnessMetrics({
      attemptedActions: 20,
      failedActions: 2,
      failedGasBurnWei: 123n,
      successfulLevelUps: 4
    });

    expect(metrics.revertRate).toBe(0.1);
    expect(metrics.actionsPerSuccessfulLevelUp).toBe(5);
    expect(metrics.failedGasBurnWei).toBe(123n);
  });

  it("fails gates when quality thresholds are exceeded", () => {
    const result = evaluateHarnessGates(
      {
        revertRate: 0.25,
        failedGasBurnWei: 10_000n,
        actionsPerSuccessfulLevelUp: null
      },
      {
        maxRevertRate: 0.1,
        maxFailedGasBurnWei: 100n,
        maxActionsPerSuccessfulLevelUp: 8
      }
    );

    expect(result.ok).toBe(false);
    expect(result.failedChecks).toContain("REVERT_RATE_EXCEEDED");
    expect(result.failedChecks).toContain("FAILED_GAS_BURN_EXCEEDED");
    expect(result.failedChecks).toContain("NO_SUCCESSFUL_LEVEL_UPS");
  });
});
