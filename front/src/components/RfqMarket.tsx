import { Panel } from "./Panel";
import { formatNative, formatNumber } from "../lib/format";
import { Address } from "./shared/Address";
import { LiveDot } from "./shared/LiveDot";
import type { MarketRfqsResponse } from "../types";

interface RfqMarketPanelProps {
  response: MarketRfqsResponse | null;
}

function formatExpiration(expiryUnix: number, nowUnix: number): { text: string; isExpired: boolean; isUrgent: boolean } {
  const remaining = expiryUnix - nowUnix;
  const isExpired = remaining <= 0;
  if (isExpired) {
    return { text: "expired", isExpired: true, isUrgent: false };
  }

  const totalMinutes = Math.max(0, Math.floor(remaining / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const isUrgent = totalMinutes <= 30;
  if (hours > 0) {
    return { text: `${hours}h ${String(minutes).padStart(2, "0")}m`, isExpired: false, isUrgent };
  }
  return { text: `${totalMinutes}m`, isExpired: false, isUrgent };
}

function formatSetInfo(row: MarketRfqsResponse["items"][number]): string {
  if (row.acceptsAnySet) return "Any";
  if (Array.isArray(row.acceptedSetIds) && row.acceptedSetIds.length > 0) {
    return row.acceptedSetIds.map((value) => `#${value}`).join(", ");
  }
  if (row.setMask !== undefined && row.setMask !== null) return `Mask ${row.setMask}`;
  return "—";
}

export function RfqMarketPanel({ response }: RfqMarketPanelProps) {
  const items = Array.isArray(response?.items) ? response.items : [];
  const activeCount = response?.totalActiveCount ?? items.filter((row) => row.active && !row.isExpired).length;
  const nowUnix = response?.nowUnix ?? Math.floor(Date.now() / 1000);

  return (
    <Panel
      title="RFQ MARKET"
      status={<LiveDot status={items.length > 0 ? "online" : "idle"} label={`${activeCount} active`}/>}
      className="h-full"
    >
      <div className="min-h-0 flex-1 overflow-auto border border-white/5">
        <table className="compact-table w-full text-t-sm">
          <thead className="sticky top-0 bg-bg-raised/90 text-t-xs text-left uppercase tracking-[0.08em] text-text-muted">
            <tr>
              <th className="px-2 py-2">RFQ</th>
              <th className="px-2 py-2">Slot</th>
              <th className="px-2 py-2">Tier</th>
              <th className="px-2 py-2">Set</th>
              <th className="px-2 py-2">Offer</th>
              <th className="px-2 py-2">Exp</th>
              <th className="px-2 py-2">Maker</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td className="px-2 py-6 text-center text-text-muted" colSpan={7}>
                  No active RFQs.
                </td>
              </tr>
            ) : null}
            {items.slice(0, 12).map((row) => {
              const expiry = formatExpiration(row.expiryUnix, nowUnix);
              return (
                <tr
                  key={row.rfqId}
                  className={`border-t border-white/5 ${expiry.isUrgent ? "row-flash-neg" : ""} ${row.isExpired ? "text-text-muted" : ""}`}
                >
                  <td className="px-2">#{row.rfqId}</td>
                  <td className="px-2">{row.slot}</td>
                  <td className="px-2">T{formatNumber(row.minTier)}+</td>
                  <td className="px-2">{formatSetInfo(row)}</td>
                  <td className="px-2">{formatNative(row.mmoOfferedWei)} MMO</td>
                  <td className={`px-2 ${expiry.isUrgent ? "epoch-urgency" : ""}`}>
                    {expiry.isExpired ? "expired" : expiry.text}
                  </td>
                  <td className="px-2">
                    <Address value={row.maker} className="max-w-[9rem] md:max-w-[10rem] lg:max-w-[11rem]" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
