import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { LiveFeed } from "../components/LiveFeed";
import type { FeedEvent } from "../types";

function ev(partial: Partial<FeedEvent> & Pick<FeedEvent, "blockNumber" | "logIndex" | "txHash" | "kind">): FeedEvent {
  return {
    blockNumber: partial.blockNumber,
    logIndex: partial.logIndex,
    txHash: partial.txHash,
    owner: partial.owner ?? null,
    createdAt: partial.createdAt ?? new Date().toISOString(),
    characterId: partial.characterId ?? null,
    kind: partial.kind,
    payload: partial.payload ?? {}
  };
}

describe("<LiveFeed /> refreshing", () => {
  it("shows new events even when the list length stays capped", async () => {
    const origScrollTo = (HTMLElement.prototype as any).scrollTo;
    (HTMLElement.prototype as any).scrollTo = vi.fn();

    try {
      const e1 = ev({ blockNumber: 10, logIndex: 1, txHash: "0x1", kind: "RFQCreated", payload: { rfqId: 1, slot: 1, minTier: 1, mmoOffered: "0" } });
      const e2 = ev({ blockNumber: 9, logIndex: 1, txHash: "0x2", kind: "RFQFilled", payload: { rfqId: 2 } });
      const e3 = ev({ blockNumber: 8, logIndex: 1, txHash: "0x3", kind: "RFQCancelled", payload: { rfqId: 3 } });

      const { rerender } = render(<LiveFeed entries={[e1, e2, e3]} />);

      const scrollEl = screen.getByTestId("live-feed-scroll");
      (scrollEl as any).scrollTop = 120;
      fireEvent.scroll(scrollEl);

      const newer = ev({ blockNumber: 11, logIndex: 1, txHash: "0x4", kind: "RFQFilled", payload: { rfqId: 77 } });

      await act(async () => {
        rerender(<LiveFeed entries={[newer, e1, e2]} />);
      });

      expect(screen.getByRole("button", { name: /1 new event/i })).toBeInTheDocument();

      const listItems = within(scrollEl).getAllByRole("listitem");
      expect(listItems[0]).toHaveTextContent("Filled RFQ #77");
    } finally {
      (HTMLElement.prototype as any).scrollTo = origScrollTo;
    }
  });
});

