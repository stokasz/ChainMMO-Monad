import { useEffect, useState } from "react";
import { fetchJson } from "../lib/api";
import type { FeedEvent, FeedResponse } from "../types";

export function useRecentFeed(apiBase: string, enabled: boolean, limit = 50) {
  const [entries, setEntries] = useState<FeedEvent[]>([]);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (!enabled) {
      setEntries([]);
      setError("");
      return;
    }

    let active = true;
    let timer: number | undefined;
    let latestBlock = 0;
    const lookbackBlocks = 2; // tolerate late-indexed events in the most recent blocks

    const mergeEntries = (currentRows: FeedEvent[], nextRows: FeedEvent[]) => {
      const dedupe = new Map<string, FeedEvent>();
      for (const row of currentRows) {
        dedupe.set(`${row.blockNumber}-${row.logIndex}-${row.txHash}`, row);
      }

      for (const row of nextRows) {
        dedupe.set(`${row.blockNumber}-${row.logIndex}-${row.txHash}`, row);
      }

      const rows = Array.from(dedupe.values()).sort((a, b) => {
        if (a.blockNumber !== b.blockNumber) return b.blockNumber - a.blockNumber;
        return b.logIndex - a.logIndex;
      });

      return rows.slice(0, 80);
    };

    const load = async () => {
      if (!active) return;
      try {
        const query = new URLSearchParams({
          limit: String(limit)
        });
        if (latestBlock > 0) {
          query.set("sinceBlock", String(Math.max(0, latestBlock - lookbackBlocks)));
        }

        const payload = await fetchJson<FeedResponse>(`${apiBase}/feed/recent?${query.toString()}`);
        const next = Array.isArray(payload?.items) ? payload.items : [];
        const normalized = next
          .filter((row) => row && Number.isFinite(row.blockNumber))
          .map((row) => ({
            blockNumber: Number(row.blockNumber),
            logIndex: Number(row.logIndex) || 0,
            txHash: String(row.txHash ?? ""),
            owner: typeof row.owner === "string" && row.owner.length > 0 ? row.owner : null,
            createdAt: typeof row.createdAt === "string" && row.createdAt.length > 0 ? row.createdAt : new Date().toISOString(),
            characterId: Number.isFinite(row.characterId as number) ? Number(row.characterId) : null,
            kind: String(row.kind ?? "event"),
            payload: row.payload ?? {}
          }));

        setEntries((current) => {
          const merged = mergeEntries(current, normalized);
          const newest = merged[0];
          if (newest) {
            latestBlock = Math.max(latestBlock, newest.blockNumber);
          }
          return merged;
        });

        if (normalized.length > 0) {
          const high = [...normalized].sort((a, b) => {
            if (a.blockNumber !== b.blockNumber) {
              return b.blockNumber - a.blockNumber;
            }
            return b.logIndex - a.logIndex;
          })[0];
          if (high) {
            latestBlock = Math.max(latestBlock, high.blockNumber);
          }
        }

        setError("");
      } catch (error: unknown) {
        if (!active) return;
        setError(error instanceof Error ? error.message : "feed_load_failed");
      }
    };

    const schedule = () => {
      if (!active) return;
      void load();
      timer = window.setInterval(() => {
        void load();
      }, 3000);
    };

    schedule();

    return () => {
      active = false;
      if (timer !== undefined) {
        window.clearInterval(timer);
      }
    };
  }, [apiBase, enabled, limit]);

  return { entries, error };
}
