import { useRef, useState, useEffect, useCallback } from "react";
import { TxHash } from "./shared/TxHash";
import { Panel } from "./Panel";
import { formatAddress, formatFeedAction, formatRelativeTime } from "../lib/format";
import { LiveDot } from "./shared/LiveDot";
import type { FeedEvent } from "../types";

const MAX_DOM_ENTRIES = 100;

interface LiveFeedProps {
  entries: FeedEvent[];
  error?: string;
}

function buildExplorerLink(kind: "address" | "tx", value: string): string | undefined {
  if (!value) return undefined;
  const explorer = "https://monadvision.com";
  if (kind === "address") {
    return `${explorer}/address/${value}`;
  }
  return `${explorer}/tx/${value}`;
}

function rowClass(kind: string, payload: Record<string, unknown>): string {
  if (kind === "CharacterLevelUpdated") return "row-flash-pos";
  if (kind === "DungeonFinished") return payload.success ? "row-flash-pos" : "row-flash-neg";
  if (kind === "DungeonRoomResolved") return payload.success === false ? "row-flash-neg" : "";
  if (kind === "PlayerClaimed") return "row-flash-pos";
  return "";
}

export function LiveFeed({ entries, error = "" }: LiveFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [newCount, setNewCount] = useState(0);
  const initializedRef = useRef(false);
  const prevIdsRef = useRef<Set<string>>(new Set());

  const visibleEntries = entries.slice(0, MAX_DOM_ENTRIES);

  const entryId = useCallback((entry: FeedEvent) => {
    return `${entry.blockNumber}-${entry.logIndex}-${entry.txHash}`;
  }, []);

  // Track whether user has scrolled away from top
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    // "Top" means within 40px of the top (entries are newest-first)
    const atTop = el.scrollTop <= 40;
    if (atTop && !autoScroll) {
      setAutoScroll(true);
      setNewCount(0);
    } else if (!atTop && autoScroll) {
      setAutoScroll(false);
    }
  }, [autoScroll]);

  // Auto-scroll to top when new entries arrive and autoScroll is on.
  // Important: the feed is capped, so length often doesn't change. Diff ids instead.
  useEffect(() => {
    const ids = new Set(entries.map(entryId));
    if (!initializedRef.current) {
      initializedRef.current = true;
      prevIdsRef.current = ids;
      return;
    }

    let added = 0;
    for (const id of ids) {
      if (!prevIdsRef.current.has(id)) added++;
    }
    prevIdsRef.current = ids;

    if (added > 0) {
      if (autoScroll) {
        scrollRef.current?.scrollTo({ top: 0 });
      } else {
        setNewCount((prev) => prev + added);
      }
    }
  }, [entries, autoScroll, entryId]);

  const resumeAutoScroll = useCallback(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    setAutoScroll(true);
    setNewCount(0);
  }, []);

  return (
    <Panel
      title={<span className="inline-flex items-center gap-2">LIVE FEED <LiveDot status={error ? "error" : "online"} /></span>}
      variant="compact"
      className="h-full"
    >
      {error ? <div className="mb-2 text-t-sm text-negative">{error}</div> : null}

      {/* New events badge */}
      {!autoScroll && newCount > 0 ? (
        <button
          type="button"
          className="mb-1 w-full rounded border border-accent/30 bg-accent/10 px-2 py-1 text-t-xs font-medium text-accent hover:bg-accent/20"
          onClick={resumeAutoScroll}
        >
          {newCount} new event{newCount !== 1 ? "s" : ""} — click to scroll up
        </button>
      ) : null}

      <div ref={scrollRef} data-testid="live-feed-scroll" className="h-full overflow-auto" onScroll={handleScroll}>
        <ul className="space-y-1">
          {visibleEntries.length === 0 ? (
            <li className="rounded border border-white/5 px-3 py-2 text-t-sm text-text-muted">No on-chain events yet.</li>
          ) : null}
          {visibleEntries.map((entry) => {
            const actionText = formatFeedAction(entry.kind, entry.payload || {}) || entry.kind;
            const explorerAddress = entry.owner ? buildExplorerLink("address", entry.owner) : undefined;
            const explorerTx = buildExplorerLink("tx", entry.txHash);
            const txLink = explorerTx ? (
              <a
                href={explorerTx}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-accent underline-offset-2 hover:underline"
              >
                tx <TxHash value={entry.txHash} className="tabular-nums align-baseline" />
              </a>
            ) : (
              <TxHash value={entry.txHash} className="tabular-nums" />
            );

            return (
              <li
                key={entryId(entry)}
                className={`rounded border border-border-subtle/70 bg-bg-raised/30 px-3 py-2 animate-[feed-enter_160ms_ease-out] ${rowClass(entry.kind, entry.payload || {})}`}
              >
                <div className="text-t-sm text-text-secondary">
                  {explorerAddress ? (
                    <a className="address-link" href={explorerAddress} target="_blank" rel="noreferrer">
                      {formatAddress(entry.owner ?? "")}
                    </a>
                  ) : (
                    <span className="text-text-muted">System</span>
                  )}
                  <span className="ml-2 whitespace-nowrap text-text-primary">{actionText}</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-3 text-t-xs text-text-muted">
                  <span>{formatRelativeTime(entry.createdAt)}</span>
                  {txLink}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </Panel>
  );
}
