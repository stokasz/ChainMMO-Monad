import { randomUUID } from "node:crypto";
import { computeHarnessMetrics, evaluateHarnessGates } from "../src/benchmark/harness-metrics.js";

interface HarnessActionStatus {
  status: "queued" | "running" | "retry" | "succeeded" | "failed";
  errorCode?: string | null;
  result?: Record<string, unknown> | null;
}

const baseUrl = process.env.HARNESS_API_BASE_URL ?? process.env.AGENT_API_BASE_URL ?? "http://127.0.0.1:8787";
const apiKey = process.env.HARNESS_API_KEY ?? process.env.AGENT_API_KEY ?? process.env.API_KEY;
const maxActions = readInt("HARNESS_MAX_ACTIONS", 120, 1);
const targetBestLevel = readInt("HARNESS_TARGET_BEST_LEVEL", 15, 1);
const waitTimeoutMs = readInt("HARNESS_ACTION_WAIT_TIMEOUT_MS", 180_000, 1_000);
const pollMs = readInt("HARNESS_ACTION_POLL_MS", 1_000, 100);
const maxRevertRate = readFloat("HARNESS_ACCEPT_MAX_REVERT_RATE", 0.2, 0, 1);
const maxFailedGasBurnWei = readBigInt("HARNESS_ACCEPT_MAX_FAILED_GAS_BURN_WEI", 3_000_000_000_000_000n);
const maxActionsPerLevelUp = readFloat("HARNESS_ACCEPT_MAX_ACTIONS_PER_LEVEL_UP", 12, 1, 10_000);

async function main(): Promise<void> {
  const capabilities = await getJson("/meta/capabilities");
  if (!capabilities.actionsEnabled) {
    throw new Error("harness_requires_actions_enabled");
  }

  const createResult = await submitAndWait({
    type: "create_character",
    race: 0,
    classType: 0,
    name: `Harness-${Date.now()}`
  });
  if (createResult.status !== "succeeded") {
    throw new Error(`create_character_failed:${createResult.errorCode ?? "unknown"}`);
  }

  const characterId = extractCharacterId(createResult.result);
  if (!characterId) {
    throw new Error("harness_character_id_unavailable");
  }

  let attemptedActions = 0;
  let failedActions = 0;
  let failedGasBurnWei = 0n;
  let successfulLevelUps = 0;
  let finalBestLevel = await getBestLevel(characterId);
  let stopReason = "max_actions";

  for (let index = 0; index < maxActions; index++) {
    const bestBefore = await getBestLevel(characterId);
    if (bestBefore >= targetBestLevel) {
      finalBestLevel = bestBefore;
      stopReason = "target_reached";
      break;
    }

    const menu = await getJson(`/agent/valid-actions/${characterId}`);
    const action = chooseAction(menu, bestBefore);
    if (!action) {
      finalBestLevel = bestBefore;
      stopReason = "no_legal_action";
      break;
    }

    const preflight = await postJson("/agent/preflight", action);
    if (!preflight.willSucceed) {
      finalBestLevel = bestBefore;
      stopReason = `preflight_blocked:${String(preflight.code ?? "unknown")}`;
      break;
    }

    const estimate = await postJson("/agent/estimate-cost", action);
    const estimatedTxCostWei = parseBigIntSafe(estimate.estimatedTxCostWei) ?? 0n;

    const outcome = await submitAndWait(action);
    attemptedActions += 1;
    if (outcome.status !== "succeeded") {
      failedActions += 1;
      failedGasBurnWei += estimatedTxCostWei;
      continue;
    }

    const bestAfter = await getBestLevel(characterId);
    if (bestAfter > bestBefore) {
      successfulLevelUps += bestAfter - bestBefore;
    }
    finalBestLevel = bestAfter;
  }

  const metrics = computeHarnessMetrics({
    attemptedActions,
    failedActions,
    failedGasBurnWei,
    successfulLevelUps
  });
  const gates = evaluateHarnessGates(metrics, {
    maxRevertRate,
    maxFailedGasBurnWei,
    maxActionsPerSuccessfulLevelUp: maxActionsPerLevelUp
  });

  const output = {
    status: gates.ok ? "pass" : "fail",
    chainId: capabilities.chainId,
    baseUrl,
    characterId,
    targetBestLevel,
    finalBestLevel,
    stopReason,
    sample: {
      attemptedActions,
      failedActions,
      successfulLevelUps,
      failedGasBurnWei: failedGasBurnWei.toString()
    },
    metrics: {
      revertRate: Number(metrics.revertRate.toFixed(4)),
      failedGasBurnWei: metrics.failedGasBurnWei.toString(),
      actionsPerSuccessfulLevelUp:
        metrics.actionsPerSuccessfulLevelUp === null ? null : Number(metrics.actionsPerSuccessfulLevelUp.toFixed(4))
    },
    qualityGates: {
      maxRevertRate,
      maxFailedGasBurnWei: maxFailedGasBurnWei.toString(),
      maxActionsPerSuccessfulLevelUp: maxActionsPerLevelUp
    },
    failedChecks: gates.failedChecks
  };

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(output, null, 2));
  if (!gates.ok) {
    process.exitCode = 1;
  }
}

