import { useEffect, useMemo, useState } from "react";
import type { DiagnosticsResponse } from "../types";

interface StatusBarProps {
  rewardPoolText: string;
  avgPoolText: string;
  rfqCountText: string;
  agentsText: string;
  indexerText: string;
  diagnostics?: DiagnosticsResponse;
}

function formatCountdown() {
  const now = Date.now();
  const epoch = 60 * 60 * 1000;
  const next = (Math.floor(now / epoch) + 1) * epoch;
  const remain = Math.max(0, next - now);
  const total = Math.floor(remain / 1000);
  const hh = Math.floor(total / 3600)
    .toString()
    .padStart(2, "0");
  const mm = Math.floor((total % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const ss = (total % 60).toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export function StatusBar({
  rewardPoolText,
  avgPoolText,
  rfqCountText,
  agentsText,
  indexerText,
  diagnostics
}: StatusBarProps) {
  const [epochText, setEpochText] = useState<string>(formatCountdown());
  const [remainingMs, setRemainingMs] = useState<number>(() => computeRemainingMs());

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      setEpochText(formatCountdown());
      setRemainingMs(computeRemainingMs());
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const diagnosticsText = useMemo(() => {
    const chainLag = diagnostics?.indexer?.chainLagBlocks;
    if (chainLag === undefined || chainLag === null) {
      return indexerText;
    }
    if (chainLag <= 10) {
      return `indexer lag ${chainLag} blocks`;
    }
    if (chainLag <= 50) {
      return `indexer lag ${chainLag} blocks`;
    }
    return `indexer lag ${chainLag} blocks`;
  }, [diagnostics, indexerText]);

  const epochColorClass = remainingMs <= 60_000 ? "text-warning" : remainingMs <= 300_000 ? "text-accent" : "text-text-muted";
  const lag = diagnostics?.indexer?.chainLagBlocks;
  const indexerColorClass = lag === undefined || lag === null ? "text-text-muted" : lag <= 10 ? "text-positive" : lag <= 50 ? "text-warning" : "text-negative";

  const statusItems = [
    { label: `Epoch ${epochText}`, toneClass: epochColorClass },
    { label: `Pool ${rewardPoolText}`, toneClass: "text-text-muted" },
    { label: `Avg pool ${avgPoolText}`, toneClass: "text-text-muted" },
    { label: `${rfqCountText} RFQs`, toneClass: "text-text-muted" },
    { label: `Agents ${agentsText}`, toneClass: "text-text-muted" },
    { label: diagnosticsText, toneClass: indexerColorClass }
  ];

  return (
    <footer className="h-[28px] border-t border-border-subtle bg-bg-surface/65 text-t-xs text-text-muted">
      <div className="mx-auto flex h-full max-w-[2560px] items-center gap-4 px-3">
        {statusItems.map((item, index) => (
          <span key={item.label} className={index === 0 ? `font-medium ${item.toneClass}` : item.toneClass}>
            {item.label}
            {index < statusItems.length - 1 ? <span className="mx-2 text-text-muted">·</span> : null}
          </span>
        ))}
      </div>
    </footer>
  );
}

function computeRemainingMs(): number {
  const now = Date.now();
  const epoch = 60 * 60 * 1000;
  const next = (Math.floor(now / epoch) + 1) * epoch;
  return Math.max(0, next - now);
}
