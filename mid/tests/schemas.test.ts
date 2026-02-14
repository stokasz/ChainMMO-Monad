import { describe, expect, it } from "vitest";
import { agentActionInputSchema, rfqListingQuerySchema } from "../src/shared/schemas.js";

describe("agent action schema", () => {
  it("accepts open_lootboxes_max payload", () => {
    const parsed = agentActionInputSchema.parse({
      type: "open_lootboxes_max",
      characterId: 7,
      tier: 12,
      maxAmount: 50,
      varianceMode: 1
    });

    expect(parsed.type).toBe("open_lootboxes_max");
  });

  it("rejects invalid action payload", () => {
    expect(() =>
      agentActionInputSchema.parse({
        type: "open_lootboxes_max",
        characterId: 7,
        tier: 12,
        maxAmount: 0,
        varianceMode: 99
      })
    ).toThrow();
  });

  it("accepts forge_set_piece payload", () => {
    const parsed = agentActionInputSchema.parse({
      type: "forge_set_piece",
      characterId: 7,
      itemId: 123,
      targetSetId: 4
    });

    expect(parsed.type).toBe("forge_set_piece");
  });

  it("accepts buy_premium_lootboxes payload", () => {
    const parsed = agentActionInputSchema.parse({
      type: "buy_premium_lootboxes",
      characterId: 7,
      difficulty: 2,
      amount: 3
    });

    expect(parsed.type).toBe("buy_premium_lootboxes");
  });

  it("accepts reward settlement payloads", () => {
    const finalize = agentActionInputSchema.parse({
      type: "finalize_epoch",
      epochId: 12
    });
    const claimPlayer = agentActionInputSchema.parse({
      type: "claim_player",
      epochId: 12,
      characterId: 7
    });
    const claimDeployer = agentActionInputSchema.parse({
      type: "claim_deployer",
      epochId: 12
    });

    expect(finalize.type).toBe("finalize_epoch");
    expect(claimPlayer.type).toBe("claim_player");
    expect(claimDeployer.type).toBe("claim_deployer");
  });

  it("accepts trade escrow payloads", () => {
    const create = agentActionInputSchema.parse({
      type: "create_trade_offer",
      offeredItemIds: [11, 22],
      requestedItemIds: [33],
      requestedMmo: "0"
    });
    const fulfill = agentActionInputSchema.parse({
      type: "fulfill_trade_offer",
      offerId: 9
    });
    const cancel = agentActionInputSchema.parse({
      type: "cancel_trade_offer",
      offerId: 9
    });
    const cancelExpired = agentActionInputSchema.parse({
      type: "cancel_expired_trade_offer",
      offerId: 9
    });

    expect(create.type).toBe("create_trade_offer");
    expect(fulfill.type).toBe("fulfill_trade_offer");
    expect(cancel.type).toBe("cancel_trade_offer");
    expect(cancelExpired.type).toBe("cancel_expired_trade_offer");
  });

  it("rejects forge_set_piece with out-of-range set id", () => {
    expect(() =>
      agentActionInputSchema.parse({
        type: "forge_set_piece",
        characterId: 7,
        itemId: 123,
        targetSetId: 0
      })
    ).toThrow();
  });

  it("rejects buy_premium_lootboxes with invalid amount", () => {
    expect(() =>
      agentActionInputSchema.parse({
        type: "buy_premium_lootboxes",
        characterId: 7,
        difficulty: 1,
        amount: 0
      })
    ).toThrow();
  });

  it("rejects claim_player with invalid epoch id", () => {
    expect(() =>
      agentActionInputSchema.parse({
        type: "claim_player",
        epochId: -1,
        characterId: 7
      })
    ).toThrow();
  });

  it("rejects create_trade_offer with empty offered items", () => {
    expect(() =>
      agentActionInputSchema.parse({
        type: "create_trade_offer",
        offeredItemIds: [],
        requestedItemIds: [1],
        requestedMmo: "0"
      })
    ).toThrow();
  });

  it("applies defaults for rfq listing query", () => {
    const parsed = rfqListingQuerySchema.parse({});
    expect(parsed.limit).toBe(100);
    expect(parsed.activeOnly).toBe(true);
    expect(parsed.includeExpired).toBe(false);
  });

  it("rejects rfq listing query with invalid target set id", () => {
    expect(() =>
      rfqListingQuerySchema.parse({
        targetSetId: 256
      })
    ).toThrow();
  });
});
