export interface LeaderboardRow {
  characterId: number;
  owner: string;
  bestLevel: number;
  lastLevelUpEpoch: number;
}

export interface LeaderboardCursor {
  bestLevel: number;
  characterId: number;
}

export function sortLeaderboardRows<T extends LeaderboardRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (b.bestLevel !== a.bestLevel) {
      return b.bestLevel - a.bestLevel;
    }
    return a.characterId - b.characterId;
  });
}

export function encodeLeaderboardCursor(cursor: LeaderboardCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeLeaderboardCursor(cursor: string): LeaderboardCursor {
  const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  if (
    typeof decoded !== "object" ||
    decoded === null ||
    typeof decoded.bestLevel !== "number" ||
    typeof decoded.characterId !== "number"
  ) {
    throw new Error("invalid_cursor");
  }

  return {
    bestLevel: decoded.bestLevel,
    characterId: decoded.characterId
  };
}
