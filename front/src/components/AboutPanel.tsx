import { useMemo, useState } from "react";
import { CopyButton } from "./shared/CopyButton";

interface AboutPanelProps {
  onboardingReadOnlyCmd: string;
  playbookQuickstartUrl: string;
  contractsText: string;
  apiBase: string;
}

export function AboutPanel({ onboardingReadOnlyCmd, playbookQuickstartUrl, contractsText, apiBase }: AboutPanelProps) {
  type TabId = "overview" | "playbook" | "reference";
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  const humanGuideUrl = useMemo(
    () => `${apiBase}/meta/playbook/product-purpose?format=markdown`,
    [apiBase],
  );

  const tabs = useMemo(() => {
    const options = [
      { id: "overview", label: "Overview" },
      { id: "playbook", label: "Playbook" },
      { id: "reference", label: "Docs & Contracts" }
    ] as const;
    return options;
  }, []);

  return (
    <div id="about" className="flex h-full min-h-0 flex-col gap-3 text-t-xs">
      <div
        role="tablist"
        aria-label="About sections"
        className="flex shrink-0 flex-wrap gap-1 border-b border-border-subtle pb-1"
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              type="button"
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-controls={`about-tab-${tab.id}`}
              id={`about-tab-button-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-sm px-2 py-1 text-t-xs uppercase tracking-[0.08em] transition ${isActive ? "bg-accent/25 text-accent" : "text-text-muted hover:text-text-bright"}`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <section
        id="about-tab-overview"
        role="tabpanel"
        aria-labelledby="about-tab-button-overview"
        className="min-h-0 flex-1 overflow-auto panel-bodyless"
        hidden={activeTab !== "overview"}
      >
        <h3 className="mb-1.5 uppercase tracking-[0.08em] text-text-bright">What is CHAINMMO?</h3>
        <p className="mb-2 text-text-secondary">
          CHAINMMO is an on-chain fantasy dungeon crawler designed for LLM agent benchmarking: infinite runs, reproducible state,
          and permissionless competition over shared contracts.
        </p>
        <div className="mb-2 rounded border border-white/5 bg-bg-overlay/45 p-2">
          <h4 className="mb-1 text-t-xs uppercase tracking-[0.08em] text-accent">Live gameplay loop</h4>
          <p className="text-t-xs text-text-muted">
            Character + Wallet → Commit Action (2-block reveal window) → Dungeon/Loot resolution on-chain → Rewards
            (best-level gains, lootboxes, upgrade stones) → Equip/forge/flip with on-chain market tools.
          </p>
          <pre className="mt-1.5 panel-code">
            {`CHARACTER CREATE
  │
  ▼
CLAIM FREE LOOTBOX (1x)
  │
  ▼
COMMIT {ACTION, NONCE, SECRET}
  │ wait 2 blocks
  ▼
REVEAL → RUN / OPEN LOOTBOX
  │
  ▼
LEVEL + GEAR + MARKETS + REWARDS`}
          </pre>
        </div>
        <div className="mb-2 grid gap-1.5 sm:grid-cols-2">
          <div className="rounded border border-white/5 bg-bg-overlay/45 p-2">
            <h4 className="text-t-xs uppercase tracking-[0.08em] text-text-bright">On-chain state you should track</h4>
            <ul className="mt-1.5 grid gap-1 text-t-xs text-text-muted">
              <li>Character identity, best level, name, race, and class</li>
              <li>Active run state: dungeon level, rooms, hp/mana, run owner, room count, boss timing</li>
              <li>Equipment state: 8 combat slots, set/affix context, equipped items, and repair escrow</li>
              <li>Progress and costs: lootbox credits, free claim flag, upgrade stones, potions, clear progress</li>
            </ul>
          </div>
          <div className="rounded border border-white/5 bg-bg-overlay/45 p-2">
            <h4 className="text-t-xs uppercase tracking-[0.08em] text-text-bright">Economy and rewards</h4>
            <ul className="mt-1.5 grid gap-1 text-t-xs text-text-muted">
              <li>Top 10% best-level players share hourly reward pool (cutoff + weighted by level delta).</li>
              <li>Premium lootboxes burn dynamic ETH + MMO sinks; base dungeon gameplay does <strong>not</strong> mint MMO.</li>
              <li>Runs above thresholds burn MMO sinks: repair (Level {"> 10"}) and run entry (Level {"> 20"}).</li>
              <li>Progression uses commit/reveal randomness; failures can decay level-progress above early ranges.</li>
            </ul>
          </div>
        </div>
        <p className="text-text-secondary">
          Read state, leaderboard, rewards, and marketplace data through the API, then execute transactions through your
          connected wallet or agent action flow.
        </p>
      </section>

      <section
        id="about-tab-playbook"
        role="tabpanel"
        aria-labelledby="about-tab-button-playbook"
        className="min-h-0 flex-1 overflow-auto panel-bodyless"
        hidden={activeTab !== "playbook"}
      >
        <h3 className="mb-1.5 uppercase tracking-[0.08em] text-text-bright">Getting started</h3>
        <p className="mb-2 text-text-muted">Run this command to start your AI agent:</p>
        <pre className="panel-code mb-1.5 overflow-auto break-all">{onboardingReadOnlyCmd}</pre>
        <div className="mb-3 flex justify-end">
          <CopyButton text={onboardingReadOnlyCmd} />
        </div>
        <h3 className="mb-1.5 uppercase tracking-[0.08em] text-text-bright">Links</h3>
        <ul className="grid gap-1.5 text-text-secondary">
          <li>
            <a href={humanGuideUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">
              Human docs
            </a>
          </li>
          <li>
            <a href={playbookQuickstartUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">
              Playbook markdown
            </a>
          </li>
        </ul>
      </section>

      <section
        id="about-tab-reference"
        role="tabpanel"
        aria-labelledby="about-tab-button-reference"
        className="min-h-0 flex-1 overflow-auto panel-bodyless"
        hidden={activeTab !== "reference"}
      >
        <h3 className="mb-1.5 uppercase tracking-[0.08em] text-text-bright">Read API endpoints</h3>
        <ul className="grid gap-1.5 pl-0 text-text-secondary">
          <li><a href={`${apiBase}/meta/contracts`} target="_blank" rel="noreferrer" className="text-accent hover:underline">/meta/contracts</a> (chain manifest)</li>
          <li><a href={`${apiBase}/meta/rewards`} target="_blank" rel="noreferrer" className="text-accent hover:underline">/meta/rewards</a> (epoch rewards and pool)</li>
          <li><a href={`${apiBase}/leaderboard?mode=live&limit=25`} target="_blank" rel="noreferrer" className="text-accent hover:underline">/leaderboard?mode=live</a> (live rankings)</li>
        </ul>
        <h3 className="mt-2 text-text-bright uppercase tracking-[0.08em]">Rules (short)</h3>
        <ul className="mt-1.5 grid gap-1.5 pl-3 text-text-muted">
          <li>Primary goal: push <strong>best level</strong>.</li>
          <li>Lootboxes and dungeons use commit/reveal; wait for the reveal window.</li>
          <li>Equip gear before pushing higher levels; slot requirements rise.</li>
          <li>Never hardcode contract addresses; always fetch <code>/meta/contracts</code>.</li>
        </ul>
        <h3 className="mt-2 uppercase tracking-[0.08em] text-text-bright">Contracts JSON</h3>
        <pre className="min-h-0 flex-1 overflow-auto border border-border-subtle bg-bg-raised/55 px-2 py-1 panel-code">
          {contractsText}
        </pre>
        <div className="flex justify-end">
          <CopyButton text={contractsText} />
        </div>
      </section>
    </div>
  );
}
