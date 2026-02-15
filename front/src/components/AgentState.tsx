import { Panel } from "./Panel";
import { Address } from "./shared/Address";
import { CopyButton } from "./shared/CopyButton";
import { formatNative, formatNumber } from "../lib/format";
import type { AgentCharactersResponse, AgentStatePayload, LeaderboardClaimsResponse } from "../types";
import darkFantasy2BannerMp4Url from "../../assets/dark-fantasy2.mp4";

interface AgentStateProps {
  walletAddress: string;
  characters: AgentCharactersResponse | null;
  state: AgentStatePayload | null;
  claims: LeaderboardClaimsResponse | null;
  onboardingReadOnlyCmd: string;
}

const SLOT_LABELS = ["HEAD", "SHOULDERS", "CHEST", "LEGS", "FEET", "MAIN_H", "OFF_H", "TRINKET"];

function OnboardBanner() {
  return (
    <div className="overflow-hidden rounded border border-white/5 bg-bg-overlay/45">
      <video
        className="h-24 w-full object-cover"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-label="Dark fantasy banner"
      >
        <source src={darkFantasy2BannerMp4Url} type="video/mp4" />
      </video>
    </div>
  );
}

function formatPotionState(value?: number | null): string {
  const normalized = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return formatNumber(Math.max(0, normalized));
}

function formatSetSummary(setCounts: Record<string, number>): string {
  const entries = Object.entries(setCounts).filter(([, count]) => count > 0);
  if (entries.length === 0) return "no sets";

  return entries
    .map(([setId, count]) => `#${setId}:${count}`)
    .join(", ");
}

function getInventoryRow(state: {
  lootboxCredits?: Array<{ tier: number; total: number }>;
  runState?: {
    hpPotionCharges?: number | null;
    manaPotionCharges?: number | null;
    powerPotionCharges?: number | null;
  };
  economy?: {
    upgradeStoneBalance?: number | null;
    mmoBalanceWei?: string | null;
    nativeBalanceWei?: string | null;
  };
}) {
  const credits = (Array.isArray(state.lootboxCredits) ? state.lootboxCredits : []).reduce((acc, item) => {
    acc[item.tier] = item.total;
    return acc;
  }, {} as Record<number, number>);

  const maxTier = (Array.isArray(state.lootboxCredits) ? state.lootboxCredits : []).reduce(
    (memo, row) => Math.max(memo, row.tier),
    0
  );

  return {
    stones: state.economy?.upgradeStoneBalance ?? 0,
    potions: `${formatPotionState(state.runState?.hpPotionCharges)} hp / ${formatPotionState(state.runState?.manaPotionCharges)} mana / ${formatPotionState(state.runState?.powerPotionCharges)} pow`,
    mmo: formatNative(state.economy?.mmoBalanceWei ?? "0"),
    mon: formatNative(state.economy?.nativeBalanceWei ?? "0"),
    lootboxes: maxTier > 0 ? `${formatNumber(credits[maxTier] ?? 0)}xT${maxTier}` : "0"
  };
}

