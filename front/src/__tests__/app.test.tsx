import { describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import App from "../App";
import { getApiBase } from "../lib/url";

vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
  const url = typeof input === "string" ? input : input.toString();
  const payload = (() => {
    if (url.includes("/meta/contracts")) {
      return {
        chainId: 10143,
        gameWorld: "0x0000000000000000000000000000000000000000",
        feeVault: "0x0000000000000000000000000000000000000000",
        items: "0x0000000000000000000000000000000000000000",
        mmoToken: "0x0000000000000000000000000000000000000000",
        tradeEscrow: "0x0000000000000000000000000000000000000000",
        rfqMarket: "0x0000000000000000000000000000000000000000"
      };
    }
    if (url.includes("/leaderboard")) {
      return { leaderboardUpdatedAtBlock: 1, indexingLagBlocks: 0, items: [] };
    }
    if (url.includes("/meta/diagnostics")) {
      return { indexer: { cursor: null, chainHeadBlock: 1, chainLagBlocks: 0 } };
    }
    if (url.includes("/meta/rewards")) {
      return { avgFeesForPlayersWei: "0", latestFinalizedEpoch: null, currentEpoch: null };
    }
    return {};
  })();

  return {
    ok: true,
    status: 200,
    json: async () => payload
  } as any;
}));

describe("<App />", () => {
  it("renders the main sections", async () => {
    render(<App />);
    expect(
      screen.getByText(/Are you good enough to pay for your inference\?/i),
    ).toBeInTheDocument();

    const cmdLabel = screen.getByText(/Give this command to your agent:/i);
    const tagline = screen.getByText(
      /Get to the top 10% of players, get \$MON from the bottom 90% of them\./i,
    );
    expect(
      tagline.compareDocumentPosition(cmdLabel) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    expect(screen.getByText(/Give this command to your agent:/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Copy command/i })).toBeInTheDocument();
    expect(screen.getByText(/Rewards Pool/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Epoch Ends/i).length).toBeGreaterThan(0);
    expect(screen.getByTestId("epoch-ends-navbar")).toHaveTextContent(/^\d{2}:\d{2}:\d{2}$/);

    const manifestEl = document.getElementById("chainmmo-agent-manifest");
    expect(manifestEl).not.toBeNull();
    expect(manifestEl?.getAttribute("type")).toBe("application/json");

    const renderedStartCmd = screen.getByText(
      /curl -fsS .*meta\/playbook\/quickstart\?format=markdown/i
    ).textContent;

    const manifest = JSON.parse(manifestEl?.textContent ?? "{}") as any;
    expect(manifest?.schemaVersion).toBe(1);
    expect(manifest?.apiBase).toBe(getApiBase());
    expect(manifest?.cta?.startCmd).toBe(renderedStartCmd);
    expect(manifest?.endpoints?.playbookQuickstart).toBe(
      `${getApiBase()}/meta/playbook/quickstart?format=markdown`
    );

    const expectedAnchors = [
      "quickstart",
      "leaderboard",
      "economy",
      "onboarding",
      "benchmark",
      "docs",
      "lore"
    ];
    expect(Array.isArray(manifest?.anchors)).toBe(true);
    for (const id of expectedAnchors) {
      expect(manifest.anchors).toContain(id);
      expect(document.getElementById(id)).not.toBeNull();
    }

    expect(screen.getByText(/^Leaderboard:?$/i)).toBeInTheDocument();
    expect(screen.getByText(/Agent Onboarding/i)).toBeInTheDocument();
    expect(screen.getByText(/Benchmark Framing/i)).toBeInTheDocument();
    expect(screen.getByText(/Economy by Level Band/i)).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText(/updated block:/i)).toBeInTheDocument());
    expect(screen.getByText(/No leaderboard data yet\./i)).toBeInTheDocument();
  });

  it("ticks the epoch countdown every second", async () => {
    vi.useFakeTimers();
    let now = 0;
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => now);

    try {
      render(<App />);
      const valueEl = screen.getByTestId("epoch-ends-navbar");
      const t0 = valueEl.textContent;

      await act(async () => {
        now += 1000;
        // Flush the timer-driven state update.
        await vi.advanceTimersByTimeAsync(1000);
      });

      expect(valueEl.textContent).not.toEqual(t0);
    } finally {
      nowSpy.mockRestore();
      vi.useRealTimers();
    }
  });
});
