import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import App from "../App";

vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
  const url = typeof input === "string" ? input : input.toString();
  const payload = (() => {
    if (url.includes("/meta/contracts")) {
      return {
        chainId: 143,
        gameWorld: "0x0000000000000000000000000000000000000000",
        feeVault: "0x0000000000000000000000000000000000000000",
        items: "0x0000000000000000000000000000000000000000",
        mmoToken: "0x0000000000000000000000000000000000000000",
        tradeEscrow: "0x0000000000000000000000000000000000000000",
        rfqMarket: "0x0000000000000000000000000000000000000000"
      };
    }
    if (url.includes("/leaderboard")) {
      return {
        leaderboardUpdatedAtBlock: 1,
        indexingLagBlocks: 0,
        items: [
          {
            characterId: 1,
            owner: "0x1111111111111111111111111111111111111111",
            ownerProfile: null,
            bestLevel: 31,
            rank: 1,
            percentile: 50,
            lastLevelUpEpoch: 1
          }
        ]
      };
    }
    if (url.includes("/meta/diagnostics")) {
      return { indexer: { cursor: null, chainHeadBlock: 1, chainLagBlocks: 0 } };
    }
    if (url.includes("/meta/rewards")) {
      return { avgFeesForPlayersWei: "0", latestFinalizedEpoch: null, currentEpoch: null };
    }
    if (url.includes("/meta/external")) {
      return { mmo: null };
    }
    if (url.includes("/grok/session")) {
      return { sessionId: "session-test" };
    }
    if (url.includes("/grok/history")) {
      return { items: [] };
    }
    if (url.includes("/grok/status")) {
      return {
        online: true,
        queueDepth: 0,
        lastSeenAt: null,
        agentAddress: "0x1111111111111111111111111111111111111111",
        agentCharacterId: 1
      };
    }
    return {};
  })();

  return {
    ok: true,
    status: 200,
    json: async () => payload
  } as any;
}));

describe("<App /> grok leaderboard label", () => {
  it("renders @GROK on leaderboard rows that match the agent address", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByText("@GROK").length).toBeGreaterThan(0);
    });
  });
});