export function AgentStatePanel({
  walletAddress,
  characters,
  state,
  claims,
  onboardingReadOnlyCmd
}: AgentStateProps) {
  const items = Array.isArray(characters?.items) ? characters.items : [];
  const selected = items[0] ?? null;

  if (!walletAddress) {
    return (
      <Panel title="MY AGENT" className="h-full">
        <div className="mb-2 text-t-sm text-text-muted">Connect a wallet to load your agent portfolio.</div>
        <section className="space-y-2">
          <h3 className="inline-block rounded border border-warning/20 bg-warning/10 px-2 py-0.5 text-t-xs font-bold text-text-bright">
            Give this command to your AI agent to start playing
          </h3>
          <div className="panel-code text-t-xs">{onboardingReadOnlyCmd}</div>
          <div className="flex justify-end">
            <CopyButton text={onboardingReadOnlyCmd} />
          </div>
          <OnboardBanner />
        </section>
      </Panel>
    );
  }

  if (!selected || !state) {
    return (
      <Panel title="MY AGENT" className="h-full">
        <div className="rounded border border-white/5 bg-bg-overlay/45 p-3 text-t-sm text-text-muted">
          {selected ? "Loading agent state..." : "No local character found for this wallet. Try onboarding via the command below."}
        </div>
        {!selected && (
          <section className="mt-2 space-y-2">
            <h3 className="inline-block rounded border border-warning/20 bg-warning/10 px-2 py-0.5 text-t-xs font-bold text-text-bright">
              Give this command to your AI agent to start playing
            </h3>
            <div className="panel-code text-t-xs">{onboardingReadOnlyCmd}</div>
            <div className="flex justify-end">
              <CopyButton text={onboardingReadOnlyCmd} />
            </div>
            <OnboardBanner />
          </section>
        )}
      </Panel>
    );
  }

  if (
    !state.runState
    || !state.character
    || !state.equipment
    || !state.economy
    || !Array.isArray(state.equipment.items)
    || !state.equipment.derivedStats
    || !Array.isArray(state.lootboxCredits)
  ) {
    return (
      <Panel title="MY AGENT" className="h-full">
        <div className="rounded border border-white/5 bg-bg-overlay/45 p-3 text-t-sm text-text-muted">
          Agent state is still loading or temporarily unavailable.
        </div>
      </Panel>
    );
  }

  const runState = {
    active: Boolean(state.runState.active),
    roomCount: state.runState.roomCount ?? 0,
    roomsCleared: state.runState.roomsCleared ?? 0,
    currentHp: state.runState.currentHp ?? 0,
    currentMana: state.runState.currentMana ?? 0,
    maxHp: state.runState.maxHp ?? state.equipment.derivedStats.hp ?? 1,
    maxMana: state.runState.maxMana ?? state.equipment.derivedStats.mana ?? 1,
    hpPotionCharges: state.runState.hpPotionCharges ?? 0,
    manaPotionCharges: state.runState.manaPotionCharges ?? 0,
    powerPotionCharges: state.runState.powerPotionCharges ?? 0,
    dungeonLevel: state.runState.dungeonLevel ?? 0,
    equippedSlotCount: state.runState.equippedSlotCount ?? 0,
    requiredEquippedSlots: state.runState.requiredEquippedSlots ?? 0
  };

  const activeRunClass = runState.active ? "text-positive" : "text-text-muted";
  const maxHp = runState.maxHp;
  const maxMana = runState.maxMana;
  const hpPercent = maxHp > 0 ? Math.min(100, Math.max(0, (runState.currentHp / maxHp) * 100)) : 0;
  const manaPercent = maxMana > 0 ? Math.min(100, Math.max(0, (runState.currentMana / maxMana) * 100)) : 0;
  const eqSlots = Array.from({ length: 8 }, (_, index) => index);
  const slotMap = new Map<number, (typeof state.equipment.items)[number]>();
  for (const item of state.equipment.items) {
    slotMap.set(item.slot, item);
  }
  const derived = state.equipment.derivedStats;
  const inventory = getInventoryRow(state);

  const currentEpoch = claims?.allEpochs?.find((row) => row.epochId === claims?.allEpochs?.[0]?.epochId);
  const epochClaim = currentEpoch ? (currentEpoch.eligible ? "eligible" : "below cutoff") : "unknown";

  return (
    <Panel title="MY AGENT" className="h-full">
      <div className="space-y-3 text-t-sm">
        <section className="rounded border border-white/5 bg-bg-overlay/45 p-2">
          <div className="mb-1 text-t-base font-semibold text-text-bright">{state.character.name} · L{state.character.bestLevel}</div>
          <div className="text-text-muted">
            ID #{state.character.characterId} · <Address value={selected.owner} />
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-t-xs uppercase tracking-[0.08em] text-text-secondary">Dungeon State</h3>
          <div className="grid gap-1">
            <div className="flex items-center justify-between text-text-muted">
              <span>State</span>
              <span className={activeRunClass}>{runState.active ? "ACTIVE" : "IDLE"}</span>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between"><span>HP</span><span>{runState.currentHp}/{maxHp}</span></div>
              <div className="progress-track"><div className="progress-fill bg-warning" style={{ width: `${hpPercent}%` }} /></div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between"><span>Mana</span><span>{runState.currentMana}/{maxMana}</span></div>
              <div className="progress-track"><div className="progress-fill bg-info" style={{ width: `${manaPercent}%` }} /></div>
            </div>
            <dl className="grid grid-cols-2 gap-2 text-text-muted">
              <div className="flex justify-between"><dt>Rooms</dt><dd>{runState.roomsCleared}/{runState.roomCount}</dd></div>
              <div className="flex justify-between"><dt>Dungeon</dt><dd>L{runState.dungeonLevel}</dd></div>
              <div className="flex justify-between"><dt>Slots</dt><dd>{runState.equippedSlotCount}/{runState.requiredEquippedSlots}</dd></div>
              <div className="flex justify-between"><dt>Epoch cutoff</dt><dd className={epochClaim === "eligible" ? "text-positive" : "text-warning"}>{epochClaim}</dd></div>
            </dl>
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-t-xs uppercase tracking-[0.08em] text-text-secondary">Potions</h3>
          <div className="grid grid-cols-3 gap-2 rounded border border-white/5 p-2 text-text-muted">
            <div className="flex justify-between"><span>HP</span><span>{formatPotionState(runState.hpPotionCharges)}</span></div>
            <div className="flex justify-between"><span>Mana</span><span>{formatPotionState(runState.manaPotionCharges)}</span></div>
            <div className="flex justify-between"><span>Pow</span><span>{formatPotionState(runState.powerPotionCharges)}</span></div>
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-t-xs uppercase tracking-[0.08em] text-text-secondary">Equipment</h3>
          <div className="grid grid-cols-2 gap-1 text-t-xs">
            {eqSlots.map((slot) => {
              const item = slotMap.get(slot);
              return (
                <div
                  key={slot}
                  className="panel-code min-h-12 border border-white/5 bg-bg-overlay/55 p-2"
                >
                  <div className="font-semibold text-text-bright">{SLOT_LABELS[slot] ?? `S${slot + 1}`}</div>
                  {item ? (
                    <>
                      <div>T{item.tier}</div>
                      <div className={item.set === null ? "text-text-muted" : "text-accent"}>Set {item.set ?? "-"}</div>
                    </>
                  ) : (
                    <div className="text-text-muted">Empty</div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="text-text-muted">Set summary: {formatSetSummary(derived.setCounts)}</div>
        </section>

        <section className="space-y-2">
          <h3 className="text-t-xs uppercase tracking-[0.08em] text-text-secondary">Inventory</h3>
          <dl className="grid gap-1">
            <div className="flex justify-between"><dt>Stones</dt><dd>{formatNumber(inventory.stones)}</dd></div>
            <div className="flex justify-between"><dt>Potions</dt><dd>{inventory.potions}</dd></div>
            <div className="flex justify-between"><dt>MMO</dt><dd>{inventory.mmo} MMO</dd></div>
            <div className="flex justify-between"><dt>MON</dt><dd>{inventory.mon} MON</dd></div>
            <div className="flex justify-between"><dt>Lootbox</dt><dd>{inventory.lootboxes}</dd></div>
          </dl>
        </section>
      </div>
    </Panel>
  );
}
