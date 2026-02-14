export function formatNative(weiString: string): string {
  try {
    const wei = BigInt(weiString);
    const sign = wei < 0n ? "-" : "";
    const abs = wei < 0n ? -wei : wei;
    let whole = abs / 1_000_000_000_000_000_000n;
    const frac = abs % 1_000_000_000_000_000_000n;

    // Round to 4 decimals (0.0001 MON = 1e14 wei).
    const fracDivisor = 100_000_000_000_000n;
    let fracRounded = (frac + fracDivisor / 2n) / fracDivisor;
    if (fracRounded >= 10_000n) {
      whole += 1n;
      fracRounded = 0n;
    }

    const fracStr = fracRounded.toString().padStart(4, "0");
    return `${sign}${whole.toString()}.${fracStr}`;
  } catch {
    return String(weiString);
  }
}
