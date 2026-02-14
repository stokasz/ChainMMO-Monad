import { randomUUID } from "node:crypto";

export interface AgentApiClient {
  getJson(path: string): Promise<unknown>;
  postJson(path: string, payload: Record<string, unknown>): Promise<unknown>;
  submitAction(
    payload: Record<string, unknown>,
    opts?: {
      wait?: boolean;
      idempotencyKey?: string;
      pollIntervalMs?: number;
      pollTimeoutMs?: number;
    }
  ): Promise<unknown>;
}

export function createAgentApiClient(input: {
  baseUrl: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  requestTimeoutMs?: number;
  sessionSpendCeilingWei?: string | bigint;
  maxFailedTx?: number;
}): AgentApiClient {
  const fetchImpl = input.fetchImpl ?? fetch;
  const baseUrl = stripTrailingSlash(input.baseUrl);
  const apiKey = input.apiKey;
  const requestTimeoutMs = input.requestTimeoutMs ?? 15_000;
  const sessionSpendCeilingWei = parseOptionalBigInt(input.sessionSpendCeilingWei);
  const maxFailedTx =
    typeof input.maxFailedTx === "number" && Number.isInteger(input.maxFailedTx) && input.maxFailedTx >= 0
      ? input.maxFailedTx
      : undefined;
  let reservedEstimatedSpendWei = 0n;
  let failedTxCount = 0;

  async function getJson(path: string): Promise<unknown> {
    const response = await fetchWithTimeout(fetchImpl, `${baseUrl}${path}`, {
      headers: buildHeaders({ apiKey })
    }, requestTimeoutMs);
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`request_failed_${response.status}:${body}`);
    }
    return response.json();
  }

  async function postJson(path: string, payload: Record<string, unknown>): Promise<unknown> {
    const response = await fetchWithTimeout(fetchImpl, `${baseUrl}${path}`, {
      method: "POST",
      headers: buildHeaders({ apiKey, json: true }),
      body: JSON.stringify(payload)
    }, requestTimeoutMs);
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`request_failed_${response.status}:${body}`);
    }
    return response.json();
  }

  async function submitAction(
    payload: Record<string, unknown>,
    opts: {
      wait?: boolean;
      idempotencyKey?: string;
      pollIntervalMs?: number;
      pollTimeoutMs?: number;
    } = {}
  ): Promise<unknown> {
    if (maxFailedTx !== undefined && failedTxCount >= maxFailedTx) {
      return {
        error: "failed_tx_guard_triggered",
        code: "FAILED_TX_GUARD_TRIGGERED",
        failedTxCount,
        maxFailedTx
      };
    }

    if (sessionSpendCeilingWei !== undefined) {
      let estimate: unknown;
      try {
        estimate = await postJson("/agent/estimate-cost", payload);
      } catch (error) {
        return {
          error: "spend_guard_estimate_failed",
          code: "SPEND_GUARD_ESTIMATE_FAILED",
          reason: error instanceof Error ? error.message : String(error)
        };
      }

      const estimatedCostWei = parseOptionalBigInt((estimate as Record<string, unknown>).totalEstimatedCostWei);
      if (estimatedCostWei === undefined) {
        return {
          error: "spend_guard_bad_estimate",
          code: "SPEND_GUARD_BAD_ESTIMATE",
          estimate
        };
      }

      const projectedReservedSpendWei = reservedEstimatedSpendWei + estimatedCostWei;
      if (projectedReservedSpendWei > sessionSpendCeilingWei) {
        return {
          error: "spend_guard_ceiling_exceeded",
          code: "SPEND_GUARD_CEILING_EXCEEDED",
          estimatedActionCostWei: estimatedCostWei.toString(),
          reservedEstimatedSpendWei: reservedEstimatedSpendWei.toString(),
          projectedReservedSpendWei: projectedReservedSpendWei.toString(),
          spendCeilingWei: sessionSpendCeilingWei.toString()
        };
      }

      reservedEstimatedSpendWei = projectedReservedSpendWei;
    }

    const idempotencyKey = opts.idempotencyKey ?? `mcp-${randomUUID()}`;
    const response = await fetchWithTimeout(fetchImpl, `${baseUrl}/agent/action`, {
      method: "POST",
      headers: buildHeaders({ apiKey, idempotencyKey, json: true }),
      body: JSON.stringify(payload)
    }, requestTimeoutMs);

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`action_submit_failed_${response.status}:${body}`);
    }

    const queued = (await response.json()) as { actionId: string };
    if (!opts.wait) {
      return attachClientMetadata(queued, {
        idempotencyKey,
        reservedEstimatedSpendWei,
        failedTxCount
      });
    }

    const pollIntervalMs = opts.pollIntervalMs ?? 600;
    const pollTimeoutMs = opts.pollTimeoutMs ?? 120_000;
    const deadline = Date.now() + pollTimeoutMs;
    while (Date.now() < deadline) {
      const statusResponse = await fetchWithTimeout(fetchImpl, `${baseUrl}/agent/action/${queued.actionId}`, {
        headers: buildHeaders({ apiKey })
      }, requestTimeoutMs);
      if (!statusResponse.ok) {
        const body = await statusResponse.text();
        throw new Error(`action_status_failed_${statusResponse.status}:${body}`);
      }

      const status = (await statusResponse.json()) as { status: string };
      if (status.status === "succeeded" || status.status === "failed") {
        if (status.status === "failed") {
          failedTxCount += 1;
        }
        return attachClientMetadata(status, {
          idempotencyKey,
          reservedEstimatedSpendWei,
          failedTxCount
        });
      }
      await sleep(pollIntervalMs);
    }

    throw new Error("action_poll_timeout");
  }

  return { getJson, postJson, submitAction };
}

function attachClientMetadata(
  result: unknown,
  meta: {
    idempotencyKey: string;
    reservedEstimatedSpendWei: bigint;
    failedTxCount: number;
  }
): unknown {
  if (!result || typeof result !== "object") {
    return result;
  }
  return {
    ...(result as Record<string, unknown>),
    idempotencyKey: meta.idempotencyKey,
    guard: {
      reservedEstimatedSpendWei: meta.reservedEstimatedSpendWei.toString(),
      failedTxCount: meta.failedTxCount
    }
  };
}

function buildHeaders(input: { apiKey?: string; idempotencyKey?: string; json?: boolean }): Record<string, string> {
  const headers: Record<string, string> = {};
  if (input.json) {
    headers["content-type"] = "application/json";
  }
  if (input.apiKey) {
    headers["x-api-key"] = input.apiKey;
  }
  if (input.idempotencyKey) {
    headers["idempotency-key"] = input.idempotencyKey;
  }
  return headers;
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return (await fetchImpl(url, { ...init, signal: controller.signal } as any)) as any;
  } finally {
    clearTimeout(timer);
  }
}

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function parseOptionalBigInt(value: unknown): bigint | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "bigint") {
    return value >= 0n ? value : undefined;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    try {
      const parsed = BigInt(value);
      return parsed >= 0n ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
