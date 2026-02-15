import { describe, expect, it } from "vitest";
import { formatFeedAction } from "../lib/format";

describe("formatFeedAction", () => {
  it("formats RFQCreated using mmoOffered (event arg) as 18-decimal MMO", () => {
    expect(
      formatFeedAction("RFQCreated", {
        rfqId: 123,
        slot: 3,
        minTier: 10,
        mmoOffered: "1000000000000000000"
      })
    ).toBe("Posted RFQ #123: 3 T10+ for 1.0000 MMO");
  });

  it("formats RFQFilled and RFQCancelled using rfqId", () => {
    expect(formatFeedAction("RFQFilled", { rfqId: 42 })).toBe("Filled RFQ #42");
    expect(formatFeedAction("RFQCancelled", { rfqId: 42 })).toBe("Cancelled RFQ #42");
  });
});

