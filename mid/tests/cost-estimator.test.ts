import { describe, expect, it, vi } from "vitest";
import type { Hex } from "viem";
import { ActionCostEstimator } from "../src/action-engine/cost-estimator.js";

const OWNER = "0x1111111111111111111111111111111111111111" as Hex;

function createEstimator(overrides: {
  commitFee?: bigint;
  premiumEthCost?: bigint;
  premiumMmoCost?: bigint;
  tradeCreateFee?: bigint;
  gasEstimate?: bigint;
  feeVaultGasEstimate?: bigint;
  tradeGasEstimate?: bigint;
  gasEstimateError?: Error;
  maxFeePerGas?: bigint;
  signerBalance?: bigint;
}) {
  const chain = {
    account: { address: OWNER },
    getFeeEstimate: vi.fn(async () => ({
      maxFeePerGas: overrides.maxFeePerGas ?? 100n,
      source: "eip1559" as const
    })),
    getNativeBalance: vi.fn(async () => overrides.signerBalance ?? 1_000_000n),
    readGameWorld: vi.fn(async (functionName: string) => {
      if (functionName === "commitFee") return overrides.commitFee ?? 7n;
      if (functionName === "hashDungeonRun") return `0x${"1".repeat(64)}` as Hex;
      throw new Error(`unexpected_read:${functionName}`);
    }),
    readFeeVault: vi.fn(async (functionName: string) => {
      if (functionName === "quotePremiumPurchase") {
        return [overrides.premiumEthCost ?? 33n, overrides.premiumMmoCost ?? 0n] as const;
      }
      throw new Error(`unexpected_read_feevault:${functionName}`);
    }),
    readTradeEscrow: vi.fn(async (functionName: string) => {
      if (functionName === "createFee") return overrides.tradeCreateFee ?? 11n;
      throw new Error(`unexpected_read_trade:${functionName}`);
    }),
    estimateGameWorldGas: vi.fn(async () => {
      if (overrides.gasEstimateError) throw overrides.gasEstimateError;
      return overrides.gasEstimate ?? 25_000n;
    }),
    estimateFeeVaultGas: vi.fn(async () => overrides.feeVaultGasEstimate ?? 19_000n),
    estimateTradeEscrowGas: vi.fn(async () => overrides.tradeGasEstimate ?? 22_000n),
    readRfq: vi.fn(async () => 0n),
    estimateRfqGas: vi.fn(async () => 15_000n)
  } as any;

  return new ActionCostEstimator(chain);
}

describe("action cost estimator", () => {
  it("computes cost and affordability for start_dungeon", async () => {
    const estimator = createEstimator({
      commitFee: 9n,
      gasEstimate: 20_000n,
      maxFeePerGas: 100n,
      signerBalance: 3_000_000n
    });

    const estimate = await estimator.estimate({
      type: "start_dungeon",
      characterId: 7,
      difficulty: 0,
      dungeonLevel: 1,
      varianceMode: 1
    });

    expect(estimate.code).toBe("ESTIMATE_OK");
    expect(estimate.estimatedGas).toBe("20000");
    expect(estimate.requiredValueWei).toBe("9");
    expect(estimate.estimatedTxCostWei).toBe("2000000");
    expect(estimate.totalEstimatedCostWei).toBe("2000009");
    expect(estimate.canAfford).toBe(true);
  });

  it("falls back with deterministic code/reason when estimate fails", async () => {
    const estimator = createEstimator({
      commitFee: 5n,
      gasEstimateError: new Error("Execution reverted: RunAlreadyActive()"),
      maxFeePerGas: 200n,
      signerBalance: 1_000_000n
    });

    const estimate = await estimator.estimate({
      type: "start_dungeon",
      characterId: 7,
      difficulty: 0,
      dungeonLevel: 20,
      varianceMode: 1
    });

    expect(estimate.code).toBe("ESTIMATE_FALLBACK");
    expect(estimate.reason).toContain("PRECHECK_RUN_ALREADY_ACTIVE");
    expect(estimate.estimatedGas).toBe("250000");
    expect(estimate.requiredValueWei).toBe("5");
    expect(estimate.canAfford).toBe(false);
  });

  it("includes premium payable value when estimating buy_premium_lootboxes", async () => {
    const estimator = createEstimator({
      premiumEthCost: 333n,
      feeVaultGasEstimate: 50_000n,
      maxFeePerGas: 10n,
      signerBalance: 1_000_000n
    });

    const estimate = await estimator.estimate({
      type: "buy_premium_lootboxes",
      characterId: 7,
      difficulty: 1,
      amount: 2
    } as any);

    expect(estimate.code).toBe("ESTIMATE_OK");
    expect(estimate.requiredValueWei).toBe("333");
    expect(estimate.estimatedGas).toBe("50000");
    expect(estimate.totalEstimatedCostWei).toBe("500333");
    expect(estimate.canAfford).toBe(true);
  });

  it("estimates claim_player via fee vault path with zero required value", async () => {
    const estimator = createEstimator({
      feeVaultGasEstimate: 21_000n,
      maxFeePerGas: 11n,
      signerBalance: 500_000n
    });

    const estimate = await estimator.estimate({
      type: "claim_player",
      epochId: 3,
      characterId: 7
    } as any);

    expect(estimate.code).toBe("ESTIMATE_OK");
    expect(estimate.requiredValueWei).toBe("0");
    expect(estimate.estimatedGas).toBe("21000");
    expect(estimate.totalEstimatedCostWei).toBe("231000");
  });

  it("includes createFee when estimating create_trade_offer", async () => {
    const estimator = createEstimator({
      tradeCreateFee: 77n,
      tradeGasEstimate: 20_000n,
      maxFeePerGas: 10n,
      signerBalance: 1_000_000n
    });

    const estimate = await estimator.estimate({
      type: "create_trade_offer",
      offeredItemIds: [11, 22],
      requestedItemIds: [33],
      requestedMmo: "0"
    } as any);

    expect(estimate.code).toBe("ESTIMATE_OK");
    expect(estimate.requiredValueWei).toBe("77");
    expect(estimate.estimatedGas).toBe("20000");
    expect(estimate.totalEstimatedCostWei).toBe("200077");
  });
});
