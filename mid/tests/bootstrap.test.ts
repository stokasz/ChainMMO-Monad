import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { AgentReadModel } from "../src/agent-api/read-model.js";

const env = {
  CHAIN_ID: 10143,
  GAMEWORLD_ADDRESS: "0x0000000000000000000000000000000000000001",
  FEEVAULT_ADDRESS: "0x0000000000000000000000000000000000000002",
  ITEMS_ADDRESS: "0x0000000000000000000000000000000000000003",
  MMO_ADDRESS: "0x0000000000000000000000000000000000000004",
  TRADE_ESCROW_ADDRESS: "0x0000000000000000000000000000000000000005",
  RFQ_MARKET_ADDRESS: "0x0000000000000000000000000000000000000006",
  MMODISTRIBUTOR_ADDRESS: "0x0000000000000000000000000000000000000007",
  X_PROFILE_URL: "https://x.com/stokasz"
} as any;

describe("agent bootstrap", () => {
  it("returns self-sufficient bootstrap payload for blind agents", async () => {
    const chain = {
      readGameWorld: vi.fn(async (functionName: string) => {
        if (functionName === "commitFee") return 1_000_000_000_000_000n;
        throw new Error(`unexpected_read:${functionName}`);
      }),
      readRfq: vi.fn(async (functionName: string) => {
        if (functionName === "createFee") return 10_000_000_000_000_000n;
        throw new Error(`unexpected_read:${functionName}`);
      })
    } as any;

    const readModel = new AgentReadModel(env, {} as any, chain);
    const bootstrap = await readModel.getAgentBootstrap();

    expect(bootstrap).toMatchObject({
      chainId: 10143,
      commitReveal: {
        revealWindowBlocks: {
          startOffset: 2,
          endOffset: 256
        }
      }
    });
    expect((bootstrap as any).payableFees.commitFeeWei).toBe("1000000000000000");
    expect((bootstrap as any).safeLoop).toContain("get_valid_actions");
    expect((bootstrap as any).safeLoop).toContain("preflight_action");
    expect((bootstrap as any).safeLoop).toContain("estimate_action_cost");

    // Agents using cast must not guess ABI signatures (selectors). These should be provided explicitly.
    expect((bootstrap as any).castSignatures?.gameWorld?.send?.commitActionWithVariance).toBe(
      "commitActionWithVariance(uint256,uint8,bytes32,uint64,uint8)"
    );
    expect((bootstrap as any).castSignatures?.gameWorld?.call?.hashLootboxOpen).toBe(
      "hashLootboxOpen(bytes32,address,uint256,uint64,uint32,uint16,uint8,bool)(bytes32)"
    );
    expect((bootstrap as any).castSignatures?.gameWorld?.call?.hashDungeonRun).toBe(
      "hashDungeonRun(bytes32,address,uint256,uint64,uint8,uint32,uint8)(bytes32)"
    );
  });

  it("includes external token info when configured for the chain", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "chainmmo-external-"));
    const filePath = path.join(dir, "external.tokens.latest.json");
	    await writeFile(
	      filePath,
	      JSON.stringify({
	        chainId: 143,
	        mmo: {
	          tokenAddress: "0x1111111111111111111111111111111111111111",
	          poolAddress: "0x2222222222222222222222222222222222222222",
	          source: "nad.fun",
	          url: "https://nad.fun/tokens/0x1111111111111111111111111111111111111111"
	        }
	      }),
	      "utf8"
	    );

    const chain = {
      readGameWorld: vi.fn(async (functionName: string) => {
        if (functionName === "commitFee") return 1_000_000_000_000_000n;
        throw new Error(`unexpected_read:${functionName}`);
      }),
      readRfq: vi.fn(async (functionName: string) => {
        if (functionName === "createFee") return 10_000_000_000_000_000n;
        throw new Error(`unexpected_read:${functionName}`);
      })
    } as any;

    const readModel = new AgentReadModel(
      {
        ...env,
        CHAIN_ID: 143,
        EXTERNAL_TOKENS_JSON_PATH: filePath
      } as any,
      {} as any,
      chain
    );
	    const bootstrap = await readModel.getAgentBootstrap();
	    expect(bootstrap.chainId).toBe(143);
	    expect((bootstrap as any).external).toEqual({
	      mmo: {
	        tokenAddress: "0x1111111111111111111111111111111111111111",
	        poolAddress: "0x2222222222222222222222222222222222222222",
	        source: "nad.fun",
	        url: "https://nad.fun/tokens/0x1111111111111111111111111111111111111111"
	      }
	    });
	  });
});
