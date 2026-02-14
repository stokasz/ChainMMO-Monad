import { describe, expect, it, vi } from "vitest";
import type { Hex } from "viem";
import { ActionEngine } from "../src/action-engine/engine.js";

const OWNER = "0x1111111111111111111111111111111111111111" as Hex;
const TX = `0x${"4".repeat(64)}` as Hex;

function buildChain() {
  return {
    account: { address: OWNER },
    readGameWorld: vi.fn(async (functionName: string) => {
      if (functionName === "ownerOfCharacter") return OWNER;
      throw new Error(`unexpected_read_gameworld:${functionName}`);
    }),
    writeFeeVault: vi.fn(async () => TX),
    waitForReceipt: vi.fn(async (hash: Hex) => ({
      blockNumber: 100n,
      logs: [],
      transactionHash: hash
    })),
    decodeLog: vi.fn(() => undefined)
  } as any;
}

describe("action engine reward settlement", () => {
  it("submits finalize_epoch via fee vault", async () => {
    const chain = buildChain();
    const engine = new ActionEngine(chain);
    const result = await engine.execute({ type: "finalize_epoch", epochId: 9 } as any);

    expect(result.code).toBe("EPOCH_FINALIZED");
    expect(chain.writeFeeVault).toHaveBeenCalledWith("finalizeEpoch", [9]);
  });

  it("submits claim_player after owner check", async () => {
    const chain = buildChain();
    const engine = new ActionEngine(chain);
    const result = await engine.execute({ type: "claim_player", epochId: 9, characterId: 7 } as any);

    expect(result.code).toBe("PLAYER_REWARD_CLAIMED");
    expect(chain.readGameWorld).toHaveBeenCalledWith("ownerOfCharacter", [7n]);
    expect(chain.writeFeeVault).toHaveBeenCalledWith("claimPlayer", [9, 7n]);
  });

  it("blocks claim_deployer unless explicitly enabled", async () => {
    const chain = buildChain();
    const engine = new ActionEngine(chain);

    await expect(engine.execute({ type: "claim_deployer", epochId: 9 } as any)).rejects.toThrow(
      "PolicyDeployerClaimDisabled"
    );
    expect(chain.writeFeeVault).not.toHaveBeenCalled();
  });

  it("allows claim_deployer when policy flag is enabled", async () => {
    const chain = buildChain();
    const engine = new ActionEngine(chain, { allowDeployerClaims: true });
    const result = await engine.execute({ type: "claim_deployer", epochId: 9 } as any);

    expect(result.code).toBe("DEPLOYER_REWARD_CLAIMED");
    expect(chain.writeFeeVault).toHaveBeenCalledWith("claimDeployer", [9]);
  });
});
