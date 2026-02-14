import { describe, expect, it } from "vitest";
import {
  decodeLeaderboardCursor,
  encodeLeaderboardCursor,
  sortLeaderboardRows,
  type LeaderboardRow
} from "../src/shared/leaderboard.js";

describe("leaderboard deterministic order", () => {
  it("sorts by bestLevel desc, characterId asc", () => {
    const rows: LeaderboardRow[] = [
      { characterId: 5, owner: "0x2", bestLevel: 9, lastLevelUpEpoch: 7 },
      { characterId: 2, owner: "0x1", bestLevel: 10, lastLevelUpEpoch: 6 },
      { characterId: 1, owner: "0x4", bestLevel: 9, lastLevelUpEpoch: 8 },
      { characterId: 3, owner: "0x3", bestLevel: 10, lastLevelUpEpoch: 9 }
    ];

    const sorted = sortLeaderboardRows(rows);
    expect(sorted.map((r) => r.characterId)).toEqual([2, 3, 1, 5]);
  });

  it("round-trips opaque cursor", () => {
    const cursor = encodeLeaderboardCursor({ bestLevel: 42, characterId: 99 });
    expect(decodeLeaderboardCursor(cursor)).toEqual({ bestLevel: 42, characterId: 99 });
  });
});
