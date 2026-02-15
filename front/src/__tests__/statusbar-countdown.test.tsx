import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { StatusBar } from "../components/StatusBar";

describe("<StatusBar />", () => {
  it("ticks the epoch countdown every second", async () => {
    vi.useFakeTimers();
    let now = 0;
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => now);

    try {
      render(
        <StatusBar
          rewardPoolText="-"
          avgPoolText="-"
          rfqCountText="-"
          agentsText="-"
          indexerText="-"
        />
      );

      const valueEl = screen.getByText(/Epoch \d{2}:\d{2}:\d{2}/);
      const t0 = valueEl.textContent;

      await act(async () => {
        now += 1000;
        await vi.advanceTimersByTimeAsync(1000);
      });

      const t1 = screen.getByText(/Epoch \d{2}:\d{2}:\d{2}/).textContent;
      expect(t1).not.toEqual(t0);
    } finally {
      nowSpy.mockRestore();
      vi.useRealTimers();
    }
  });
});
