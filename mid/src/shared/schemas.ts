import { z } from "zod";
import {
  abilityChoiceValues,
  classValues,
  difficultyValues,
  potionChoiceValues,
  raceValues,
  varianceModeValues
} from "./enums.js";

const varianceModeSchema = z.union([
  z.literal(varianceModeValues[0]),
  z.literal(varianceModeValues[1]),
  z.literal(varianceModeValues[2])
]);

const createCharacterActionSchema = z.object({
  type: z.literal("create_character"),
  race: z.union([z.literal(raceValues[0]), z.literal(raceValues[1]), z.literal(raceValues[2])]),
  classType: z.union([z.literal(classValues[0]), z.literal(classValues[1]), z.literal(classValues[2])]),
  name: z.string().min(1).max(48)
});

const startDungeonActionSchema = z.object({
  type: z.literal("start_dungeon"),
  characterId: z.number().int().positive(),
  difficulty: z.union([
    z.literal(difficultyValues[0]),
    z.literal(difficultyValues[1]),
    z.literal(difficultyValues[2]),
    z.literal(difficultyValues[3]),
    z.literal(difficultyValues[4])
  ]),
  dungeonLevel: z.number().int().positive(),
  varianceMode: varianceModeSchema.default(1)
});

const nextRoomActionSchema = z.object({
  type: z.literal("next_room"),
  characterId: z.number().int().positive(),
  potionChoice: z.union([
    z.literal(potionChoiceValues[0]),
    z.literal(potionChoiceValues[1]),
    z.literal(potionChoiceValues[2]),
    z.literal(potionChoiceValues[3])
  ]).optional(),
  abilityChoice: z.union([
    z.literal(abilityChoiceValues[0]),
    z.literal(abilityChoiceValues[1]),
    z.literal(abilityChoiceValues[2]),
    z.literal(abilityChoiceValues[3])
  ]).optional(),
  potionChoices: z.array(z.union([
    z.literal(potionChoiceValues[0]),
    z.literal(potionChoiceValues[1]),
    z.literal(potionChoiceValues[2]),
    z.literal(potionChoiceValues[3])
  ])).min(1).max(8).optional(),
  abilityChoices: z.array(z.union([
    z.literal(abilityChoiceValues[0]),
    z.literal(abilityChoiceValues[1]),
    z.literal(abilityChoiceValues[2]),
    z.literal(abilityChoiceValues[3])
  ])).min(1).max(8).optional()
}).superRefine((value, ctx) => {
  const singleProvided = typeof value.potionChoice === "number" || typeof value.abilityChoice === "number";
  const batchProvided = Array.isArray(value.potionChoices) || Array.isArray(value.abilityChoices);
  if (!singleProvided && !batchProvided) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "next_room requires single or batch choices" });
  }
  if (Array.isArray(value.potionChoices) !== Array.isArray(value.abilityChoices)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "batch choices must include potionChoices + abilityChoices" });
  }
  if (
    Array.isArray(value.potionChoices) &&
    Array.isArray(value.abilityChoices) &&
    value.potionChoices.length !== value.abilityChoices.length
  ) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "batch choices length mismatch" });
  }
});

const openLootboxesMaxActionSchema = z.object({
  type: z.literal("open_lootboxes_max"),
  characterId: z.number().int().positive(),
  tier: z.number().int().positive(),
  maxAmount: z.number().int().positive().max(65535),
  varianceMode: varianceModeSchema.default(1)
});

const equipBestActionSchema = z.object({
  type: z.literal("equip_best"),
  characterId: z.number().int().positive(),
  objective: z.enum(["balanced", "dps", "survivability"]).default("balanced")
});

const rerollItemActionSchema = z.object({
  type: z.literal("reroll_item"),
  characterId: z.number().int().positive(),
  itemId: z.number().int().positive()
});

const forgeSetPieceActionSchema = z.object({
  type: z.literal("forge_set_piece"),
  characterId: z.number().int().positive(),
  itemId: z.number().int().positive(),
  targetSetId: z.number().int().min(1).max(255)
});

const buyPremiumLootboxesActionSchema = z.object({
  type: z.literal("buy_premium_lootboxes"),
  characterId: z.number().int().positive(),
  difficulty: z.union([
    z.literal(difficultyValues[0]),
    z.literal(difficultyValues[1]),
    z.literal(difficultyValues[2]),
    z.literal(difficultyValues[3]),
    z.literal(difficultyValues[4])
  ]),
  amount: z.number().int().positive().max(65535)
});

