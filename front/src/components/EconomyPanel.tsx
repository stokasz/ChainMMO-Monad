import { Panel } from "./Panel";
import { formatNumber, formatNative } from "../lib/format";
import type { DiagnosticsResponse, ExternalResponse, MarketRfqsResponse, RewardsResponse } from "../types";

interface EconomyPanelProps {
  diagnostics: DiagnosticsResponse | null;
  rewards: RewardsResponse | null;
  leaderboardLength: number;
  externalMmo: ExternalResponse | null;
  rfqs: MarketRfqsResponse | null;
}

interface StatCell {
  label: string;
  value: string;
  tone?: "positive" | "negative" | "warning" | "accent" | "default";
}

function StatBlock({ label, value, tone = "default" }: StatCell) {
  const toneClass =
    tone === "positive" ? "text-positive"
    : tone === "negative" ? "text-negative"
    : tone === "warning" ? "text-warning"
    : tone === "accent" ? "text-accent"
    : "text-text-bright";

  return (
    <div className="rounded border border-white/5 bg-bg-overlay/35 p-2">
      <div className="text-t-xs uppercase tracking-[0.06em] text-text-muted">{label}</div>
      <div className={`mt-1 text-t-base font-semibold tabular-nums ${toneClass}`}>{value}</div>
    </div>
  );
}

export function EconomyPanel({ diagnostics, rewards, leaderboardLength, externalMmo, rfqs }: EconomyPanelProps) {
  const avgPoolWei = rewards?.avgFeesForPlayersWei;
  const epochFeesTotalWei = rewards?.currentEpoch?.feesTotalWei;
  const activeAgents = leaderboardLength;
  const chainLag = diagnostics?.indexer?.chainLagBlocks ?? null;
  const rfqItems = Array.isArray(rfqs?.items) ? rfqs.items : [];
  const activeRfqs = rfqs?.totalActiveCount ?? rfqItems.filter((r) => r.active && !r.isExpired).length;
  const filledRfqs = rfqs?.totalFilledCount ?? rfqItems.filter((r) => r.filled).length;
  const fillCount = rewards?.currentEpoch?.fillCount ?? filledRfqs;

  const lagTone = chainLag === null ? "default" as const
    : chainLag <= 10 ? "positive" as const
    : chainLag <= 50 ? "warning" as const
    : "negative" as const;

  const stats: StatCell[] = [
    { label: "Avg Pool", value: avgPoolWei ? `${formatNative(avgPoolWei)} MON` : "-" },
    { label: "Epoch Fees", value: epochFeesTotalWei ? `${formatNative(epochFeesTotalWei)} MON` : "-", tone: "accent" },
    { label: "RFQ Volume", value: `${formatNumber(fillCount)} filled` },
    { label: "Active RFQs", value: formatNumber(activeRfqs) },
    { label: "Agents", value: formatNumber(activeAgents) },
    { label: "Indexer Lag", value: chainLag !== null ? `${chainLag} blk` : "-", tone: lagTone },
  ];

  return (
    <Panel title="ECONOMY" className="h-full">
      <div className="grid grid-cols-2 gap-2">
        {stats.map((stat) => (
          <StatBlock key={stat.label} {...stat} />
        ))}
      </div>
    </Panel>
  );
}
