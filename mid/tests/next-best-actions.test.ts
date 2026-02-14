import { describe, expect, it } from "vitest";
import { buildNextBestActions } from "../src/agent-api/read-model.js";

describe("nextBestActions", () => {
  it("recommends RFQ scanning when matching set pieces are missing", () => {
    const actions = buildNextBestActions({
      runActive: false,
      lootboxCredits: [],
      equippedCount: 8,
      equippedSlotCount: 8,
      requiredEquippedSlots: 8,
      upgradeStones: 0,
      missingMatchingSetPieces: 2,
      claimableEpochsCount: 0
    });

    expect(actions.some((action) => action.actionType === "get_active_rfqs")).toBe(true);
  });

  it("does not recommend RFQ scanning when no matching set deficit exists", () => {
    const actions = buildNextBestActions({
      runActive: false,
      lootboxCredits: [],
      equippedCount: 8,
      equippedSlotCount: 8,
      requiredEquippedSlots: 8,
      upgradeStones: 0,
      missingMatchingSetPieces: 0,
      claimableEpochsCount: 0
    });

    expect(actions.some((action) => action.actionType === "get_active_rfqs")).toBe(false);
  });
});
