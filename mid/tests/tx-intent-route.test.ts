import { describe, expect, it, vi } from "vitest";
import { buildApiServer } from "../src/agent-api/server.js";

describe("POST /agent/tx-intent", () => {
  it("builds tx intents for valid actor/action payload", async () => {
    const builder = {
      build: vi.fn(async () => ({
        actor: "0x1111111111111111111111111111111111111111",
        actionType: "create_character",
        intents: []
      }))
    } as any;

    const app = await buildApiServer({
      env: {} as any,
      metrics: {} as any,
      readModel: {} as any,
      actionTxIntentBuilder: builder
    });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/agent/tx-intent",
        payload: {
          actor: "0x1111111111111111111111111111111111111111",
          action: {
            type: "create_character",
            race: 0,
            classType: 0,
            name: "Ada"
          }
        }
      });
      expect(response.statusCode).toBe(200);
      expect(builder.build).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: "0x1111111111111111111111111111111111111111",
          action: expect.objectContaining({ type: "create_character" })
        })
      );
    } finally {
      await app.close();
    }
  });

  it("rejects invalid actor and action payloads", async () => {
    const app = await buildApiServer({
      env: {} as any,
      metrics: {} as any,
      readModel: {} as any,
      actionTxIntentBuilder: { build: vi.fn(async () => ({})) } as any
    });

    try {
      const badActor = await app.inject({
        method: "POST",
        url: "/agent/tx-intent",
        payload: {
          actor: "not-an-address",
          action: {
            type: "create_character",
            race: 0,
            classType: 0,
            name: "Ada"
          }
        }
      });
      expect(badActor.statusCode).toBe(400);

      const badAction = await app.inject({
        method: "POST",
        url: "/agent/tx-intent",
        payload: {
          actor: "0x1111111111111111111111111111111111111111",
          action: {
            type: "open_lootboxes_max",
            characterId: 7,
            tier: 1,
            maxAmount: 0
          }
        }
      });
      expect(badAction.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });
});