const finalizeEpochActionSchema = z.object({
  type: z.literal("finalize_epoch"),
  epochId: z.number().int().min(0).max(4294967295)
});

const claimPlayerActionSchema = z.object({
  type: z.literal("claim_player"),
  epochId: z.number().int().min(0).max(4294967295),
  characterId: z.number().int().positive()
});

const claimDeployerActionSchema = z.object({
  type: z.literal("claim_deployer"),
  epochId: z.number().int().min(0).max(4294967295)
});

const createTradeOfferActionSchema = z.object({
  type: z.literal("create_trade_offer"),
  offeredItemIds: z.array(z.number().int().positive()).min(1).max(16),
  requestedItemIds: z.array(z.number().int().positive()).min(1).max(16),
  requestedMmo: z.string().regex(/^\d+$/)
}).superRefine((value, ctx) => {
  if (new Set(value.offeredItemIds).size !== value.offeredItemIds.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "offeredItemIds must be unique" });
  }
  if (new Set(value.requestedItemIds).size !== value.requestedItemIds.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "requestedItemIds must be unique" });
  }
});

const fulfillTradeOfferActionSchema = z.object({
  type: z.literal("fulfill_trade_offer"),
  offerId: z.number().int().positive()
});

const cancelTradeOfferActionSchema = z.object({
  type: z.literal("cancel_trade_offer"),
  offerId: z.number().int().positive()
});

const cancelExpiredTradeOfferActionSchema = z.object({
  type: z.literal("cancel_expired_trade_offer"),
  offerId: z.number().int().positive()
});

const createRfqActionSchema = z.object({
  type: z.literal("create_rfq"),
  slot: z.number().int().min(0).max(7),
  minTier: z.number().int().min(0),
  acceptableSetMask: z.string().regex(/^\d+$/),
  mmoOffered: z.string().regex(/^\d+$/),
  expiry: z.number().int().min(0).optional()
});

const fillRfqActionSchema = z.object({
  type: z.literal("fill_rfq"),
  rfqId: z.number().int().positive(),
  itemTokenId: z.number().int().positive()
});

const cancelRfqActionSchema = z.object({
  type: z.literal("cancel_rfq"),
  rfqId: z.number().int().positive()
});

export const agentActionInputSchema = z.discriminatedUnion("type", [
  createCharacterActionSchema,
  startDungeonActionSchema,
  nextRoomActionSchema,
  openLootboxesMaxActionSchema,
  equipBestActionSchema,
  rerollItemActionSchema,
  forgeSetPieceActionSchema,
  buyPremiumLootboxesActionSchema,
  finalizeEpochActionSchema,
  claimPlayerActionSchema,
  claimDeployerActionSchema,
  createTradeOfferActionSchema,
  fulfillTradeOfferActionSchema,
  cancelTradeOfferActionSchema,
  cancelExpiredTradeOfferActionSchema,
  createRfqActionSchema,
  fillRfqActionSchema,
  cancelRfqActionSchema
]);

export type AgentActionInput = z.infer<typeof agentActionInputSchema>;

export const paginationQuerySchema = z.object({
  limit: z.number().int().min(1).max(200).default(100),
  cursor: z.string().min(1).optional()
});

export const rfqListingQuerySchema = z.object({
  limit: z.number().int().min(1).max(200).default(100),
  activeOnly: z.boolean().default(true),
  includeExpired: z.boolean().default(false),
  slot: z.number().int().min(0).max(7).optional(),
  maxMinTier: z.number().int().min(0).optional(),
  targetSetId: z.number().int().min(0).max(255).optional(),
  maker: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional()
});

export const tradeListingQuerySchema = z.object({
  limit: z.number().int().min(1).max(200).default(100),
  activeOnly: z.boolean().default(true),
  maker: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional()
});

export const actionResultSchema = z.object({
  actionId: z.string().uuid(),
  status: z.enum(["queued", "running", "succeeded", "failed"]),
  code: z.string(),
  txHashes: z.array(z.string()),
  deltaEvents: z.array(
    z.object({
      blockNumber: z.number().int().nonnegative(),
      txHash: z.string(),
      kind: z.string(),
      payload: z.record(z.string(), z.unknown())
    })
  )
});

export type ActionResult = z.infer<typeof actionResultSchema>;
