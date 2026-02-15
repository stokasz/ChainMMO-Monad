import { useEffect, useMemo, useState } from "react";
import { Panel } from "./Panel";
import { LiveDot } from "./shared/LiveDot";
import { formatNative, formatNumber } from "../lib/format";
import type { AgentStatePayload, LeaderboardClaimsResponse, LeaderboardEpochMeta, RewardsResponse } from "../types";

interface RewardsPanelProps {
  rewards: RewardsResponse | null;
  claims: LeaderboardClaimsResponse | null;
  agentState: AgentStatePayload | null;
  epochMeta: LeaderboardEpochMeta | null;
}

const HOUR_MS = 3600 * 1000;

function deriveEpoch(epochId: number | null | undefined): { countdownMs: number; displayEpochId: number | null } {
  if (!Number.isFinite(epochId)) return { countdownMs: 0, displayEpochId: null };
  const now = Date.now();
  const nextEpochMs = (epochId! + 1) * HOUR_MS;
  if (now < nextEpochMs) {
    return { countdownMs: nextEpochMs - now, displayEpochId: epochId! };
  }
  // Reported epoch expired — roll over using wall clock
  const currentEpochId = Math.floor(now / HOUR_MS);
  const currentEnd = (currentEpochId + 1) * HOUR_MS;
  return { countdownMs: currentEnd - now, displayEpochId: currentEpochId };
}

