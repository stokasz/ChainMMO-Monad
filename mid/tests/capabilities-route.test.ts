import { describe, expect, it } from "vitest";
import { ActionMetrics } from "../src/action-engine/metrics.js";
import { buildApiServer } from "../src/agent-api/server.js";

describe("capabilities route", () => {
  it("reports read-only posture and no write tool exposure", async () => {
    const app = await buildApiServer({
      env: {
        CHAIN_ID: 10143,
        MID_MODE: "read-only"
      } as any,
      signerAddress: undefined,
      actionRepository: undefined,
      metrics: new ActionMetrics(),
      readModel: {} as any
    });

    try {
      const response = await app.inject({ method: "GET", url: "/meta/capabilities" });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.chainId).toBe(10143);
      expect(body.mode).toBe("read-only");
      expect(body.actionsEnabled).toBe(false);
      expect(body.auth.apiKeyRequired).toBe(false);
      expect(body.mcp.supportedReadTools).toContain("get_capabilities");
      expect(body.mcp.supportedReadTools).toContain("build_tx_intent");
      expect(body.mcp.supportedWriteTools).toEqual([]);
      expect(body.actionsEnabledSemantics).toContain("server-side signer path is active");
    } finally {
      await app.close();
    }
  });

  it("reports full posture and write tool exposure when signer path is active", async () => {
    const app = await buildApiServer({
      env: {
        CHAIN_ID: 10143,
        MID_MODE: "full",
        API_KEY: "secret"
      } as any,
      signerAddress: "0x1111111111111111111111111111111111111111",
      actionRepository: {} as any,
      metrics: new ActionMetrics(),
      readModel: {} as any
    });

    try {
      const response = await app.inject({ method: "GET", url: "/meta/capabilities" });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.mode).toBe("full");
      expect(body.actionsEnabled).toBe(true);
      expect(body.auth.apiKeyRequired).toBe(true);
      expect(body.auth.requiredHeader).toBe("x-api-key");
      expect(body.api.supportedWriteEndpoints).toContain("/agent/action");
      expect(body.mcp.supportedWriteTools).toContain("create_character");
      expect(body.mcp.supportedWriteTools).toContain("preflight_action");
      expect(body.mcp.supportedWriteTools).toContain("buy_premium_lootboxes");
      expect(body.mcp.supportedWriteTools).toContain("finalize_epoch");
      expect(body.mcp.supportedWriteTools).toContain("claim_player");
      expect(body.mcp.supportedWriteTools).toContain("create_trade_offer");
      expect(body.mcp.supportedWriteTools).toContain("fulfill_trade_offer");
      expect(body.mcp.supportedReadTools).toContain("get_health");
      expect(body.mcp.supportedReadTools).toContain("build_tx_intent");
      expect(body.mcp.supportedReadTools).toContain("get_active_trade_offers");
    } finally {
      await app.close();
    }
  });
});
