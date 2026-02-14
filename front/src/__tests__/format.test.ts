import { describe, expect, it } from "vitest";
import { formatNative } from "../lib/format";

describe("formatNative", () => {
  it("formats wei as MON with 4 decimals", () => {
    expect(formatNative("0")).toBe("0.0000");
    expect(formatNative("1")).toBe("0.0000");
    expect(formatNative("1000000000000000000")).toBe("1.0000");
    expect(formatNative("1234500000000000000")).toBe("1.2345");
    expect(formatNative("1999999999999999999")).toBe("2.0000");
    expect(formatNative("-1999999999999999999")).toBe("-2.0000");
  });

  it("passes through invalid inputs", () => {
    expect(formatNative("not-a-number")).toBe("not-a-number");
  });
});