function formatCountdown(ms: number): string {
  const total = Math.floor(ms / 1000);
  const hh = Math.floor(total / 3600)
    .toString()
    .padStart(2, "0");
  const mm = Math.floor((total % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const ss = (total % 60).toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export function RewardsPanel({ rewards, claims, agentState, epochMeta }: RewardsPanelProps) {
  type TabId = "pool" | "epoch" | "eligibility" | "claims";
  const [activeTab, setActiveTab] = useState<TabId>("pool");
  const [epoch, setEpoch] = useState<{ countdownMs: number; displayEpochId: number | null }>(() => deriveEpoch(rewards?.currentEpoch?.epochId ?? null));

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      setEpoch(deriveEpoch(rewards?.currentEpoch?.epochId ?? null));
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [rewards?.currentEpoch?.epochId]);

  const epochCountdownMs = epoch.countdownMs;

  const pool = rewards?.currentEpoch?.feesForPlayersWei;
  const cutoffLevel = epochMeta?.cutoffLevel;
  const claimableCount = Array.isArray(claims?.claimableEpochs) ? claims.claimableEpochs.length : 0;
  const freeLootbox = (agentState?.lootboxCredits ?? []).some((entry) => entry.total > 0);
  const claimedEpochs = Array.isArray(claims?.allEpochs) ? claims.allEpochs.length : 0;

  const claimableRowClass = claimableCount > 0 ? "text-positive" : "text-text-muted";
  const urgencyClass = epochCountdownMs <= 5 * 60 * 1000 ? "row-flash-neg text-warning" : "text-text-muted";
  const headerVariant = epochCountdownMs <= 5 * 60 * 1000 ? "alert" : "default";

  const latest = rewards?.latestFinalizedEpoch?.feesForPlayersWei;
  const currentLevel = agentState?.character?.bestLevel ?? null;

  const cutoffText = useMemo(() => {
    if (cutoffLevel === undefined) return "-";
    if (currentLevel === null) return `L${cutoffLevel}`;
    if (currentLevel >= cutoffLevel) return `L${cutoffLevel} ✓`;
    return `L${cutoffLevel} ⚠`;
  }, [currentLevel, cutoffLevel]);

  const eligibilityText =
    currentLevel === null ? "Connect wallet" : currentLevel >= (cutoffLevel ?? Infinity) ? "Eligible" : "Below cutoff";
  const poolText = pool ? `${formatNative(pool)} MON` : "-";
  const latestText = latest ? `${formatNative(latest)} MON` : "-";
  const epochText = epoch.displayEpochId ?? rewards?.currentEpoch?.epochId ?? "-";
  const claimableText = formatNumber(claimableCount);
  const lootboxText = freeLootbox ? "Available ✓" : "Claimed";

  return (
    <Panel
      title={<span className="inline-flex items-center gap-2">EPOCH / REWARDS <LiveDot status={epochCountdownMs <= 5 * 60 * 1000 ? "error" : "online"} /></span>}
      variant={headerVariant}
      className="h-full"
    >
      <div className="flex h-full min-h-0 flex-col gap-3 text-t-sm">
        <div
          role="tablist"
          aria-label="Rewards sections"
          className="grid shrink-0 grid-cols-2 gap-2"
        >
          {(
            [
              {
                id: "pool",
                label: "Pool",
                value: poolText,
                meta: `last ${latestText}`
              },
              {
                id: "epoch",
                label: "Epoch",
                value: formatCountdown(epochCountdownMs),
                meta: `#${epochText}`
              },
              {
                id: "eligibility",
                label: "Eligibility",
                value: eligibilityText,
                meta: `cutoff ${cutoffText}`
              },
              {
                id: "claims",
                label: "Claims",
                value: `${claimableText} claimable`,
                meta: `lootbox ${lootboxText}`
              }
            ] as const
          ).map((tab) => {
            const isActive = activeTab === tab.id;
            const highlight = tab.id === "epoch" && epochCountdownMs <= 5 * 60 * 1000;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-label={tab.label}
                aria-selected={isActive}
                aria-controls={`rewards-tab-${tab.id}`}
                id={`rewards-tab-button-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={[
                  "rounded border p-2 text-left transition",
                  "bg-bg-overlay/35 hover:bg-bg-overlay/55",
                  isActive ? "border-accent/45 shadow-[0_0_18px_rgba(200,170,110,0.12)]" : "border-border-subtle/70",
                  highlight ? "border-warning/55" : "",
                ].join(" ")}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-t-xs uppercase tracking-[0.08em] text-text-muted">{tab.label}</div>
                  {tab.id === "epoch" ? (
                    <LiveDot status={epochCountdownMs <= 5 * 60 * 1000 ? "error" : "online"} />
                  ) : null}
                </div>
                <div className={`mt-1 font-medium ${tab.id === "epoch" ? urgencyClass : "text-text-bright"}`}>{tab.value}</div>
                <div className="mt-0.5 text-t-xs text-text-secondary">{tab.meta}</div>
              </button>
            );
          })}
        </div>

        <div className="min-h-0 flex-1 overflow-auto pr-1">
          <section
            id="rewards-tab-pool"
            role="tabpanel"
            aria-labelledby="rewards-tab-button-pool"
            hidden={activeTab !== "pool"}
            className="grid gap-2 rounded border border-border-subtle/70 bg-bg-overlay/45 p-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-text-muted">Pool</span>
              <span className="text-text-bright">{poolText}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-text-muted">Last finalized</span>
              <span>{latestText}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-text-muted">Avg (recent)</span>
              <span>{rewards?.avgFeesForPlayersWei ? `${formatNative(rewards.avgFeesForPlayersWei)} MON` : "-"}</span>
            </div>
          </section>

          <section
            id="rewards-tab-epoch"
            role="tabpanel"
            aria-labelledby="rewards-tab-button-epoch"
            hidden={activeTab !== "epoch"}
            className="grid gap-2 rounded border border-border-subtle/70 bg-bg-overlay/45 p-3"
          >
            <div className={`text-t-base font-medium ${urgencyClass}`}>Epoch ends in {formatCountdown(epochCountdownMs)}</div>
            <div className="text-t-xs text-text-secondary">current epoch {epochText}</div>
            <div className="mt-2 grid gap-2">
              <div className="flex items-center justify-between">
                <span className="text-text-muted">Head block</span>
                <span>{rewards?.currentEpoch?.headBlock ?? "-"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-text-muted">Fill count</span>
                <span>{rewards?.currentEpoch?.fillCount ?? "-"}</span>
              </div>
            </div>
          </section>

          <section
            id="rewards-tab-eligibility"
            role="tabpanel"
            aria-labelledby="rewards-tab-button-eligibility"
            hidden={activeTab !== "eligibility"}
            className="grid gap-2 rounded border border-border-subtle/70 bg-bg-overlay/45 p-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-text-muted">Cutoff</span>
              <span>{cutoffText}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-text-muted">Your best level</span>
              <span>{currentLevel === null ? "-" : `L${currentLevel}`}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-text-muted">Eligibility</span>
              <span className={eligibilityText === "Eligible" ? "text-positive" : currentLevel === null ? "text-text-muted" : "text-warning"}>{eligibilityText}</span>
            </div>
          </section>

          <section
            id="rewards-tab-claims"
            role="tabpanel"
            aria-labelledby="rewards-tab-button-claims"
            hidden={activeTab !== "claims"}
            className="grid gap-2 rounded border border-border-subtle/70 bg-bg-overlay/45 p-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-text-muted">Free lootbox</span>
              <span className={freeLootbox ? "text-positive" : "text-text-muted"}>{lootboxText}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-text-muted">Claimable epochs</span>
              <span className={claimableRowClass}>{claimableText}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-text-muted">Historical claim history</span>
              <span>{formatNumber(claimedEpochs)} entries</span>
            </div>
          </section>
        </div>
      </div>
    </Panel>
  );
}
