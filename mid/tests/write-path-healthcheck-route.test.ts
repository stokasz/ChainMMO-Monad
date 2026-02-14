import { describe, expect, it } from "vitest";
import { ActionMetrics } from "../src/action-engine/metrics.js";
import { buildApiServer } from "../src/agent-api/server.js";

const VALID_META = {
  chainId: 10143,
  gameWorld: "0x1111111111111111111111111111111111111111",
  feeVault: "0x2222222222222222222222222222222222222222",
  items: "0x3333333333333333333333333333333333333333",
  mmoToken: "0x4444444444444444444444444444444444444444",
  tradeEscrow: "0x5555555555555555555555555555555555555555",
  rfqMarket: "0x6666666666666666666666666666666666666666"
};

describe("write path readiness route", () => {
  it("reports deterministic blocked codes when write path is disabled", async () => {
    const app = await buildApiServer({
      env: {
        CHAIN_ID: 10143,
        MID_MODE: "read-only"
      } as any,
      signerAddress: undefined,
      actionRepository: undefined,
      metrics: new ActionMetrics(),
      readModel: {
        getContractMeta: () => VALID_META
      } as any
    });

    try {
      const response = await app.inject({ method: "GET", url: "/agent/healthcheck-write-path" });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.ready).toBe(false);
      expect(body.failCodes).toContain("WRITE_PATH_DISABLED");
      expect(body.failCodes).toContain("SIGNER_UNAVAILABLE");
      expect(body.checks.contractsManifest.ok).toBe(true);
      expect(body.checks.apiKeyScope.ok).toBe(false);
      expect(body.checks.apiKeyScope.code).toBe("API_KEY_SCOPE_DISABLED");
      expect(body.warnings).toContain("API_KEY_SCOPE_DISABLED");
    } finally {
      await app.close();
    }
  });

  it("fails affordability check with deterministic code when signer balance is too low", async () => {
    const app = await buildApiServer({
      env: {
        CHAIN_ID: 10143,
        MID_MODE: "full",
        API_KEY: "secret"
      } as any,
      signerAddress: "0x7777777777777777777777777777777777777777",
      actionRepository: {} as any,
      metrics: new ActionMetrics(),
      readModel: {
        getContractMeta: () => VALID_META,
        getCommitFee: async () => ({ commitFeeWei: "1000" }),
        getFeeEstimate: async () => ({ maxFeePerGasWei: "2", source: "legacy" }),
        getNativeBalance: async () => ({ balanceWei: "1000" })
      } as any
    });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/agent/healthcheck-write-path",
        headers: { "x-api-key": "secret" }
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.ready).toBe(false);
      expect(body.failCodes).toContain("SIGNER_BALANCE_BELOW_FLOOR");
      expect(body.checks.gasAffordabilityFloor.ok).toBe(false);
      expect(body.checks.gasAffordabilityFloor.code).toBe("SIGNER_BALANCE_BELOW_FLOOR");
      expect(body.checks.gasAffordabilityFloor.requiredFloorWei).toBe("501000");
    } finally {
      await app.close();
    }
  });

  it("reports ready=true when signer path, manifest, and affordability checks pass", async () => {
    const app = await buildApiServer({
      env: {
        CHAIN_ID: 10143,
        MID_MODE: "full",
        API_KEY: "secret"
      } as any,
      signerAddress: "0x7777777777777777777777777777777777777777",
      actionRepository: {} as any,
      metrics: new ActionMetrics(),
      readModel: {
        getContractMeta: () => VALID_META,
        getCommitFee: async () => ({ commitFeeWei: "1000" }),
        getFeeEstimate: async () => ({ maxFeePerGasWei: "2", source: "legacy" }),
        getNativeBalance: async () => ({ balanceWei: "999999999999" })
      } as any
    });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/agent/healthcheck-write-path",
        headers: { "x-api-key": "secret" }
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.ready).toBe(true);
      expect(body.failCodes).toEqual([]);
      expect(body.warnings).toEqual([]);
      expect(body.checks.gasAffordabilityFloor.ok).toBe(true);
      expect(body.checks.apiKeyScope.ok).toBe(true);
    } finally {
      await app.close();
    }
  });
});
