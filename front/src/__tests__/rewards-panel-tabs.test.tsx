import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { RewardsPanel } from "../components/RewardsPanel";

describe("RewardsPanel tiles", () => {
  it("switches between sections without rendering everything at once", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-14T00:00:00Z"));

    const epochId = Math.floor(Date.now() / 3600 / 1000);

    render(
      <RewardsPanel
        rewards={{
          avgFeesForPlayersWei: "100000000000000000",
          latestFinalizedEpoch: { epochId: epochId - 1, feesForPlayersWei: "200000000000000000" },
          currentEpoch: {
            epochId,
            feesForPlayersWei: "300000000000000000",
            feesTotalWei: "400000000000000000",
            headBlock: 123,
            fillCount: 2
          }
        }}
        claims={{
          characterId: 1,
          claimableEpochs: [
            { epochId: epochId - 2, eligible: true, claimed: false, claimTxHash: null, feesForPlayers: "0", totalEligibleWeight: "0" }
          ],
          allEpochs: [
            { epochId: epochId - 2, eligible: true, claimed: true, claimTxHash: "0xabc", feesForPlayers: "0", totalEligibleWeight: "0" }
          ]
        }}
        agentState={
          {
            character: { bestLevel: 10 },
            lootboxCredits: [{ tier: 1, total: 1, bound: { stable: 0, neutral: 0, swingy: 0 } }]
          } as any
        }
        epochMeta={{ epochId, cutoffLevel: 9, finalized: false, feesForPlayersWei: "0", feesForDeployerWei: "0", totalEligibleWeight: "0", updatedBlock: 0 }}
      />
    );

    const claimsTab = screen.getByRole("tab", { name: "Claims" });
    const claimsPanel = document.getElementById("rewards-tab-claims");
    expect(claimsPanel).not.toBeNull();
    expect(claimsPanel).toHaveAttribute("hidden");
    expect(screen.getByRole("tab", { name: "Pool" })).toBeInTheDocument();
    expect(screen.getByText("Free lootbox")).not.toBeVisible();

    fireEvent.click(claimsTab);
    expect(claimsPanel).not.toHaveAttribute("hidden");
    expect(screen.getByText("Free lootbox")).toBeVisible();

    const epochTab = screen.getByRole("tab", { name: "Epoch" });
    fireEvent.click(epochTab);
    const epochPanel = document.getElementById("rewards-tab-epoch");
    expect(epochPanel).not.toBeNull();
    expect(epochPanel).not.toHaveAttribute("hidden");
    expect(screen.getByText(/current epoch/i)).toBeInTheDocument();

    vi.useRealTimers();
  });
});