async function submitAndWait(action: Record<string, unknown>): Promise<HarnessActionStatus> {
  const queued = await postJson("/agent/action", action, {
    "idempotency-key": `harness-${randomUUID()}`
  });
  const actionId = String(queued.actionId ?? "");
  if (!actionId) {
    throw new Error("missing_action_id");
  }

  const deadline = Date.now() + waitTimeoutMs;
  while (Date.now() < deadline) {
    const status = await getJson(`/agent/action/${actionId}`);
    if (status.status === "succeeded" || status.status === "failed") {
      return {
        status: status.status,
        errorCode: status.errorCode ?? null,
        result: (status.result as Record<string, unknown> | undefined) ?? null
      };
    }
    await sleep(pollMs);
  }

  throw new Error(`action_wait_timeout:${actionId}`);
}

function chooseAction(menu: any, bestLevel: number): Record<string, unknown> | null {
  const validActions = Array.isArray(menu?.validActions) ? menu.validActions : [];
  const byType = new Map<string, any>(validActions.map((entry: any) => [String(entry.actionType), entry]));

  const start = byType.get("start_dungeon");
  if (start) {
    const suggested = (start.suggestedParams ?? {}) as Record<string, unknown>;
    return {
      type: "start_dungeon",
      characterId: Number(menu.characterId),
      difficulty: toInt(suggested.difficulty, bestLevel <= 10 ? 1 : 2),
      dungeonLevel: toInt(suggested.dungeonLevel, Math.max(1, bestLevel + 1)),
      varianceMode: toInt(suggested.varianceMode, 1)
    };
  }

  const nextRoom = byType.get("next_room");
  if (nextRoom) {
    const suggested = (nextRoom.suggestedParams ?? {}) as Record<string, unknown>;
    return {
      type: "next_room",
      characterId: Number(menu.characterId),
      potionChoice: toInt(suggested.potionChoice, 0),
      abilityChoice: toInt(suggested.abilityChoice, 0)
    };
  }

  const open = byType.get("open_lootboxes_max");
  if (open) {
    const suggested = (open.suggestedParams ?? {}) as Record<string, unknown>;
    return {
      type: "open_lootboxes_max",
      characterId: Number(menu.characterId),
      tier: toInt(suggested.tier, Math.max(1, bestLevel)),
      maxAmount: toInt(suggested.maxAmount, 1),
      varianceMode: toInt(suggested.varianceMode, 1)
    };
  }

  const equip = byType.get("equip_best");
  if (equip) {
    return {
      type: "equip_best",
      characterId: Number(menu.characterId),
      objective: "balanced"
    };
  }

  return null;
}

async function getBestLevel(characterId: number): Promise<number> {
  const payload = await getJson(`/agent/state/${characterId}`);
  return Number(payload?.state?.character?.bestLevel ?? 0);
}

function extractCharacterId(result: Record<string, unknown> | null | undefined): number | null {
  const raw = (result?.details as Record<string, unknown> | undefined)?.characterId;
  if (typeof raw === "number" && Number.isInteger(raw) && raw > 0) {
    return raw;
  }
  if (typeof raw === "string") {
    const parsed = Number(raw);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

async function getJson(path: string): Promise<any> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: buildHeaders()
  });
  if (!response.ok) {
    throw new Error(`http_${response.status}:${path}`);
  }
  return response.json();
}

async function postJson(path: string, body: Record<string, unknown>, extraHeaders?: Record<string, string>): Promise<any> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      ...buildHeaders(),
      "content-type": "application/json",
      ...(extraHeaders ?? {})
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`http_${response.status}:${path}`);
  }
  return response.json();
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }
  return headers;
}

function toInt(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isInteger(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function parseBigIntSafe(value: unknown): bigint | null {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return BigInt(value);
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return BigInt(value);
  }
  return null;
}

function readInt(name: string, fallback: number, min: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < min) {
    return fallback;
  }
  return parsed;
}

function readFloat(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return fallback;
  }
  return parsed;
}

function readBigInt(name: string, fallback: bigint): bigint {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  try {
    const parsed = BigInt(raw);
    return parsed >= 0n ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
