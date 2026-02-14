import { describe, expect, it } from "vitest";
import { itemsAbi } from "../src/contracts/abi.js";

describe("items ABI parity", () => {
  it("includes decodeWithVariance with varianceMode output", () => {
    const decodeWithVariance = (itemsAbi as Array<any>).find(
      (entry) => entry.type === "function" && entry.name === "decodeWithVariance"
    );
    expect(decodeWithVariance).toBeDefined();
    expect(decodeWithVariance.outputs).toHaveLength(4);
    expect(decodeWithVariance.outputs[3]?.name).toBe("varianceMode");
  });
});
