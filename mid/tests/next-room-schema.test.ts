import { describe, expect, it } from "vitest";
import { agentActionInputSchema } from "../src/shared/schemas.js";

describe("next_room schema", () => {
  it("rejects mismatched batch lengths", () => {
    expect(() =>
      agentActionInputSchema.parse({
        type: "next_room",
        characterId: 1,
        potionChoices: [0, 1],
        abilityChoices: [0]
      })
    ).toThrow();
  });

  it("accepts single-step payload", () => {
    const parsed = agentActionInputSchema.parse({
      type: "next_room",
      characterId: 1,
      potionChoice: 0,
      abilityChoice: 0
    });

    expect(parsed.type).toBe("next_room");
  });
});
