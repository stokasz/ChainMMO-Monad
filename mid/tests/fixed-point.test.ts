import { describe, expect, it } from "vitest";
import { WAD, feeVaultWeightForDelta, rpow } from "../src/shared/fixed-point.js";

describe("fixed-point", () => {
  it("rpow follows expected identity rules", () => {
    expect(rpow(0n, 0n, WAD)).toBe(WAD);
    expect(rpow(0n, 1n, WAD)).toBe(0n);
    expect(rpow(123n, 0n, WAD)).toBe(WAD);
    expect(rpow(WAD, 1n, WAD)).toBe(WAD);
  });

  it("feeVaultWeightForDelta matches 1.1^delta (WAD scaled) and clamps", () => {
    expect(feeVaultWeightForDelta(0)).toBe(1_000_000_000_000_000_000n);
    expect(feeVaultWeightForDelta(1)).toBe(1_100_000_000_000_000_000n);
    expect(feeVaultWeightForDelta(2)).toBe(1_210_000_000_000_000_000n);
    expect(feeVaultWeightForDelta(3)).toBe(1_331_000_000_000_000_000n);

    // Clamp / sanitize.
    expect(feeVaultWeightForDelta(-5)).toBe(WAD);
    expect(feeVaultWeightForDelta(999)).toBe(feeVaultWeightForDelta(256));
    expect(feeVaultWeightForDelta(256.9)).toBe(feeVaultWeightForDelta(256));
  });
});

