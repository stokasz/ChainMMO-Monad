import { useMemo } from "react";
import { Panel } from "./Panel";
import { Address } from "./shared/Address";
import { LiveDot } from "./shared/LiveDot";
import { formatPercent, formatNumber } from "../lib/format";
import type { LeaderboardItem } from "../types";

interface LeaderboardPanelProps {
  items: LeaderboardItem[];
  diagnosticsText: string;
  walletAddress?: string;
  grokAddress?: string | null;
}

export function LeaderboardPanel({ items, diagnosticsText, walletAddress, grokAddress }: LeaderboardPanelProps) {
  const rows = useMemo(() => items, [items]);
  const normalizedWallet = typeof walletAddress === "string" ? walletAddress.toLowerCase() : "";
  const normalizedGrok = typeof grokAddress === "string" ? grokAddress.toLowerCase() : "";

  const normalizeOwner = (value: unknown): string => (typeof value === "string" ? value.toLowerCase() : "");

  const userInRows = useMemo(
    () => (normalizedWallet ? rows.some((row) => normalizeOwner((row as any).owner) === normalizedWallet) : false),
    [rows, normalizedWallet],
  );

  const userRow = useMemo(() => {
    if (!normalizedWallet || userInRows) return null;
    return items.find((row) => normalizeOwner((row as any).owner) === normalizedWallet) ?? null;
  }, [items, normalizedWallet, userInRows]);

  return (
    <Panel
      title={<span className="inline-flex items-center gap-2">LEADERBOARD <LiveDot status={rows.length > 0 ? "online" : "idle"} label={`Top ${rows.length}`} /></span>}
      className="h-full"
    >
      <div className="min-h-0 flex-1 overflow-auto border border-white/5">
        <table className="compact-table w-full text-t-sm">
          <thead className="sticky top-0 bg-bg-raised/90 text-t-xs text-left uppercase tracking-[0.08em] text-text-muted">
            <tr>
              <th className="w-10 px-2 py-2 text-right">#</th>
              <th className="px-2 py-2">Agent</th>
              <th className="w-14 px-2 py-2 text-right">Lvl</th>
              <th className="w-16 px-2 py-2 text-right">%ile</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-2 py-6 text-center text-text-muted" colSpan={4}>
                  Leaderboard not loaded.
                </td>
              </tr>
            ) : null}
            {rows.map((row) => {
              const isUser = normalizedWallet !== "" && normalizeOwner((row as any).owner) === normalizedWallet;
              const isGrok = normalizedGrok !== "" && normalizeOwner((row as any).owner) === normalizedGrok;
              return (
                <tr
                  key={`${row.characterId}-${row.rank}`}
                  className={`border-t border-white/5 ${isUser ? "border-l-2 border-l-accent bg-accent/5" : ""}`}
                >
                  <td className="px-2 text-right text-text-bright">{row.rank}</td>
                  <td className="px-2">
                    {isGrok ? (
                      <span className="text-text-bright font-semibold" title={row.owner}>
                        @GROK
                      </span>
                    ) : row.ownerProfile?.xUsername
                      ? <span className="text-text-bright">@{row.ownerProfile.xUsername}</span>
                      : <Address value={row.owner} />}
                  </td>
                  <td className="px-2 text-right font-semibold text-text-bright">{formatNumber(row.bestLevel)}</td>
                  <td className="px-2 text-right">{formatPercent(row.percentile)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {userRow && (
        <div className="mt-1 flex items-center justify-between rounded border border-accent/30 bg-accent/5 px-3 py-1.5 text-t-sm">
          <span className="text-accent font-medium">You: #{userRow.rank}</span>
          <span>L{userRow.bestLevel}</span>
          <span>{formatPercent(userRow.percentile)}</span>
        </div>
      )}
      <div className="mt-1 text-t-xs text-text-muted">{diagnosticsText}</div>
    </Panel>
  );
}
