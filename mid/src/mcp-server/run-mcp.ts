import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import dotenv from "dotenv";
import { z } from "zod";
import { agentActionInputSchema } from "../shared/schemas.js";
import { createAgentApiClient } from "./client.js";

dotenv.config();

const apiPort = safeNumber(process.env.API_PORT) ?? 8787;
const baseUrl = process.env.AGENT_API_BASE_URL ?? `http://127.0.0.1:${apiPort}`;
const apiKey = process.env.AGENT_API_KEY ?? process.env.API_KEY;
const requestTimeoutMs = safeNumber(process.env.MCP_REQUEST_TIMEOUT_MS) ?? 15_000;
const sessionSpendCeilingWei = parseOptionalBigInt(process.env.MCP_SESSION_SPEND_CEILING_WEI);
const maxFailedTxGuard = safeInteger(process.env.MCP_MAX_FAILED_TX_GUARD);
const client = createAgentApiClient({
  baseUrl,
  apiKey,
  requestTimeoutMs,
  sessionSpendCeilingWei,
  maxFailedTx: maxFailedTxGuard
});

const actionsEnabled = await detectActionsEnabled();
const server = new McpServer({ name: "chainmmo-mcp", version: "0.1.0" });

const actionCommonSchema = z.object({
  wait: z.boolean().optional().default(true),
  idempotencyKey: z.string().min(1).max(128).optional()
});

