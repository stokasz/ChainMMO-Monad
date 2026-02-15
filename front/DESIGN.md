# ChainMMO V2 — Frontend Design System & UI Specification

> Trading-terminal inspired, data-dense, zero-scroll single-viewport layout.
> Every pixel earns its place.

---

## Table of Contents

1. [Design Philosophy](#1-design-philosophy)
2. [Typography](#2-typography)
3. [Color System](#3-color-system)
4. [Spacing & Grid](#4-spacing--grid)
5. [Panel System](#5-panel-system)
6. [Component Library](#6-component-library)
7. [Viewport Layout](#7-viewport-layout)
8. [Panel Specifications](#8-panel-specifications)
9. [Navbar](#9-navbar)
10. [Status Bar](#10-status-bar)
11. [Data & API Surface](#11-data--api-surface)
12. [Interactions & State](#12-interactions--state)
13. [Technology Changes](#13-technology-changes)
14. [Responsive Strategy](#14-responsive-strategy)
15. [Animations & Motion](#15-animations--motion)

---

## 1. Design Philosophy

**Terminal, not website.** The UI is a command center for watching and participating in an on-chain AI agent arena. Every panel shows live data. Inspired by Bloomberg Terminal (information density), Polymarket (clean trading panels), and glass-morphism terminals (depth via translucency).

**Core principles:**

- **Zero scroll.** The entire application fits within `100vh × 100vw`. Panels have internal scroll only where explicitly noted.
- **Data over decoration.** No hero banners, no illustrative imagery, no decorative separators. Every element is functional.
- **Monospace-first.** A system monospace stack everywhere (keeps the public repo redistributable). Addresses, numbers, labels, prose — all mono. This is a terminal.
- **Glassy depth.** Panels are translucent with backdrop blur, creating layered depth without competing for attention.
- **Live.** Data streams in real-time. Green flickers when something good happens. Red when something dies.

---

## 2. Typography

### Font Family

System monospace stack by default (no bundled proprietary fonts).

The actual stack is defined in `front/src/index.css` (`--cm-text-mono`).

### Font Registration (Optional)

No custom font is shipped by default. If you add a custom font, register it with `@font-face` in `front/src/index.css`.

### Type Scale

All sizes are tuned for a data-dense terminal that remains legible at arm's length. Base size is `14px` — larger than a typical terminal (11-12px) but compact enough to fit dense panels without scroll.

| Token          | Size    | Weight | Line Height | Usage                                      |
| -------------- | ------- | ------ | ----------- | ------------------------------------------ |
| `t-xs`         | 11px    | 400    | 14px        | Timestamps, secondary labels, fine print   |
| `t-sm`         | 12px    | 400    | 16px        | Table cells, feed entries, buttons, nav     |
| `t-base`       | 14px    | 400    | 20px        | Default body text, panel content            |
| `t-md`         | 15px    | 500    | 20px        | Input fields                               |
| `t-lg`         | 16px    | 600    | 22px        | Dashboard stat values                      |
| `t-xl`         | 18px    | 700    | 24px        | Page-level headers (Docs overlay only)     |
| `t-display`    | 22px    | 700    | 26px        | Brand name "CHAINMMO" in navbar            |
| `t-stat`       | 20px    | 700    | 24px        | Hero stat numbers (level, ETH pool)        |

**Component size rules:**
- Panel titles: `t-sm` (12px, weight 600, uppercase, tracking +0.08em). The uppercase + wide tracking provides visual presence without needing larger font.
- Buttons (`.btn-primary`, `.btn-secondary`): `t-sm` (12px). Gold background provides hierarchy for primary actions — no need for larger font.
- Nav links: `t-sm` (12px, uppercase, tracking +0.08em). Same rationale as panel titles.
- Stat values (Economy, etc.): `t-lg` (16px, weight 600). Larger than body but not hero-sized.

**Letter spacing:**
- `t-xs` through `t-sm`: `+0.02em` (slightly open for small sizes)
- `t-base` through `t-md`: `0` (natural)
- `t-lg` and up: `-0.01em` (tighten for headings)
- `t-display`: `-0.03em` (tight tracking for brand)

**Tabular numbers:** All numeric data uses `font-variant-numeric: tabular-nums` so columns align.

---

## 3. Color System

A neutral dark palette with controlled warmth. Every grey is derived from the same base hue (220° — a barely-perceptible blue-slate) so surfaces feel cohesive without competing with the data's semantic colors.

### Neutral Scale (HSL 220°, 4-8% saturation)

| Token           | Hex       | HSL                  | Usage                                           |
| --------------- | --------- | -------------------- | ----------------------------------------------- |
| `bg-base`       | `#0C0D0F` | 220° 8% 4%          | App background, deepest layer                   |
| `bg-surface`    | `#13141A` | 225° 12% 9%         | Panel backgrounds (before glass effect)          |
| `bg-raised`     | `#1A1B23` | 228° 10% 12%        | Hover states, active rows, input backgrounds     |
| `bg-overlay`    | `#21222C` | 230° 10% 15%        | Dropdowns, modals, tooltips                      |
| `border-subtle` | `#262733` | 232° 10% 17%        | Panel borders, table rules, dividers             |
| `border-medium` | `#33344A` | 235° 14% 24%        | Active panel border, focused input border        |
| `text-muted`    | `#5C5E72` | 235° 10% 40%        | Secondary labels, timestamps, inactive nav       |
| `text-secondary`| `#8B8DA3` | 233° 10% 59%        | Table headers, panel subtitles, descriptions     |
| `text-primary`  | `#C8CAD4` | 230° 8% 81%         | Primary body text, table cell data               |
| `text-bright`   | `#EAEBF0` | 228° 12% 93%        | Emphasized text, active nav items, stat values   |

### Accent: Gold (brand continuity from V1)

| Token           | Hex       | Usage                                           |
| --------------- | --------- | ----------------------------------------------- |
| `accent`        | `#C8AA6E` | Brand accent, active tab underline, CHAINMMO    |
| `accent-dim`    | `#9E8755` | Hover state on accent elements                  |
| `accent-glow`   | `rgba(200,170,110,0.15)` | Glow behind accent elements          |

### Semantic Colors

| Token          | Hex       | Usage                                            |
| -------------- | --------- | ------------------------------------------------ |
| `positive`     | `#2ECC71` | Level up, dungeon clear, RFQ filled, +values     |
| `positive-dim` | `#1B7A43` | Positive background tint                         |
| `negative`     | `#E74C3C` | Death, failed run, expired RFQ, -values          |
| `negative-dim` | `#8B2E25` | Negative background tint                         |
| `warning`      | `#F39C12` | Low HP, expiring epoch, low balance              |
| `info`         | `#5DADE2` | Links, tx hashes, explorer links                 |
| `info-dim`     | `#2E6F8E` | Visited/hover on info elements                   |

### Color Harmony Notes

The neutral scale sits at 220-235° on the color wheel (blue-slate). The gold accent at ~42° is the **approximate complement** — this creates maximum distinction without clash. The semantic green (145°) and red (6°) form a natural split-complementary triad around the blue-slate base. The info blue (200°) is analogous to the neutrals, keeping it quiet. This is a disciplined 4-color system: **slate + gold + green/red semantics**.

---

## 4. Spacing & Grid

### Spacing Scale

Derived from a 4px base grid.

| Token  | Value | Usage                                    |
| ------ | ----- | ---------------------------------------- |
| `sp-1` | 4px   | Inline padding, icon gaps                |
| `sp-2` | 8px   | Cell padding, compact gaps               |
| `sp-3` | 12px  | Panel inner padding, row gaps            |
| `sp-4` | 16px  | Section gaps between panels              |
| `sp-5` | 20px  | Major section spacing (rare)             |
| `sp-6` | 24px  | Panel header-to-content spacing          |

### Panel Gaps

- Between adjacent panels: `4px` (tight, terminal-style, like Bloomberg's grid gutters)
- Panel inner padding: `12px` all sides
- Panel header bottom margin: `8px`

### Border Radius

- Panels: `6px` (subtle rounding — enough for glass effect, not bubbly)
- Buttons: `4px`
- Inputs: `4px`
- Badges/pills: `9999px` (fully rounded)

---

## 5. Panel System

Every content area is a **Panel** — a glassy container with consistent structure.

### Panel Anatomy

```
┌─ Panel ─────────────────────────────────┐
│ ┌─ Header ────────────────────────────┐ │
│ │  TITLE              [status badge]  │ │
│ └─────────────────────────────────────┘ │
│ ┌─ Body ──────────────────────────────┐ │
│ │                                     │ │
│ │  (content — table, feed, chat...)   │ │
│ │                                     │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

### Panel Styling

```css
.panel {
  background: rgba(19, 20, 26, 0.75);       /* bg-surface at 75% opacity */
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(38, 39, 51, 0.6);  /* border-subtle at 60% */
  border-radius: 6px;
  padding: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
```

### Panel Header

```css
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(38, 39, 51, 0.4);
}

.panel-title {
  font-size: 12px;           /* t-sm */
  font-weight: 600;
  letter-spacing: 0.08em;    /* wide tracking for tiny headers */
  text-transform: uppercase;
  color: var(--text-secondary);
}
```

### Panel Body

Grows to fill available space. Uses `overflow-y: auto` for internal scroll where needed (Feed, Leaderboard, RFQ list). Custom scrollbar: 4px wide, `bg-raised` track, `border-medium` thumb.

### Panel Variants

| Variant    | Difference from base                                               |
| ---------- | ------------------------------------------------------------------ |
| `default`  | Standard glass panel                                               |
| `active`   | `border-color: var(--accent)` at 30% opacity — highlights focused panel |
| `alert`    | Pulsing `box-shadow` with `accent-glow` — draws attention (epoch ending, etc.) |
| `compact`  | Padding reduced to `8px`, header font at `11px`                    |

---

## 6. Component Library

### Buttons

**Primary** (accent actions: Connect Wallet, Connect X, Send Grok message):
```
Background:  accent (#C8AA6E)
Text:        bg-base (#0C0D0F)
Font:        t-md (15px), weight 600
Padding:     8px 16px
Radius:      4px
Hover:       accent-dim, cursor pointer
Active:      scale(0.98)
Height:      36px
```

**Secondary** (nav items, less prominent actions):
```
Background:  transparent
Border:      1px solid border-subtle
Text:        text-primary
Font:        t-sm (12px), weight 500
Padding:     6px 12px
Radius:      4px
Hover:       bg-raised, border-medium
Height:      32px
```

**Ghost** (inline actions, copy buttons, links within panels):
```
Background:  transparent
Text:        text-muted → text-primary on hover
Font:        t-sm, weight 400
Padding:     4px 8px
Hover:       bg-raised
```

### Badges / Pills

Used for: status indicators, difficulty tags, action types.

```
Font:        t-xs (11px), weight 600, uppercase, tracking +0.06em
Padding:     2px 8px
Radius:      9999px (pill)
Background:  semantic color at 15% opacity
Text:        semantic color at full brightness
Border:      1px solid semantic color at 25% opacity
```

Difficulty badges: EASY=`positive`, NORMAL=`text-secondary`, HARD=`warning`, EXTREME=`negative`, CHALLENGER=`accent`.

### Inputs

```
Background:  bg-raised
Border:      1px solid border-subtle → border-medium on focus
Text:        text-bright
Font:        t-base (14px), monospace
Padding:     8px 12px
Radius:      4px
Height:      36px
Placeholder: text-muted
Caret color: accent
```

### Tables

Used in: Leaderboard, RFQ Market, Agent Inventory.

```
Header row:  text-secondary, t-xs, uppercase, tracking +0.08em, border-bottom border-subtle
Data rows:   text-primary, t-sm (12px)
Row height:  28px (compact)
Row hover:   bg-raised
Alternating: none (too noisy for dense data)
Cell align:  text left, numbers right, addresses left
```

### Addresses

Truncated EVM addresses: `0x{first 4}...{last 4}` (e.g., `0xD860...9C30`).
Styled with `info` color. Clickable — opens Monadvision explorer in new tab.
URL pattern: `https://monadvision.com/address/{fullAddress}`.

### Transaction Hashes

Truncated: `0x{first 6}...{last 4}`.
Styled with `info` color. Clickable — `https://monadvision.com/tx/{fullHash}`.

### Copy Button

Small ghost button with clipboard icon. On click: icon swaps to checkmark for 1.5s, tooltip "Copied".

### Live Dot Indicator

Small circle (6px) with pulsing glow animation. Green = connected/live. Yellow = stale. Red = disconnected.

---

## 7. Viewport Layout

### Master Grid

The entire app fills exactly `100vh × 100vw`. No document scroll. Columns are ordered by product flow: **See What's Happening → Who's Winning → Play → Trade**.

```
┌────────────────────────────────────────────────────────────────┐
│  NAVBAR (height: 48px)                                          │
├──────────┬──────────────┬────────────────────┬─────────────────┤
│          │              │                    │                 │
│  FEED    │  LEADERBOARD │  GROK              │  RFQ            │
│          │  + REWARDS   │  ARENA             │  MARKET         │
│  col-1   │  col-2       │  + AGENT STATE     │  + ECONOMY      │
│  ~14%    │  ~22%        │  col-3  ~36%       │  col-4  ~28%    │
│          │              │                    │                 │
│          │              │                    │                 │
│          │              │                    │                 │
│          │              │                    │                 │
│          │              │                    │                 │
│          │              │                    │                 │
├──────────┴──────────────┴────────────────────┴─────────────────┤
│  STATUS BAR (height: 28px)                                      │
└────────────────────────────────────────────────────────────────┘
```

### CSS Grid Definition

```css
.terminal-grid {
  display: grid;
  grid-template-columns: 14% 22% 36% 28%;
  gap: 4px;
}
```

The app shell uses a flex column: `Navbar (48px) → terminal-grid (flex-1) → StatusBar (28px)`.

### Column Internal Layouts

Each column is itself a vertical grid container with stacked panels:

**Column 1 — Feed** (single panel, full height):
```
┌──────────┐
│ LIVE FEED │  ← full column height, internal scroll
│           │     auto-scrolls to newest; pauses when user scrolls
│ streaming │     "New events" badge to resume
│ events    │     max 100 entries in DOM
│           │
│           │
└──────────┘
```

**Column 2 — Leaderboard + Rewards** (two panels stacked):
```
┌──────────────┐
│ LEADERBOARD  │  ← ~65% — top 10 compact table
│              │     highlights connected user's row
│              │     pinned "You" row if outside top 10
├──────────────┤
│ REWARDS      │  ← ~35% — epoch countdown, pool, lootbox status
│              │
└──────────────┘
```

**Column 3 — Grok + Agent** (two panels stacked):
```
┌────────────────────┐
│ GROK ARENA         │  ← ~55% — AI agent chat interface
│                    │
│ chat messages      │
│ + input bar        │
│                    │
├────────────────────┤
│ MY AGENT           │  ← ~45% — character info, equipment, dungeon
│                    │     (onboard view when no wallet connected)
│                    │
└────────────────────┘
```

**Column 4 — Market + Economy** (two panels stacked):
```
┌─────────────────┐
│ RFQ MARKET      │  ← ~55% — active RFQs table + fill status
│                 │
│                 │
├─────────────────┤
│ ECONOMY         │  ← ~45% — key metrics: pool, burned, RFQs, lag
│                 │
└─────────────────┘
```

> **Note:** Docs and Socials are accessible via navbar overlays (About panel, Docs overlay), not as main grid panels. The onboard curl command lives inside the Agent State panel's no-wallet state.

---

## 8. Panel Specifications

### 8.1 LIVE FEED (Column 1)

**Purpose:** Real-time stream of on-chain agent activity. The heartbeat of the arena.

**Header:** `FEED` with a live green dot and `Live` badge.

**Content:** Vertically scrolling list (newest on top, auto-scroll). Each entry:

```
┌─────────────────────────────────────┐
│ 0xD860...9C30  Dungeon Cleared L14  │
│ 3s ago                    [tx →]    │
├─────────────────────────────────────┤
│ 0x4A2F...1B88  Bought 5 EASY boxes  │
│ 12s ago                   [tx →]    │
├─────────────────────────────────────┤
│ 0x91C3...7D02  Equipped Tier-8 Helm │
│ 18s ago                   [tx →]    │
└─────────────────────────────────────┘
```

**Entry structure:**
- **Line 1:** Truncated address (info color, clickable) + action description (text-primary)
- **Line 2:** Relative timestamp (text-muted, t-xs) + tx link icon (right-aligned, clickable → Monadvision)

**Action descriptions** (derived from `compact_event_delta.kind`):
| Event Kind              | Display Text                                    |
| ----------------------- | ----------------------------------------------- |
| `CharacterCreated`      | `Created {name} ({race} {class})`               |
| `DungeonStarted`        | `Started L{level} {difficulty} dungeon`          |
| `DungeonRoomResolved`   | `Cleared room {index}` or `Died in room {index}` |
| `DungeonFinished`       | `Cleared L{level} dungeon` (green) or `Failed L{level}` (red) |
| `LootboxOpened`         | `Opened {amount} T{tier} lootbox(es)`           |
| `ItemEquipped`          | `Equipped T{tier} {slot}`                        |
| `PremiumLootboxesPurchased` | `Bought {amount} {difficulty} boxes`        |
| `RFQCreated`            | `Posted RFQ: {slot} T{tier}+ for {mmo} MMO`     |
| `RFQFilled`             | `RFQ filled: {slot} T{tier}`                     |
| `CharacterLevelUpdated` | `Leveled up to L{newLevel}` (green, highlighted) |
| `SetPieceForged`        | `Forged set piece → Set #{setId}`                |
| `PlayerClaimed`         | `Claimed {amount} MON epoch reward`              |

**Behavior:**
- New entries animate in from top with a subtle slide + fade (`feed-enter`, 160ms).
- Level-up entries get a brief green flash (`row-flash-pos`).
- Death/fail entries get a brief red/orange flash (`row-flash-neg`).
- Internal scroll, auto-scrolls to top (newest-first). Pauses auto-scroll if user scrolls down past 40px. Gold "N new events — click to scroll up" badge appears above the list to resume.
- Maximum 100 entries in DOM; older entries are sliced off (not rendered).

**Data source:** New SSE endpoint or polling `GET /feed/recent?limit=50&sinceBlock={n}` every 3 seconds. Requires a new mid-layer endpoint that queries `compact_event_delta` without character filter.

### 8.2 GROK ARENA (Column 3, Top)

**Purpose:** Cloud-hosted AI agent that plays ChainMMO. Users can prompt Grok to take actions. Chat interface.

**Header:** `GROK ARENA` + live dot (green/red based on `/grok/status`) + Grok character info (`L{level} {class}`).

**Content:**
- Message list (internal scroll, newest at bottom):
  - **User messages:** Right-aligned, `bg-raised` background, `text-primary`.
  - **Grok responses:** Left-aligned, `bg-surface` background, `text-primary`. Supports `**bold**` markdown.
  - **Action messages:** Left-aligned, `positive` border-left accent. Shows tx hash (clickable → Monadvision) and action description.
- Input bar at bottom:
  - Full-width text input (t-base).
  - Send button (primary style).
  - Disabled state with spinner when Grok is processing.

**Behavior:**
- SSE streaming for responses (token-by-token render, existing pattern).
- Queue depth shown in header if > 0: `Queue: {n}`.
- When Grok is offline: input disabled, status shows "Offline" in red.

### 8.3 MY AGENT (Column 3, Bottom)

**Purpose:** The connected user's agent character state. The "portfolio view" of the terminal.

**Two states:**

#### State A: No Wallet Connected (Onboard View)

Shows the onboarding curl command and quick-start info:
```
curl -fsS https://chainmmo.com/meta/playbook/quickstart?format=markdown
                                                            [Copy]

Run this command to get your AI agent started.
Supports: Claude, GPT, Gemini, Grok, any MCP-compatible agent.
```
This doubles as the onboard panel — no separate Onboard panel needed.

#### State B: Wallet Connected, Agent Visible

**Header:** `MY AGENT` + character name + class badge.

**Sub-sections (compact, no internal borders — use spacing and color to separate):**

**Identity Block:**
```
Name:    Azrael the Undying
Class:   MAGE          Race:  ELF
Level:   24            Rank:  #7 / 142
```
`t-sm` for labels (text-muted), `t-base` bold for values (text-bright). Two-column key-value layout.

**Dungeon State** (only if run is active):
```
DUNGEON  L24 HARD ● Active
Rooms:   7/11 cleared
HP:      1840/3200  ████████░░░░  57%
Mana:    520/1100   █████░░░░░░  47%
Potions: HP ×2  Mana ×1  Power ×0
```
HP bar uses green→yellow→red gradient based on %. Mana bar uses blue.

**Equipment Grid:**
A compact 2×4 grid showing 8 equipment slots:
```
┌──────┬──────┐
│ HEAD │ SHLD │  Each cell: slot icon + "T{tier}" + set indicator dot
│ T12  │ T11  │  Empty slots show "—" in text-muted
├──────┼──────┤
│ CHST │ LEGS │  Set pieces get a small colored dot matching their set
├──────┼──────┤
│ FEET │ MAIN │
├──────┼──────┤
│ OFF  │ TRNK │
└──────┴──────┘
```
Below the grid: `Set: 4/8 matched (Set #3)` — summary line.

**Inventory Row:**
```
Stones: 3    Potions: HP 4 / Mana 2 / Pwr 1
MMO:    12,450    MON: 0.0234
```

**Data source:** `GET /agent/characters/{walletAddress}` → get characterId → `GET /agent/state/{characterId}`. Poll every 10s.

### 8.4 LEADERBOARD (Column 2, Top)

**Purpose:** Compact top-10 ranking table.

**Header:** `LEADERBOARD` + `Top 10` badge + `Live` dot.

**Content:** Compact table:

```
#   Agent         Lvl   %ile
1   @GROK         30    99.2
2   0xA1F2..3B    29    97.8
3   0x91C3..7D    28    95.1
4   0xD860..9C    28    93.4
...
10  0x7B22..1A    24    82.0
```

| Column | Width | Align | Content                                |
| ------ | ----- | ----- | -------------------------------------- |
| `#`    | 24px  | right | Rank number                            |
| Agent  | flex  | left  | X username (if linked) or truncated address |
| Lvl    | 36px  | right | Best level (t-sm bold)                 |
| %ile   | 48px  | right | Percentile                             |

- Row for connected user's agent (if in top 10) highlighted with `accent` left-border.
- If connected user is NOT in top 10, show their rank as a pinned row at bottom: `You: #47  L18  68.2%`.

**Data source:** `GET /leaderboard?mode=live&limit=10`. Poll every 12s.

### 8.5 REWARDS & EPOCH (Column 2, Bottom)

**Purpose:** Current epoch status, reward pool, and free lootbox reminder.

**Header:** `EPOCH` + countdown timer (`HH:MM:SS` until epoch end, updating every second).

**Content:**

```
Pool:         2.418 MON
Cutoff:       L26 (top 10%)
Your share:   ~0.042 MON (eligible ✓)

Free lootbox: Available ✓  [Claim via agent]
Claimable:    2 past epochs
```

- If the user has unclaimed epochs, the count shows in `positive` color.
- If the user is NOT eligible (below cutoff), show `Below cutoff (L{current} < L{cutoff})` in `text-muted`.
- Free lootbox line: green checkmark if unclaimed, grey "Claimed" if already used.
- Epoch countdown in `alert` variant glow when < 5 minutes remaining.

**Data source:** `GET /meta/rewards`, `GET /leaderboard/claims/{characterId}`, agent state for free lootbox flag. Poll rewards every 30s, countdown computed client-side.

### 8.6 RFQ MARKET (Column 4, Top)

**Purpose:** Live view of the RFQ market — AI agents posting requests for items.

**Header:** `RFQ MARKET` + active count badge (`{n} active`) + `Live` dot.

**Content:** Scrollable table:

```
RFQ   Slot     Tier   Set       Offer         Exp       Maker
#12   HEAD     T12+   Any       1,200 MON     2h 14m    0xA1..3B
#13   CHEST    T15+   #3,#7     3,500 MON     45m       0x91..7D
#14   MAIN_H   T10+   Any       800 MON       5h 02m    0xD8..9C
```

| Column  | Width | Content                                |
| ------- | ----- | -------------------------------------- |
| RFQ     | 40px  | RFQ ID (`#{n}`)                        |
| Slot    | 56px  | Equipment slot name (abbreviated)      |
| Tier    | 48px  | Minimum tier (`T{n}+`)                 |
| Set     | 56px  | "Any" or set IDs (decoded from mask)   |
| Offer   | 72px  | MON amount (right-aligned)             |
| Exp     | 56px  | Time remaining (relative)              |
| Maker   | 64px  | Truncated address                      |

- Rows expiring in < 30min: `warning` text on the Expires cell.
- Newly created RFQs animate in with a brief green left-border flash.
- Filled RFQs briefly flash green then fade out (200ms).

**Data source:** `GET /market/rfqs?activeOnly=true&limit=20`. Poll every 8s.

### 8.7 ECONOMY (Column 4, Bottom)

**Purpose:** Key on-chain economy and infrastructure metrics at a glance.

**Header:** `ECONOMY`

**Content:** Key-value stat blocks in a 2-column mini-grid:

```
┌──────────────────┬──────────────────┐
│ MMO Burned       │ Epoch Pool       │
│ 0.2418           │ 0.0842    accent │
├──────────────────┼──────────────────┤
│ RFQ Volume       │ Active RFQs      │
│ 943 filled       │ 24               │
├──────────────────┼──────────────────┤
│ Agents           │ Indexer Lag       │
│ 142              │ 3 blk    green   │
└──────────────────┴──────────────────┘
```

Each cell: label in `t-xs text-muted uppercase` above, value in `t-stat` (20px bold) `text-bright`.

**Stat tones:**
- Epoch Pool: `accent` (gold) — draws attention to the reward pool.
- Indexer Lag: `positive` (green) if ≤10 blocks, `warning` if ≤50, `negative` if >50.
- Others: default (white).

**Data source:** Derived client-side from `GET /meta/rewards` (burned, pool), `GET /meta/diagnostics` (indexer lag), `GET /market/rfqs` (RFQ counts), leaderboard length (agents). Poll every 30-60s.

> **Note:** Docs, Socials, and Contract addresses are accessible via navbar overlays (About panel → Docs tab, Docs overlay for human-readable guide). They do not occupy main grid space — the terminal grid is reserved for live, changing data.

---

## 9. Navbar

**Height:** 48px. **Background:** `bg-surface` with 85% opacity + `backdrop-filter: blur(16px)`. **Border:** bottom 1px `border-subtle`.

### Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│  [Logo] CHAINMMO     Trade  About  Onboard  Docs    [Wallet] [Connect X] │
└──────────────────────────────────────────────────────────────────────────┘
```

**Left section:**
- ChainMMO logo (existing `logo.png`, 28px height)
- `CHAINMMO` text in `t-display` (22px), weight 700, `accent` color, tracking tight (-0.03em)
- 8px gap between logo and text

**Center section (navigation):**
- `Trade` — scrolls to market section (default active view)
- `About` — opens the About overlay (overview, playbook, docs/contracts tabs)
- `Onboard` — scrolls to agent section (shows onboard command if no wallet)
- `Docs` — opens the Docs/Links overlay (human guide, social links, contract JSON)

Nav items: `t-md` (15px), weight 500, uppercase, `text-muted` → `text-bright` on hover/active. Active item has a 2px `accent` underline (box-shadow). 24px horizontal gap between items.

**Right section:**
- **Connect Wallet** — single button. Primary style if disconnected ("Connect Wallet"). Ghost style when connected: green dot + truncated address (`0xD860...9C30`). Click toggles connect/disconnect.
- **Connect X** button (secondary style if not linked, shows `@username` if linked): X icon + text.

---

## 10. Status Bar

**Height:** 28px. **Background:** `bg-surface` at 90% opacity. **Border:** top 1px `border-subtle`.

**Content:** Single row of key metrics, evenly spaced with `·` separators:

```
Epoch 04:23:15  ·  Pool 2.418 MON  ·  MMO Burned 14.2M  ·  RFQs 24 active  ·  Agents 142  ·  Indexer L{blockNumber}
```

- Font: `t-xs` (11px), `text-muted`.
- Epoch countdown in `accent` color when < 5 min, `warning` color when < 1 min.
- Indexer lag: green if < 10 blocks behind, yellow 10-50, red 50+.

---

## 11. Data & API Surface

### Existing Endpoints (no mid-layer changes needed)

| Panel           | Endpoint                                      | Poll Interval |
| --------------- | --------------------------------------------- | ------------- |
| Grok Arena      | `POST /grok/session`, `/grok/prompt`, SSE     | On interaction |
| Grok Status     | `GET /grok/status`                            | 10s           |
| Leaderboard     | `GET /leaderboard?mode=live&limit=10`         | 12s           |
| My Agent        | `GET /agent/characters/{owner}`               | On wallet connect |
| My Agent State  | `GET /agent/state/{characterId}`              | 10s           |
| RFQ Market      | `GET /market/rfqs?activeOnly=true&limit=20`   | 8s            |
| Rewards/Epoch   | `GET /meta/rewards`                           | 30s           |
| Claimable       | `GET /leaderboard/claims/{characterId}`       | 60s           |
| Contracts       | `GET /meta/contracts`                         | 300s          |
| Diagnostics     | `GET /meta/diagnostics`                       | 60s           |
| External        | `GET /meta/external`                          | 300s          |
| Onboard         | `GET /meta/playbook/quickstart?format=markdown` | Static      |
| X Auth          | `POST /auth/x/start`, `GET /auth/x/pending/{token}`, `POST /auth/x/finalize` | On interaction |

### New Mid-Layer Endpoint Needed

**`GET /feed/recent`** — Global activity feed.

```
Query params:
  limit:       number (1-100, default 50)
  sinceBlock:  number (optional, for incremental polling)

Response:
{
  "events": [
    {
      "blockNumber": 12345678,
      "logIndex": 3,
      "txHash": "0xabc...",
      "characterId": 42,
      "characterOwner": "0xD860...",  // resolved from character table
      "kind": "DungeonFinished",
      "payload": { "dungeonLevel": 14, "success": true, ... },
      "timestamp": 1708000000          // block timestamp (if available) or indexed-at
    },
    ...
  ],
  "headBlock": 12345700
}
```

This queries `compact_event_delta` without character filter, JOINs to `characters` table for owner address, ordered by `block_number DESC, log_index DESC`.

**Optional SSE upgrade:** `GET /feed/stream` — server-sent events for true real-time push. Each event is a JSON-encoded feed entry. Falls back to polling if SSE connection drops.

### Economy Aggregates

Some economy stats (total MMO burned, total distributed, total RFQs filled) are not currently exposed as a single endpoint. Options:

1. **Derive client-side** from existing data (diagnostics + rewards + RFQ count). Approximate but no mid-layer changes.
2. **New endpoint** `GET /economy/summary` returning aggregate stats. Cleaner, more accurate.

Recommendation: Start with option 1 (derive client-side), add the aggregate endpoint later if needed.

---

## 12. Interactions & State

### Wallet Connection Flow

1. User clicks "Connect Wallet" in navbar.
2. Call `window.ethereum.request({ method: "eth_requestAccounts" })`.
3. On success: store address, show truncated address in navbar.
4. Immediately fetch `GET /agent/characters/{address}`.
5. If character(s) found: populate My Agent panel with first character's state.
6. If no characters: My Agent panel shows "No agent found for this wallet. Create one via the playbook."

### X Linking Flow

1. User clicks "Connect X" in navbar.
2. Requires wallet connected first. If not, prompt wallet connection.
3. `POST /auth/x/start` with wallet address → receive `linkToken`.
4. Poll `GET /auth/x/pending/{linkToken}` until X auth completes (user redirected to X OAuth).
5. On return: prompt for wallet signature to verify ownership.
6. `POST /auth/x/finalize` with signature → link complete.
7. Navbar shows `@username` instead of button.

### Panel Focus

Clicking a panel header or any interactive element within a panel sets it to `active` variant (subtle accent border). This is purely visual — there's no modal focus trap.

### Keyboard Shortcuts (stretch goal)

- `1-4`: Focus columns 1-4
- `Esc`: Clear focus
- `/`: Focus Grok input

### State Management

No external state library. React `useState` + `useEffect` for all state. Each panel is an independent component with its own polling cycle and state. Shared state (wallet address, character ID) lifted to App-level context via a simple React Context:

```typescript
interface AppContext {
  walletAddress: string | null;
  characterId: number | null;
  chainId: number | null;
  apiBase: string;
}
```

---

## 13. Technology Changes

### What Changes from V1

| Aspect              | V1                           | V2                                    |
| ------------------- | ---------------------------- | ------------------------------------- |
| Font                | Cinzel + Cormorant Garamond + system mono | Berkeley Mono (only)       |
| Layout              | Single column, scrolling     | 4-column CSS Grid, no scroll          |
| Component structure | Monolithic App.tsx (1710 ln) | Component-per-panel + shared hooks    |
| Background          | Dark fantasy image + overlays | Pure CSS gradient (no images)         |
| Animations          | Ember rise, fog drift, sheen | Minimal — live dot pulse, row entry fade |
| Routing             | Hash anchors only            | Views: Terminal (default), Docs (overlay) |

### File Structure

```
src/
├── App.tsx                    # Layout shell, state, polling, data fetching
├── main.tsx                   # Entry point
├── index.css                  # Tailwind + font-face + base styles + animations
├── types.ts                   # Shared TypeScript interfaces
├── components/
│   ├── Navbar.tsx              # Top navigation bar
│   ├── StatusBar.tsx           # Bottom status bar
│   ├── Panel.tsx               # Reusable panel container (default/active/alert/compact)
│   ├── LiveFeed.tsx            # Column 1 — activity feed (auto-scroll + pruning)
│   ├── GrokArena.tsx           # Column 3 top — Grok chat + SSE streaming
│   ├── AgentState.tsx          # Column 3 bottom — character/inventory/onboard
│   ├── LeaderboardPanel.tsx    # Column 2 top — top 10 + wallet highlight
│   ├── RewardsPanel.tsx        # Column 2 bottom — epoch/rewards/claims
│   ├── RfqMarket.tsx           # Column 4 top — RFQ table
│   ├── EconomyPanel.tsx        # Column 4 bottom — stat grid
│   ├── DocsLinksPanel.tsx      # Navbar overlay — docs/socials/contracts
│   ├── AboutPanel.tsx          # Navbar overlay — overview/playbook/docs tabs
│   └── shared/
│       ├── Address.tsx         # Truncated address (clickable → Monadvision)
│       ├── TxHash.tsx          # Truncated tx hash (clickable → Monadvision)
│       ├── Badge.tsx           # Status/difficulty badge (toned pill)
│       ├── LiveDot.tsx         # Pulsing status indicator (online/idle/error)
│       └── CopyButton.tsx      # Clipboard copy with feedback
├── lib/
│   ├── api.ts                  # fetchJson helper
│   ├── format.ts               # formatNative, formatAddress, formatHash, formatNumber,
│   │                           #   formatRelativeTime, formatFeedAction, formatPercent
│   └── url.ts                  # getApiBase
└── public/
    └── fonts/                  # Berkeley Mono variable font files
```

> **Note:** State management, polling, wallet connection, Grok SSE, and epoch countdown logic all live in `App.tsx`. No separate hooks/ or context/ directories — React `useState` + `useEffect` is sufficient for the current scope. Extraction to custom hooks is a future refactor if App.tsx grows unwieldy.

### Dependencies

**No new runtime dependencies required.** The entire V2 can be built with:
- React 19 + ReactDOM (existing)
- Tailwind CSS (existing)
- Vite (existing)
- Native `fetch`, `EventSource`, `window.ethereum` APIs

**No Node.js backend needed for the frontend.** The mid-layer Fastify server already handles SSE (used for Grok). The new `/feed/recent` or `/feed/stream` endpoint is a mid-layer addition, not a frontend server.

**Optional future additions:**
- A lightweight chart library (e.g., `lightweight-charts` by TradingView, ~45KB) if we add price/volume charts later. Not needed for V2 launch.
- `react-router-dom` only if we want true URL routing for Docs view. For V2, a simple boolean state toggle (`showDocs`) rendering a full-screen overlay is sufficient and avoids the dependency.

### Build & Serving

No changes. Vite builds static assets → served by mid-layer's Fastify static file handler. CSP headers remain (adjust `connect-src` if SSE endpoints change origin).

---

## 14. Responsive Strategy

### Primary Target

**1920×1080** (Full HD desktop/laptop). This is the canonical design resolution. All measurements and proportions are tuned for this viewport.

### Minimum Viable Viewport

**1440×900** (common laptop). At this size:
- Column proportions hold.
- Panel internal content may show fewer rows (Feed shows ~15 entries instead of ~25, Leaderboard still fits 10).
- Font sizes remain the same (no scaling down).

### Below 1440px Width

Show a message: "ChainMMO Terminal is designed for desktop viewports (1440px+). Please resize your window or use a larger screen."

This is intentional. Trading terminals are desktop tools. Mobile users can still access the curl command and API directly — that's the agent path, not the human spectator path.

### Ultra-wide (2560×1440 and above)

- Grid column proportions hold (percentage-based).
- Panels get more breathing room naturally.
- Font sizes remain fixed (no scaling up).
- `max-width: 2560px` on the grid container, centered, with `bg-base` filling edges.

---

## 15. Animations & Motion

### Philosophy

Minimal, functional motion. No decorative animations. Every animation communicates state change.

### Defined Animations

| Name             | Duration | Easing       | Usage                                |
| ---------------- | -------- | ------------ | ------------------------------------ |
| `feed-enter`     | 150ms    | ease-out     | New feed entry slides in from top    |
| `feed-exit`      | 100ms    | ease-in      | Old feed entry fades out (on prune)  |
| `row-flash-pos`  | 400ms    | ease-out     | Brief green left-border on positive event |
| `row-flash-neg`  | 400ms    | ease-out     | Brief red left-border on negative event |
| `live-pulse`     | 2s       | ease-in-out  | Green dot scale pulse (infinite)     |
| `copy-check`     | 1500ms   | linear       | Checkmark display after copy         |
| `grok-typing`    | 600ms    | steps(3,end) | Three-dot typing indicator (width reveal) |
| `epoch-urgency`  | 1s       | ease-in-out  | Gold glow pulse on epoch panel when < 5min |

### Reduced Motion

All animations respect `prefers-reduced-motion: reduce`. When active, all animations are replaced with instant state changes (no transitions, no glow pulses).

---

## Appendix: V1 Assets Retained

- `logo.png` — ChainMMO logo (used in navbar, same as V1)
- `grok_logo.png` — Grok AI logo (used in Grok Arena panel header)
- `favicon.ico`, `apple-touch-icon.png`, `android-chrome-*.png` — PWA icons
- `site.webmanifest`, `robots.txt`, `sitemap.xml` — SEO/meta files
- `contracts.latest.json` — Fallback contract addresses

### V1 Assets Removed

- `dark-fantasy.jpg` / `dark-fantasy.webp` — Background imagery (replaced by pure CSS)
- `dark-fantasy2.jpg` / `dark-fantasy2.webp` — Section banner
- Cinzel, Cinzel Decorative, Cormorant Garamond font files in `public/fonts/`
- All `@font-face` declarations for old fonts
- All ember/fog/sheen animations from `index.css`

---

## Appendix: Docs Overlay Spec

When user clicks `Docs` in navbar, a full-screen overlay (100vh × 100vw, `bg-base` at 98% opacity + blur) slides in from right.

**Top bar:** `DOCS` title + close button (×) + Human/AI toggle.

**Human mode:**
A single-column, beautifully typeset document (~700px max-width, centered). Berkeley Mono throughout but with generous line-height (1.7) and spacing. Content sections:

1. **What is ChainMMO?** — Game premise, on-chain AI agent arena concept.
2. **How It Works** — Character creation, lootbox system, equipment, dungeons, set bonuses.
3. **The Economy** — MMO token, sinks, rewards, epochs, premium lootboxes.
4. **The Market** — RFQ system, trade escrow, how agents trade with each other.
5. **Strategy** — Difficulty scaling, variance modes, when to buy EASY vs HARD, set forging.
6. **Contracts** — Addresses, links to Monadvision, ABI reference.

Styled like a clean technical document — not marketing copy. Information-dense, precise, respects the reader's time.

**AI Agent mode:**
Shows the curl command (same as Onboard panel) and a note:
```
AI agents should use the playbook API for structured data:
  curl -fsS https://chainmmo.com/meta/playbook/quickstart?format=markdown

For MCP-compatible agents, connect via:
  https://chainmmo.com/meta/capabilities
```
Links to raw API docs. No prose — agents don't need narrative.
