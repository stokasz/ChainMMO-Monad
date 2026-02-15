import { describe, expect, it, vi } from "vitest";
import { decodeFunctionData, type Hex } from "viem";
import { ActionTxIntentBuilder } from "../src/action-engine/tx-intents.js";
import { gameWorldAbi } from "../src/contracts/abi.js";

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

  it("equip_best excludes items equipped on other characters for shared-wallet safety", async () => {
    const chain = baseChain();

    chain.readGameWorld = vi.fn(async (functionName: string, args?: unknown[]) => {
      if (functionName === "ownerOfCharacter") return ACTOR;
      if (functionName === "characterBestLevel") return 1;
      if (functionName === "equippedLocationByItemId") {
        const itemId = (args as [bigint])[0];
        if (itemId === 100n) return (2n << 8n) | 1n; // equipped on another character, same slot
        if (itemId === 101n) return 0n;
        throw new Error(`unexpected_itemId:${itemId.toString()}`);
      }
      throw new Error(`unexpected_read_gameworld:${functionName}`);
    });

    chain.readItems = vi.fn(async (functionName: string, args?: unknown[]) => {
      if (functionName === "balanceOf") return 2n;
      if (functionName === "tokenOfOwnerByIndex") {
        const index = (args as [Hex, bigint])[1];
        return index === 0n ? 100n : 101n;
      }
      if (functionName === "decode") {
        return [1, 2, 0n]; // slot=1, tier=2, seed
      }
      if (functionName === "deriveBonuses") {
        const itemId = (args as [bigint])[0];
        if (itemId === 100n) return [0, 0, 0, 10, 0]; // would be best, but is equipped elsewhere
        if (itemId === 101n) return [0, 0, 0, 2, 0];
      }
      throw new Error(`unexpected_read_items:${functionName}`);
    });

    const builder = new ActionTxIntentBuilder(chain, 10143);
    const plan = await builder.build({
      actor: ACTOR,
      action: {
        type: "equip_best",
        characterId: 3,
        objective: "dps"
      }
    });

    expect(plan.intents).toHaveLength(1);
    expect(plan.intents[0].label).toBe("equip_items");

    const decoded = decodeFunctionData({ abi: gameWorldAbi, data: plan.intents[0].data });
    expect(decoded.functionName).toBe("equipItems");
    const [cid, itemIds] = decoded.args as unknown as [bigint, bigint[]];
    expect(cid).toBe(3n);
    expect(itemIds).toEqual([101n]);
  });

  it("equip_best allows items already equipped on the target character (idempotent equip)", async () => {
    const chain = baseChain();

    chain.readGameWorld = vi.fn(async (functionName: string, args?: unknown[]) => {
      if (functionName === "ownerOfCharacter") return ACTOR;
      if (functionName === "characterBestLevel") return 1;
      if (functionName === "equippedLocationByItemId") {
        const itemId = (args as [bigint])[0];
        if (itemId === 200n) return (3n << 8n) | 1n; // already equipped on target character, correct slot
        if (itemId === 201n) return 0n;
        throw new Error(`unexpected_itemId:${itemId.toString()}`);
      }
      throw new Error(`unexpected_read_gameworld:${functionName}`);
    });

    chain.readItems = vi.fn(async (functionName: string, args?: unknown[]) => {
      if (functionName === "balanceOf") return 2n;
      if (functionName === "tokenOfOwnerByIndex") {
        const index = (args as [Hex, bigint])[1];
        return index === 0n ? 200n : 201n;
      }
      if (functionName === "decode") {
        return [1, 2, 0n];
      }
      if (functionName === "deriveBonuses") {
        const itemId = (args as [bigint])[0];
        if (itemId === 200n) return [0, 0, 0, 10, 0];
        if (itemId === 201n) return [0, 0, 0, 2, 0];
      }
      throw new Error(`unexpected_read_items:${functionName}`);
    });

    const builder = new ActionTxIntentBuilder(chain, 10143);
    const plan = await builder.build({
      actor: ACTOR,
      action: {
        type: "equip_best",
        characterId: 3,
        objective: "dps"
      }
    });

    const decoded = decodeFunctionData({ abi: gameWorldAbi, data: plan.intents[0].data });
    const [, itemIds] = decoded.args as unknown as [bigint, bigint[]];
    expect(itemIds).toEqual([200n]);
  });
});
