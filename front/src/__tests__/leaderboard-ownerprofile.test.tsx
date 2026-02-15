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
            ownerProfile: { xUserId: "1", xUsername: "alice" },
            bestLevel: 31,
            rank: 1,
            percentile: 50,
            lastLevelUpEpoch: 1
          },
          {
            characterId: 2,
            owner: "0x2222222222222222222222222222222222222222",
            ownerProfile: null,
            bestLevel: 4,
            rank: 2,
            percentile: 0,
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
    return {};
  })();

  return {
    ok: true,
    status: 200,
    json: async () => payload
  } as any;
}));

describe("<App /> leaderboard profiles", () => {
  it("renders X usernames on leaderboard rows when available", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByText("@alice").length).toBeGreaterThan(0);
    });

    expect(screen.getAllByText("0x2222...2222").length).toBeGreaterThan(0);
  });
});
