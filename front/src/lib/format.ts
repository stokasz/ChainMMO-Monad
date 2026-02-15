export function formatNative(weiString: string): string {
  try {
    const wei = BigInt(weiString);
    const sign = wei < 0n ? "-" : "";
    const abs = wei < 0n ? -wei : wei;
    let whole = abs / 1_000_000_000_000_000_000n;
    const frac = abs % 1_000_000_000_000_000_000n;

    // Round to 4 decimals (0.0001 MON = 1e14 wei).
    const fracDivisor = 100_000_000_000_000n;
    let fracRounded = (frac + fracDivisor / 2n) / fracDivisor;
    if (fracRounded >= 10_000n) {
      whole += 1n;
      fracRounded = 0n;
    }

    const fracStr = fracRounded.toString().padStart(4, "0");
    return `${sign}${whole.toString()}.${fracStr}`;
  } catch {
    return String(weiString);
  }
}

export function formatAddress(value: string): string {
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
    return value;
  }
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function formatHash(value: string): string {
  if (!/^0x[a-fA-F0-9]{64}$/.test(value)) {
    return value;
  }
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

export function formatNumber(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "-";
  const num = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(num)) return String(value);
  return num.toLocaleString();
}

export function formatFeedLine(payload: Record<string, unknown>): string {
  if (!payload || Object.keys(payload).length === 0) return "";
  const label = typeof payload.label === "string" ? payload.label : undefined;
  const details =
    typeof payload.details === "string" ? payload.details : typeof payload.message === "string" ? payload.message : undefined;
  if (details) {
    return details;
  }
  if (label) {
    return label;
  }
  return JSON.stringify(payload);
}

export function formatRelativeTime(input: string | Date | number | null | undefined): string {
  if (!input) return "--";

  const now = Date.now();
  const when = input instanceof Date ? input.getTime() : new Date(input).getTime();
  if (!Number.isFinite(when)) {
    return "--";
  }

  const deltaMs = now - when;
  const deltaSeconds = Math.max(0, Math.floor(deltaMs / 1000));

  if (deltaSeconds < 60) {
    return `${deltaSeconds}s ago`;
  }

  const minutes = Math.floor(deltaSeconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function payloadLabel(value: unknown): string {
  return typeof value === "string" || typeof value === "number" || typeof value === "bigint" ? `${value}` : "";
}

export function formatFeedAction(kind: string, payload: Record<string, unknown>): string {
  switch (kind) {
    case "CharacterCreated": {
      const name = payloadLabel(payload.name);
      const race = payloadLabel(payload.race);
      const classType = payloadLabel(payload.classType);
      return `Created ${name || "character"} (${race || "?"} ${classType || "?"})`;
    }
    case "DungeonStarted":
      return `Started L${payloadLabel(payload.dungeonLevel)} ${payloadLabel(payload.difficulty)} dungeon`;
    case "DungeonRoomResolved": {
      const index = payloadLabel(payload.roomIndex);
      const success = payload.success === true ? "Cleared" : "Died in";
      return `${success} room ${index || ""}`.trim();
    }
    case "DungeonFinished": {
      const level = payloadLabel(payload.dungeonLevel);
      return `${payload.success ? "Cleared" : "Failed"} L${level || ""} dungeon`;
    }
    case "LootboxOpened":
      return `Opened ${payloadLabel(payload.amount)} T${payloadLabel(payload.tier)} lootbox(es)`;
    case "LootboxOpenMaxResolved": {
      return `Opened ${payloadLabel(payload.openedAmount)} / ${payloadLabel(payload.requestedAmount)} T${payloadLabel(payload.tier)} boxes`;
    }
    case "ItemEquipped":
      return `Equipped ${payloadLabel(payload.slot)} slot`;
    case "PremiumLootboxesPurchased": {
      const difficulty = payloadLabel(payload.difficulty);
      return `Bought ${payloadLabel(payload.amount)} ${difficulty} boxes`;
    }
    case "RFQCreated": {
      const rfqId = payloadLabel(payload.rfqId);
      const offeredRaw =
        typeof payload.mmoOfferedWei === "string"
          ? payload.mmoOfferedWei
          : typeof payload.mmoOffered === "string"
            ? payload.mmoOffered
            : typeof payload.mmoOffered === "bigint"
              ? payload.mmoOffered.toString()
              : "";
      const offeredText = offeredRaw ? formatNative(offeredRaw) : "-";
      const header = rfqId ? `Posted RFQ #${rfqId}:` : "Posted RFQ:";
      return `${header} ${payloadLabel(payload.slot)} T${payloadLabel(payload.minTier)}+ for ${offeredText} MMO`;
    }
    case "RFQFilled": {
      const rfqId = payloadLabel(payload.rfqId);
      return rfqId ? `Filled RFQ #${rfqId}` : "Filled RFQ";
    }
    case "RFQCancelled": {
      const rfqId = payloadLabel(payload.rfqId);
      return rfqId ? `Cancelled RFQ #${rfqId}` : "Cancelled RFQ";
    }
    case "CharacterLevelUpdated":
      return `Leveled up to L${payloadLabel(payload.newLevel)}`;
    case "SetPieceForged":
      return `Forged set piece → Set #${payloadLabel(payload.targetSetId)}`;
    case "PlayerClaimed":
      return `Claimed ${formatNative(payloadLabel(payload.amount as unknown as string))} MON epoch reward`;
    default:
      return formatFeedLine(payload);
  }
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  const safe = Number(value);
  if (!Number.isFinite(safe)) return "-";
  return `${safe.toFixed(2)}%`;
}
