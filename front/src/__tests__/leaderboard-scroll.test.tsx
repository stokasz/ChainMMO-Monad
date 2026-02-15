import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import React from "react";
import { LeaderboardPanel } from "../components/LeaderboardPanel";

describe("<LeaderboardPanel /> scrolling", () => {
  it("renders beyond the top 10 so the table can scroll", () => {
    const items = Array.from({ length: 15 }, (_, idx) => {
      const rank = idx + 1;
      const suffix = rank.toString(16).padStart(2, "0");
      return {
        rank,
        characterId: rank,
        owner: `0x${suffix.repeat(20)}`,
        ownerProfile: null,
        bestLevel: 1,
        percentile: 0
      };
    });

    render(<LeaderboardPanel items={items as any} diagnosticsText="ok" />);

    const table = screen.getByRole("table");
    const body = within(table).getAllByRole("rowgroup")[1];
    const rows = within(body).getAllByRole("row");

    // Header is separate; this should match the list length.
    expect(rows.length).toBe(15);
    expect(screen.getByText("15")).toBeInTheDocument();
  });
});

