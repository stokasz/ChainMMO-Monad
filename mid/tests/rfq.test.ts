import { describe, expect, it } from "vitest";
import { decodeAcceptedSetIds, isRfqExpired, rfqAcceptsSetId } from "../src/shared/rfq.js";

describe("rfq set-mask helpers", () => {
  it("treats zero set mask as accepting any set", () => {
    expect(rfqAcceptsSetId("0", 42)).toBe(true);
    expect(decodeAcceptedSetIds("0")).toEqual([]);
  });

  it("decodes and matches configured set ids", () => {
    const mask = ((1n << 2n) | (1n << 5n) | (1n << 8n)).toString();
    expect(decodeAcceptedSetIds(mask)).toEqual([2, 5, 8]);
    expect(rfqAcceptsSetId(mask, 5)).toBe(true);
    expect(rfqAcceptsSetId(mask, 6)).toBe(false);
  });

  it("marks rfqs expired only when expiry is non-zero and in the past", () => {
    expect(isRfqExpired(0, 1_000)).toBe(false);
    expect(isRfqExpired(999, 1_000)).toBe(true);
    expect(isRfqExpired(1_000, 1_000)).toBe(false);
    expect(isRfqExpired(1_001, 1_000)).toBe(false);
  });
});
