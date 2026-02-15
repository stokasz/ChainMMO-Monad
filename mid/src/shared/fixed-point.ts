export const WAD = 1_000_000_000_000_000_000n;

// Port of Solady FixedPointMathLib.rpow (round-to-nearest, exponentiation by squaring).
export function rpow(x: bigint, y: bigint, b: bigint): bigint {
  if (y === 0n) {
    return b; // 0**0 = 1 (scaled), otherwise x**0 = 1 (scaled)
  }
  if (x === 0n) {
    return 0n; // 0**n = 0 for n>0
  }

  let z = (y & 1n) === 0n ? b : x;
  const half = b / 2n;
  let n = y >> 1n;

  while (n > 0n) {
    x = (x * x + half) / b;
    if ((n & 1n) === 1n) {
      z = (z * x + half) / b;
    }
    n >>= 1n;
  }

  return z;
}

// Mirrors FeeVault._weightForDelta() and GameConstants (WEIGHT_BASE_WAD=1.1e18; WEIGHT_CLAMP=256).
const WEIGHT_BASE_WAD = 1_100_000_000_000_000_000n;
const WEIGHT_CLAMP = 256;

export function feeVaultWeightForDelta(delta: number): bigint {
  const clamped = Math.min(Math.max(0, Math.trunc(delta)), WEIGHT_CLAMP);
  return rpow(WEIGHT_BASE_WAD, BigInt(clamped), WAD);
}

