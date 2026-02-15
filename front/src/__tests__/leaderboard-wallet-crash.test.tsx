import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { LeaderboardPanel } from "../components/LeaderboardPanel";

describe("<LeaderboardPanel /> wallet highlighting", () => {
  it("does not crash if a row is missing owner (defensive against partial API rows)", () => {
    const items: any[] = [
      {
        rank: 1,
        characterId: 1,
        // owner intentionally missing to simulate bad/partial data
        ownerProfile: { xUserId: "1", xUsername: "alice" },
        bestLevel: 10,
        percentile: 99.9,
      },
    ];

    render(<LeaderboardPanel items={items as any} diagnosticsText="ok" walletAddress="0x1111111111111111111111111111111111111111" />);
    expect(screen.getByText("@alice")).toBeInTheDocument();
  });
});

