import { describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import App from "../App";
import { getApiBase } from "../lib/url";

vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
  const url = typeof input === "string" ? input : input.toString();
  const payload = (() => {
    if (url.includes("/feed/recent")) {
      return { items: [] };
    }
    if (url.includes("/market/rfqs")) {
      return { nowUnix: 0, items: [] };
    }
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
    if (url.includes("/meta/external")) {
      return { mmo: null };
    }
    if (url.includes("/leaderboard?")) {
      return { leaderboardUpdatedAtBlock: 1, indexingLagBlocks: 0, items: [] };
    }
    if (url.includes("/meta/diagnostics")) {
      return { indexer: { cursor: null, chainHeadBlock: 1, chainLagBlocks: 0 } };
    }
    if (url.includes("/meta/rewards")) {
      return {
        avgFeesForPlayersWei: "0",
        latestFinalizedEpoch: null,
        currentEpoch: { epochId: 0, feesForPlayersWei: "0", feesTotalWei: "0", headBlock: 1 }
      };
    }
    if (url.includes("/grok/session")) {
      return { sessionId: "session-test" };
    }
    if (url.includes("/grok/history")) {
      return { items: [] };
    }
    if (url.includes("/grok/status")) {
      return { online: true, queueDepth: 0, lastSeenAt: null };
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
    await act(async () => {
      render(<App />);
    });
    expect(screen.getByTestId("navbar")).toBeInTheDocument();
    const navbar = screen.getByTestId("navbar");
    expect(within(navbar).queryByText(/^Trade$/i)).toBeNull();
    expect(within(navbar).queryByText(/^Onboard$/i)).toBeNull();
    expect(screen.getByText(/LIVE FEED/i)).toBeInTheDocument();
    expect(screen.getAllByText(/LEADERBOARD/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/EPOCH/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/REWARDS/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/RFQ MARKET/i)).toBeInTheDocument();
    expect(screen.getByText(/ECONOMY/i)).toBeInTheDocument();
    expect(screen.getByText(/MY AGENT/i)).toBeInTheDocument();
    expect(screen.getByText(/Give this command to your AI agent to start playing/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Copy$/i }).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/dark fantasy banner/i)).toBeInTheDocument();

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

    const expectedAnchors = ["feed", "leaderboard", "agent", "market", "docs", "about"];
    expect(Array.isArray(manifest?.anchors)).toBe(true);
    for (const id of expectedAnchors) {
      expect(manifest.anchors).toContain(id);
    }

    await waitFor(() => expect(screen.getByText(/updated block/i)).toBeInTheDocument());
    expect(screen.getByText("Leaderboard not loaded.")).toBeInTheDocument();
  });

  it("ticks the epoch countdown every second", async () => {
    vi.useFakeTimers();
    let now = 0;
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => now);

    try {
      await act(async () => {
        render(<App />);
      });
      const footer = screen.getByRole("contentinfo");
      const valueEl = within(footer).getByText(/Epoch \d{2}:\d{2}:\d{2}/);
      const t0 = valueEl.textContent;

      await act(async () => {
        now += 1000;
        await vi.advanceTimersByTimeAsync(1000);
      });

      const t1 = within(footer).getByText(/Epoch \d{2}:\d{2}:\d{2}/).textContent;
      expect(t1).not.toEqual(t0);
    } finally {
      nowSpy.mockRestore();
      vi.useRealTimers();
    }
  });
});
