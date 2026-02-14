import { describe, expect, it, vi } from "vitest";
import type { Hex } from "viem";
import { ActionTxIntentBuilder } from "../src/action-engine/tx-intents.js";

const ACTOR = "0x1111111111111111111111111111111111111111" as Hex;

function baseChain() {
  return {
    addresses: {
      gameWorld: "0x0000000000000000000000000000000000000001",
      feeVault: "0x0000000000000000000000000000000000000002",
      items: "0x0000000000000000000000000000000000000003",
      mmo: "0x0000000000000000000000000000000000000004",
      tradeEscrow: "0x0000000000000000000000000000000000000005",
      rfqMarket: "0x0000000000000000000000000000000000000006"
    },
    publicClient: {
      estimateContractGas: vi.fn(async () => 123n)
    },
    readGameWorld: vi.fn(async () => {
      throw new Error("unexpected_read_gameworld");
    }),
    readFeeVault: vi.fn(async () => {
      throw new Error("unexpected_read_feevault");
    }),
    readItems: vi.fn(async () => {
      throw new Error("unexpected_read_items");
    }),
    readItemsApprovalForAll: vi.fn(async () => true),
    readMmoAllowance: vi.fn(async () => 0n),
    readTradeEscrow: vi.fn(async () => {
      throw new Error("unexpected_read_trade");
    }),
    readRfq: vi.fn(async () => {
      throw new Error("unexpected_read_rfq");
    })
  } as any;
}

describe("tx intent builder", () => {
  it("builds a simulated create_character unsigned tx intent", async () => {
    const chain = baseChain();
    const builder = new ActionTxIntentBuilder(chain, 10143);

    const plan = await builder.build({
      actor: ACTOR,
      action: {
        type: "create_character",
        race: 0,
        classType: 0,
        name: "Ada"
      }
    });

    expect(plan.actionType).toBe("create_character");
    expect(plan.intents).toHaveLength(1);
    expect(plan.intents[0]).toMatchObject({
      label: "create_character",
      to: chain.addresses.gameWorld,
      valueWei: "0",
      chainId: 10143
    });
    expect(plan.intents[0].data.startsWith("0x")).toBe(true);
    expect(plan.intents[0].simulation).toMatchObject({
      willSucceed: true,
      code: "SIMULATION_OK",
      estimatedGas: "123"
    });
  });

  it("builds start_dungeon commit intent with commit metadata", async () => {
    const chain = baseChain();
    chain.readGameWorld = vi.fn(async (functionName: string) => {
      if (functionName === "ownerOfCharacter") return ACTOR;
      if (functionName === "commitFee") return 7n;
      if (functionName === "hashDungeonRun") return `0x${"9".repeat(64)}`;
      throw new Error(`unexpected_read_gameworld:${functionName}`);
    });

    const builder = new ActionTxIntentBuilder(chain, 10143);
    const plan = await builder.build({
      actor: ACTOR,
      action: {
        type: "start_dungeon",
        characterId: 7,
        difficulty: 1,
        dungeonLevel: 3,
        varianceMode: 1
      }
    });

    expect(plan.intents).toHaveLength(1);
    expect(plan.intents[0]).toMatchObject({
      label: "commit_start_dungeon",
      valueWei: "7"
    });
    expect(typeof plan.metadata?.commitSecret).toBe("string");
    expect(typeof plan.metadata?.commitNonce).toBe("string");
  });
});