server.tool("get_capabilities", {}, async () => format(await client.getJson("/meta/capabilities")));
server.tool("get_health", {}, async () => format(await client.getJson("/health")));
server.tool("get_contracts", {}, async () => format(await client.getJson("/meta/contracts")));
server.tool("get_public_rpc", {}, async () => {
  try {
    return format(await client.getJson("/meta/rpc"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("request_failed_404:")) {
    return format({
      error: "public_rpc_not_configured",
      hint: "Set CHAIN_PUBLIC_RPC_URLS (comma-separated) or CHAIN_PUBLIC_RPC_URL on the API host to expose this."
    });
    }
    return format({
      error: "get_public_rpc_failed",
      reason: message
    });
  }
});
server.tool("get_external", {}, async () => {
  try {
    return format(await client.getJson("/meta/external"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("request_failed_404:")) {
      return format({
        error: "external_not_configured",
        hint: "This API instance does not publish external token metadata for its configured chainId."
      });
    }
    return format({
      error: "get_external_failed",
      reason: message
    });
  }
});
server.tool("get_diagnostics", {}, async () => format(await client.getJson("/meta/diagnostics")));
server.tool("get_agent_bootstrap", {}, async () => format(await client.getJson("/agent/bootstrap")));
server.tool(
  "build_tx_intent",
  {
    actor: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    action: z.record(z.string(), z.unknown())
  },
  async (args) => {
    const parsedAction = agentActionInputSchema.safeParse(args.action);
    if (!parsedAction.success) {
      return format({
        error: "invalid_action_payload",
        issues: parsedAction.error.issues
      });
    }
    try {
      return format(
        await client.postJson("/agent/tx-intent", {
          actor: args.actor,
          action: parsedAction.data
        })
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.startsWith("request_failed_401:")) {
        return format({
          error: "unauthorized",
          code: "API_KEY_REQUIRED",
          hint:
            "Set AGENT_API_KEY (or API_KEY) so MCP sends x-api-key. Check get_capabilities.auth.apiKeyRequired before relying on build_tx_intent.",
          requiredHeader: "x-api-key",
          baseUrl
        });
      }
      return format({
        error: "build_tx_intent_failed",
        reason: message
      });
    }
  }
);
server.tool("get_world_rules", {}, async () => format(await client.getJson("/agent/world-rules")));
server.tool(
  "list_my_characters",
  {
    owner: z.string().regex(/^0x[a-fA-F0-9]{40}$/)
  },
  async (args) => format(await client.getJson(`/agent/characters/${args.owner}`))
);
server.tool("get_commit_fee", {}, async () => format(await client.getJson("/agent/commit-fee")));
server.tool(
  "get_commit_window",
  { commitId: z.number().int().positive() },
  async (args) => format(await client.getJson(`/agent/commit-window/${args.commitId}`))
);
server.tool(
  "get_potion_balance",
  {
    characterId: z.number().int().positive(),
    potionType: z.number().int().min(0).max(2),
    potionTier: z.number().int().min(0).max(2)
  },
  async (args) =>
    format(await client.getJson(`/agent/potion-balance/${args.characterId}/${args.potionType}/${args.potionTier}`))
);
server.tool(
  "healthcheck_write_path",
  {},
  async () => format(await client.getJson("/agent/healthcheck-write-path"))
);
server.tool(
  "request_onboard_funds",
  {
    address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    idempotencyKey: z.string().min(1).max(128).optional()
  },
  async (args) => {
    try {
      return format(
        await client.postJson("/agent/onboard/fund", {
          address: args.address,
          idempotencyKey: args.idempotencyKey
        })
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.startsWith("request_failed_401:")) {
        return format({
          error: "unauthorized",
          code: "API_KEY_REQUIRED",
          requiredHeader: "x-api-key"
        });
      }
      if (message.startsWith("request_failed_429:")) {
        return format({
          error: "onboard_rate_limited",
          reason: message
        });
      }
      return format({
        error: "request_onboard_funds_failed",
        reason: message
      });
    }
  }
);
server.tool(
  "onboard_player",
  {
    address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    idempotencyKey: z.string().min(1).max(128).optional()
  },
  async (args) => {
    try {
      const rpcInfo = await client.getJson("/meta/rpc");
      const fundResult = await client.postJson("/agent/onboard/fund", {
        address: args.address,
        idempotencyKey: args.idempotencyKey
      });
      return format({
        rpc: rpcInfo,
        onboardResult: fundResult
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.startsWith("request_failed_401:")) {
        return format({
          error: "unauthorized",
          code: "API_KEY_REQUIRED",
          requiredHeader: "x-api-key"
        });
      }
      if (message.startsWith("request_failed_429:")) {
        return format({
          error: "onboard_rate_limited",
          reason: message
        });
      }
      return format({
        error: "onboard_player_failed",
        reason: message
      });
    }
  }
);
server.tool(
  "get_rewards",
  { windowEpochs: z.number().int().min(1).max(100).optional() },
  async (args) => {
    const params = new URLSearchParams();
    if (args.windowEpochs !== undefined) params.set("windowEpochs", String(args.windowEpochs));
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return format(await client.getJson(`/meta/rewards${suffix}`));
  }
);
server.tool(
  "quote_premium_purchase",
  {
    characterId: z.number().int().positive(),
    difficulty: z.number().int().min(0).max(4),
    amount: z.number().int().positive().max(65535),
    monPriceUsdHint: z.number().positive().optional()
  },
  async (args) => {
    const params = new URLSearchParams();
    params.set("characterId", String(args.characterId));
    params.set("difficulty", String(args.difficulty));
    params.set("amount", String(args.amount));
    if (args.monPriceUsdHint !== undefined) params.set("monPriceUsdHint", String(args.monPriceUsdHint));
    return format(await client.getJson(`/economy/quote-premium?${params.toString()}`));
  }
);
server.tool(
  "estimate_epoch_roi",
  {
    characterId: z.number().int().positive(),
    windowEpochs: z.number().int().min(1).max(100).optional(),
    pushCostWei: z.string().regex(/^\d+$/).optional()
  },
  async (args) => {
    const params = new URLSearchParams();
    if (args.windowEpochs !== undefined) params.set("windowEpochs", String(args.windowEpochs));
    if (args.pushCostWei !== undefined) params.set("pushCostWei", args.pushCostWei);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return format(await client.getJson(`/economy/estimate-epoch-roi/${args.characterId}${suffix}`));
  }
);
server.tool("list_playbook_sections", {}, async () => format(await client.getJson("/meta/playbook")));
server.tool(
  "get_playbook_section",
  { sectionId: z.string().min(1).max(64) },
  async (args) => format(await client.getJson(`/meta/playbook/${encodeURIComponent(args.sectionId)}`))
);

if (actionsEnabled) {
  server.tool(
    "preflight_action",
    {
      action: z.record(z.string(), z.unknown()),
      commitId: z.number().int().positive().optional()
    },
    async (args) => {
      const parsedAction = agentActionInputSchema.safeParse(args.action);
      if (!parsedAction.success) {
        return format({
          error: "invalid_action_payload",
          issues: parsedAction.error.issues
        });
      }

      const params = new URLSearchParams();
      if (args.commitId !== undefined) params.set("commitId", String(args.commitId));
      const suffix = params.toString() ? `?${params.toString()}` : "";
      return format(await client.postJson(`/agent/preflight${suffix}`, parsedAction.data as Record<string, unknown>));
    }
  );

  server.tool(
    "estimate_action_cost",
    {
      action: z.record(z.string(), z.unknown())
    },
    async (args) => {
      const parsedAction = agentActionInputSchema.safeParse(args.action);
      if (!parsedAction.success) {
        return format({
          error: "invalid_action_payload",
          issues: parsedAction.error.issues
        });
      }
      return format(await client.postJson("/agent/estimate-cost", parsedAction.data as Record<string, unknown>));
    }
  );

  server.tool(
    "get_valid_actions",
    {
      characterId: z.number().int().positive(),
      dungeonLevel: z.number().int().positive().optional(),
      difficulty: z.number().int().min(0).max(4).optional(),
      varianceMode: z.number().int().min(0).max(2).optional(),
      tier: z.number().int().positive().optional(),
      maxAmount: z.number().int().positive().max(65535).optional(),
      commitId: z.number().int().positive().optional()
    },
    async (args) => {
      const params = new URLSearchParams();
      if (args.dungeonLevel !== undefined) params.set("dungeonLevel", String(args.dungeonLevel));
      if (args.difficulty !== undefined) params.set("difficulty", String(args.difficulty));
      if (args.varianceMode !== undefined) params.set("varianceMode", String(args.varianceMode));
      if (args.tier !== undefined) params.set("tier", String(args.tier));
      if (args.maxAmount !== undefined) params.set("maxAmount", String(args.maxAmount));
      if (args.commitId !== undefined) params.set("commitId", String(args.commitId));
      const suffix = params.toString() ? `?${params.toString()}` : "";
      return format(await client.getJson(`/agent/valid-actions/${args.characterId}${suffix}`));
    }
  );

  server.tool(
    "create_character",
    {
      race: z.number().int().min(0).max(2),
      classType: z.number().int().min(0).max(2),
      name: z.string().min(1).max(48),
      ...actionCommonSchema.shape
    },
    async (args) =>
      format(
        await client.submitAction(
          { type: "create_character", race: args.race, classType: args.classType, name: args.name },
          { wait: args.wait, idempotencyKey: args.idempotencyKey }
        )
      )
  );

  server.tool(
    "start_dungeon",
    {
      characterId: z.number().int().positive(),
      difficulty: z.number().int().min(0).max(4),
      dungeonLevel: z.number().int().positive(),
      varianceMode: z.number().int().min(0).max(2).optional().default(1),
      ...actionCommonSchema.shape
    },
    async (args) =>
      format(
        await client.submitAction(
          { type: "start_dungeon", characterId: args.characterId, difficulty: args.difficulty, dungeonLevel: args.dungeonLevel, varianceMode: args.varianceMode },
          { wait: args.wait, idempotencyKey: args.idempotencyKey }
        )
      )
  );

  server.tool(
    "next_room",
    {
      characterId: z.number().int().positive(),
      potionChoice: z.number().int().min(0).max(3).optional(),
      abilityChoice: z.number().int().min(0).max(3).optional(),
      potionChoices: z.array(z.number().int().min(0).max(3)).optional(),
      abilityChoices: z.array(z.number().int().min(0).max(3)).optional(),
      ...actionCommonSchema.shape
    },
    async (args) =>
      format(
        await client.submitAction(
          {
            type: "next_room",
            characterId: args.characterId,
            potionChoice: args.potionChoice,
            abilityChoice: args.abilityChoice,
            potionChoices: args.potionChoices,
            abilityChoices: args.abilityChoices
          },
          { wait: args.wait, idempotencyKey: args.idempotencyKey }
        )
      )
  );

  server.tool(
    "open_lootboxes_max",
    {
      characterId: z.number().int().positive(),
      tier: z.number().int().positive(),
      maxAmount: z.number().int().positive().max(65535),
      varianceMode: z.number().int().min(0).max(2).optional().default(1),
      ...actionCommonSchema.shape
    },
    async (args) =>
      format(
        await client.submitAction(
          { type: "open_lootboxes_max", characterId: args.characterId, tier: args.tier, maxAmount: args.maxAmount, varianceMode: args.varianceMode },
          { wait: args.wait, idempotencyKey: args.idempotencyKey }
        )
      )
  );

  server.tool(
    "equip_best",
    {
      characterId: z.number().int().positive(),
      objective: z.enum(["balanced", "dps", "survivability"]).optional().default("balanced"),
      ...actionCommonSchema.shape
    },
    async (args) =>
      format(
        await client.submitAction(
          { type: "equip_best", characterId: args.characterId, objective: args.objective },
          { wait: args.wait, idempotencyKey: args.idempotencyKey }
        )
      )
  );

  server.tool(
    "reroll_item",
    {
      characterId: z.number().int().positive(),
      itemId: z.number().int().positive(),
      ...actionCommonSchema.shape
    },
    async (args) =>
      format(
        await client.submitAction(
          { type: "reroll_item", characterId: args.characterId, itemId: args.itemId },
          { wait: args.wait, idempotencyKey: args.idempotencyKey }
        )
      )
  );

  server.tool(
    "forge_set_piece",
    {
      characterId: z.number().int().positive(),
      itemId: z.number().int().positive(),
      targetSetId: z.number().int().min(1).max(255),
      ...actionCommonSchema.shape
    },
    async (args) =>
      format(
        await client.submitAction(
          { type: "forge_set_piece", characterId: args.characterId, itemId: args.itemId, targetSetId: args.targetSetId },
          { wait: args.wait, idempotencyKey: args.idempotencyKey }
        )
      )
  );

  server.tool(
    "buy_premium_lootboxes",
    {
      characterId: z.number().int().positive(),
      difficulty: z.number().int().min(0).max(4),
      amount: z.number().int().positive().max(65535),
      ...actionCommonSchema.shape
    },
    async (args) =>
      format(
        await client.submitAction(
          { type: "buy_premium_lootboxes", characterId: args.characterId, difficulty: args.difficulty, amount: args.amount },
          { wait: args.wait, idempotencyKey: args.idempotencyKey }
        )
      )
  );

  server.tool(
    "finalize_epoch",
    {
      epochId: z.number().int().min(0),
      ...actionCommonSchema.shape
    },
    async (args) =>
      format(
        await client.submitAction(
          { type: "finalize_epoch", epochId: args.epochId },
          { wait: args.wait, idempotencyKey: args.idempotencyKey }
        )
      )
  );

  server.tool(
    "claim_player",
    {
      epochId: z.number().int().min(0),
      characterId: z.number().int().positive(),
      ...actionCommonSchema.shape
    },
    async (args) =>
      format(
        await client.submitAction(
          { type: "claim_player", epochId: args.epochId, characterId: args.characterId },
          { wait: args.wait, idempotencyKey: args.idempotencyKey }
        )
      )
  );

  server.tool(
    "claim_deployer",
    {
      epochId: z.number().int().min(0),
      ...actionCommonSchema.shape
    },
    async (args) =>
      format(
        await client.submitAction(
          { type: "claim_deployer", epochId: args.epochId },
          { wait: args.wait, idempotencyKey: args.idempotencyKey }
        )
      )
  );

  server.tool(
    "create_trade_offer",
    {
      offeredItemIds: z.array(z.number().int().positive()).min(1).max(16),
      requestedItemIds: z.array(z.number().int().positive()).min(1).max(16),
      requestedMmo: z.string().regex(/^\d+$/),
      ...actionCommonSchema.shape
    },
    async (args) =>
      format(
        await client.submitAction(
          {
            type: "create_trade_offer",
            offeredItemIds: args.offeredItemIds,
            requestedItemIds: args.requestedItemIds,
            requestedMmo: args.requestedMmo
          },
          { wait: args.wait, idempotencyKey: args.idempotencyKey }
        )
      )
  );

  server.tool(
    "fulfill_trade_offer",
    {
      offerId: z.number().int().positive(),
      ...actionCommonSchema.shape
    },
    async (args) =>
      format(
        await client.submitAction(
          { type: "fulfill_trade_offer", offerId: args.offerId },
          { wait: args.wait, idempotencyKey: args.idempotencyKey }
        )
      )
  );

  server.tool(
    "cancel_trade_offer",
    {
      offerId: z.number().int().positive(),
      ...actionCommonSchema.shape
    },
    async (args) =>
      format(
        await client.submitAction(
          { type: "cancel_trade_offer", offerId: args.offerId },
          { wait: args.wait, idempotencyKey: args.idempotencyKey }
        )
      )
  );

  server.tool(
    "cancel_expired_trade_offer",
    {
      offerId: z.number().int().positive(),
      ...actionCommonSchema.shape
    },
    async (args) =>
      format(
        await client.submitAction(
          { type: "cancel_expired_trade_offer", offerId: args.offerId },
          { wait: args.wait, idempotencyKey: args.idempotencyKey }
        )
      )
  );

  server.tool(
    "create_rfq",
    {
      slot: z.number().int().min(0).max(7),
      minTier: z.number().int().min(0),
      acceptableSetMask: z.string().regex(/^\d+$/),
      mmoOffered: z.string().regex(/^\d+$/),
      expiry: z.number().int().min(0).optional(),
      ...actionCommonSchema.shape
    },
    async (args) =>
      format(
        await client.submitAction(
          {
            type: "create_rfq",
            slot: args.slot,
            minTier: args.minTier,
            acceptableSetMask: args.acceptableSetMask,
            mmoOffered: args.mmoOffered,
            expiry: args.expiry
          },
          { wait: args.wait, idempotencyKey: args.idempotencyKey }
        )
      )
  );

  server.tool(
    "fill_rfq",
    {
      rfqId: z.number().int().positive(),
      itemTokenId: z.number().int().positive(),
      ...actionCommonSchema.shape
    },
    async (args) =>
      format(
        await client.submitAction(
          { type: "fill_rfq", rfqId: args.rfqId, itemTokenId: args.itemTokenId },
          { wait: args.wait, idempotencyKey: args.idempotencyKey }
        )
      )
  );

  server.tool(
    "cancel_rfq",
    {
      rfqId: z.number().int().positive(),
      ...actionCommonSchema.shape
    },
    async (args) =>
      format(
        await client.submitAction(
          { type: "cancel_rfq", rfqId: args.rfqId },
          { wait: args.wait, idempotencyKey: args.idempotencyKey }
        )
      )
  );
}

server.tool(
  "get_agent_state",
  {
    characterId: z.number().int().positive(),
    sinceBlock: z.number().int().min(0).optional()
  },
  async (args) =>
    format(await client.getJson(`/agent/state/${args.characterId}${args.sinceBlock ? `?sinceBlock=${args.sinceBlock}` : ""}`))
);
server.tool(
  "get_session_state",
  {
    characterId: z.number().int().positive()
  },
  async (args) => format(await client.getJson(`/agent/session-state/${args.characterId}`))
);

server.tool(
  "get_leaderboard",
  {
    mode: z.enum(["live", "epoch"]).default("live"),
    epochId: z.number().int().min(0).optional(),
    limit: z.number().int().min(1).max(200).optional(),
    cursor: z.string().optional()
  },
  async (args) => {
    const params = new URLSearchParams();
    params.set("mode", args.mode);
    if (args.epochId !== undefined) params.set("epochId", String(args.epochId));
    if (args.limit !== undefined) params.set("limit", String(args.limit));
    if (args.cursor) params.set("cursor", args.cursor);
    return format(await client.getJson(`/leaderboard?${params.toString()}`));
  }
);

server.tool(
  "get_character_rank",
  {
    characterId: z.number().int().positive()
  },
  async (args) => format(await client.getJson(`/leaderboard/character/${args.characterId}`))
);

server.tool(
  "get_leaderboard_epoch",
  {
    epochId: z.number().int().min(0)
  },
  async (args) => format(await client.getJson(`/leaderboard/epochs/${args.epochId}`))
);

server.tool(
  "get_claimable_epochs",
  {
    characterId: z.number().int().positive()
  },
  async (args) => format(await client.getJson(`/leaderboard/claims/${args.characterId}`))
);

server.tool(
  "get_active_rfqs",
  {
    limit: z.number().int().min(1).max(200).optional(),
    activeOnly: z.boolean().optional().default(true),
    includeExpired: z.boolean().optional().default(false),
    slot: z.number().int().min(0).max(7).optional(),
    maxMinTier: z.number().int().min(0).optional(),
    targetSetId: z.number().int().min(0).max(255).optional(),
    maker: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional()
  },
  async (args) => {
    const params = new URLSearchParams();
    if (args.limit !== undefined) params.set("limit", String(args.limit));
    params.set("activeOnly", String(args.activeOnly));
    params.set("includeExpired", String(args.includeExpired));
    if (args.slot !== undefined) params.set("slot", String(args.slot));
    if (args.maxMinTier !== undefined) params.set("maxMinTier", String(args.maxMinTier));
    if (args.targetSetId !== undefined) params.set("targetSetId", String(args.targetSetId));
    if (args.maker) params.set("maker", args.maker);
    return format(await client.getJson(`/market/rfqs?${params.toString()}`));
  }
);

server.tool(
  "get_active_trade_offers",
  {
    limit: z.number().int().min(1).max(200).optional(),
    activeOnly: z.boolean().optional().default(true),
    maker: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional()
  },
  async (args) => {
    const params = new URLSearchParams();
    if (args.limit !== undefined) params.set("limit", String(args.limit));
    params.set("activeOnly", String(args.activeOnly));
    if (args.maker) params.set("maker", args.maker);
    return format(await client.getJson(`/market/trades?${params.toString()}`));
  }
);

server.tool(
  "get_trade_offer",
  {
    offerId: z.number().int().positive()
  },
  async (args) => format(await client.getJson(`/market/trades/${args.offerId}`))
);

function format(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value)
      }
    ]
  };
}

async function detectActionsEnabled(): Promise<boolean> {
  const forced = parseBoolean(process.env.MCP_ENABLE_ACTIONS);
  if (forced !== undefined) {
    return forced;
  }

  try {
    const health = (await client.getJson("/health")) as any;
    if (typeof health?.actionsEnabled === "boolean") {
      return health.actionsEnabled;
    }
  } catch {
    // ignore; default to enabling actions for backwards compatibility
  }
  return true;
}

function safeNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function safeInteger(value: string | undefined): number | undefined {
  const parsed = safeNumber(value);
  if (parsed === undefined || !Number.isInteger(parsed) || parsed < 0) {
    return undefined;
  }
  return parsed;
}

function parseOptionalBigInt(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const parsed = BigInt(value);
    if (parsed < 0n) {
      return undefined;
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (!value) {
    return undefined;
  }
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

const transport = new StdioServerTransport();
await server.connect(transport);
