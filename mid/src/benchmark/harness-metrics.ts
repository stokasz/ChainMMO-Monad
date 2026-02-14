export interface HarnessRunSample {
  attemptedActions: number;
  failedActions: number;
  failedGasBurnWei: bigint;
  successfulLevelUps: number;
}

export interface HarnessComputedMetrics {
  revertRate: number;
  failedGasBurnWei: bigint;
  actionsPerSuccessfulLevelUp: number | null;
}

export interface HarnessQualityGates {
  maxRevertRate: number;
  maxFailedGasBurnWei: bigint;
  maxActionsPerSuccessfulLevelUp: number;
}

export interface HarnessGateResult {
  ok: boolean;
  failedChecks: string[];
}

export function computeHarnessMetrics(sample: HarnessRunSample): HarnessComputedMetrics {
  const attempted = Math.max(0, sample.attemptedActions);
  const failed = Math.max(0, sample.failedActions);
  const levelUps = Math.max(0, sample.successfulLevelUps);
  const revertRate = attempted === 0 ? 0 : failed / attempted;

  return {
    revertRate,
    failedGasBurnWei: sample.failedGasBurnWei < 0n ? 0n : sample.failedGasBurnWei,
    actionsPerSuccessfulLevelUp: levelUps === 0 ? null : attempted / levelUps
  };
}

export function evaluateHarnessGates(
  metrics: HarnessComputedMetrics,
  gates: HarnessQualityGates
): HarnessGateResult {
  const failedChecks: string[] = [];

  if (!Number.isFinite(metrics.revertRate) || metrics.revertRate > gates.maxRevertRate) {
    failedChecks.push("REVERT_RATE_EXCEEDED");
  }
  if (metrics.failedGasBurnWei > gates.maxFailedGasBurnWei) {
    failedChecks.push("FAILED_GAS_BURN_EXCEEDED");
  }
  if (metrics.actionsPerSuccessfulLevelUp === null) {
    failedChecks.push("NO_SUCCESSFUL_LEVEL_UPS");
  } else if (metrics.actionsPerSuccessfulLevelUp > gates.maxActionsPerSuccessfulLevelUp) {
    failedChecks.push("ACTIONS_PER_LEVEL_UP_EXCEEDED");
  }

  return {
    ok: failedChecks.length === 0,
    failedChecks
  };
}
