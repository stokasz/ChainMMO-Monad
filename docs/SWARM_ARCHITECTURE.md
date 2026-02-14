# ChainMMO AI Swarm Architecture

Design document for orchestrating N autonomous AI agents playing ChainMMO concurrently.

## Overview

A **swarm orchestrator** manages N agents, each with its own wallet, character, and LLM backend. Agents compete independently on the same ChainMMO deployment, leveling characters as high as possible.

```
┌─────────────────────────────────────────────────────────────┐
│                     ORCHESTRATOR                            │
│                                                             │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐       ┌─────────┐  │
│  │ Agent 0 │  │ Agent 1 │  │ Agent 2 │  ...  │ Agent N │  │
│  │ Gemini  │  │  Grok   │  │DeepSeek │       │ Model X │  │
│  │ Wallet₀ │  │ Wallet₁ │  │ Wallet₂ │       │ WalletN │  │
│  │ Char #A │  │ Char #B │  │ Char #C │       │ Char #Z │  │
│  └────┬────┘  └────┬────┘  └────┬────┘       └────┬────┘  │
│       │            │            │                  │        │
│       ▼            ▼            ▼                  ▼        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              SHARED TOOL EXECUTOR                    │   │
│  │  • cast send/call (Foundry)                          │   │
│  │  • curl (ChainMMO REST API)                          │   │
│  │  • shell (general-purpose)                           │   │
│  └──────────────────────────────────────────────────────┘   │
│                            │                                │
│                            ▼                                │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              MONITOR + REPORTER                      │   │
│  │  • Per-agent level tracking (on-chain reads)         │   │
│  │  • Log aggregation + status dashboard                │   │
│  │  • Auto-restart on crash                             │   │
│  │  • Leaderboard polling                               │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
         │                                    │
         ▼                                    ▼
   Monad Mainnet (143)               chainmmo.com REST API
   via cast + RPC                    via curl
```

## Lifecycle

### Phase 1: Bootstrap

```
for each agent i in 0..N:
    1. cast wallet new            → (address_i, privkey_i)
    2. cast send (fund)           → transfer X MON from treasury
    3. cast send createCharacter  → mint character, get charId_i
    4. cast send claimFreeLootbox → claim starter gear
    5. persist (address_i, privkey_i, charId_i) to wallets.json
```

Key design decisions:
- **Deterministic bootstrap**: orchestrator creates characters, not the LLM. Smaller models waste 5-10 iterations just figuring out how to create a character.
- **Persist wallet keys**: save to `wallets.json` immediately. Keys in process memory are lost on crash.
- **Sequential funding**: use 2s delay between `cast send` calls for nonce settlement. Monad is fast but nonce races still happen with concurrent sends from the same wallet.

### Phase 2: Agent Loop

Each agent runs an independent LLM tool-calling loop:

```
while True:
    messages = trim_if_needed(messages)
    response = call_llm(messages, model, tools=[execute_command])

    if response has tool_calls:
        for each tool_call:
            result = shell_exec(tool_call.command)
            append tool_result to messages
    elif response is text_only:
        append nudge ("use execute_command NOW") to messages

    sleep(1)
```

### Phase 3: Monitor

Every 60s the orchestrator:
1. Polls each process for alive/dead status
2. Reads `characterBestLevel` on-chain for each character
3. Tails last log line from each agent's log file
4. Optionally queries the leaderboard API
5. Prints a status table

### Phase 4: Teardown

On `SIGINT` or when target level is reached:
1. `SIGTERM` all agent processes
2. Wait 10s for graceful exit
3. Print final scoreboard
4. Optionally produce sanitized logs for reporting

## Agent Architecture (per-agent)

### LLM Interface

Uses OpenRouter's OpenAI-compatible API with tool calling:

```
POST https://openrouter.ai/api/v1/chat/completions
{
    "model": "<model-id>",
    "messages": [...],
    "tools": [{ "function": { "name": "execute_command", ... } }],
    "tool_choice": "auto",
    "temperature": 0.3,
    "max_tokens": 2048
}
```

Single tool: `execute_command(command: str) -> str`. Returns stdout+stderr, truncated to 4KB.

### System Prompt Design

The system prompt is the most critical piece. Lessons learned:

**DO: Hardcode everything.**
- Contract addresses, commit fee, character ID, wallet address, private key, RPC URL
- Exact copy-paste bash commands for every game action
- Pre-fetched character state in the first user message

**DO: Be mechanical, not conceptual.**
- Bad: "Use the commit/reveal pattern to open lootboxes"
- Good: Exact `cast call` + `cast send` commands with all arguments filled in

**DO: Include error recovery.**
- Map every known revert error to a specific recovery action
- `RevealTooEarly` -> sleep 3s, retry
- `RevealExpired` -> increment nonce, recommit
- `active run` -> resolve rooms first

**DON'T: Rely on the LLM to construct complex bash pipelines.**
- Small models (7-20B) fail at nested `$()`, JSON piping, `awk` extraction
- Pre-compute what you can; give them the simplest possible commands

**DON'T: Include unnecessary context.**
- No game lore, no strategy essays
- Just: "your goal is to increase bestLevel. here are the exact commands."

### Context Management

```
MAX_MESSAGES = 80    # before trimming
TRIM_TO      = 40    # keep system + last 40 messages
OUTPUT_TRUNC = 4000  # max chars per tool result
```

On trim: insert a recovery message with the character ID and a state-check command. The agent re-orients by calling the state API.

### The Nudge Problem

When an LLM responds with text but no tool call, it's "thinking out loud" instead of acting. Fix:

```python
if finish_reason == "stop" and not tool_calls:
    messages.append({
        "role": "user",
        "content": "You MUST use execute_command now. Don't explain - ACT."
    })
```

This is critical for smaller models that tend to narrate instead of act.

## Game Loop: Optimal Dungeon Strategy

The core game loop for leveling:

```
forever:
    state = curl agent/state/$CHAR_ID

    if state.runState.active:
        resolveRooms (batch 11)    # finish current dungeon
        continue

    if state.lootboxCredits > 0:
        commit_open_lootbox()      # ActionType=1
        sleep 5
        reveal_open_lootbox()
        equip_best_items()
        continue

    if state.equippedSlots < required_for_next_level:
        buy_premium_lootboxes()    # costs MON
        continue                    # will open on next iteration

    commit_dungeon(bestLevel + 1, EASY)  # ActionType=2
    sleep 5
    reveal_dungeon()
    resolveRooms (batch 11, repeat until done)
```

### Commit/Reveal Flow (the hard part)

Every action (lootbox open, dungeon start) requires a two-phase commit:

```
1. Compute hash:  cast call hashDungeonRun(secret, addr, charId, nonce, diff, level, varMode)
2. Commit:        cast send commitActionWithVariance(charId, actionType, hash, nonce, varMode) --value $FEE
3. Extract ID:    parse ActionCommitted event from tx receipt (topic0 = 0xea567c65...)
4. Wait:          sleep 5 (need 2+ blocks between commit and reveal)
5. Reveal:        cast send revealStartDungeon(commitId, secret, diff, level, varMode)
6. Nonce++
```

**Critical**: `commitActionWithVariance` is **payable**. Forgetting `--value` is the #1 failure mode.

### Slot Gates

Characters need minimum equipped item slots to enter higher levels:

| Level Range | Required Equipped Slots |
|-------------|------------------------|
| 1-5         | 1                      |
| 6-10        | 4                      |
| 11+         | 8                      |

When hitting a gate, buy premium lootboxes from the FeeVault:

```
QUOTE=$(cast call $FEEVAULT 'quotePremiumPurchase(uint256,uint8,uint16)(uint256,uint256)' $CHAR_ID 1 3)
COST=$(echo "$QUOTE" | head -1 | awk '{print $1}')
cast send $FEEVAULT 'buyPremiumLootboxes(uint256,uint8,uint16)' $CHAR_ID 1 3 --value "$COST"
```

## Model Selection

From our 7-agent arena experiment:

| Model | Tool Calling | Bash Competency | Speed | Cost | Verdict |
|-------|-------------|-----------------|-------|------|---------|
| Gemini 3 Flash | Excellent | Strong | Fast | $0.50/M | Best overall |
| Gemini 2.5 Flash | Good | Strong | Fast | Free | Most iterations |
| Grok 4.1 Fast | Good | Good | Fast | Free | Solid mid-tier |
| Kimi K2.5 | Good | Decent | Medium | $0.45/M | Decent |
| DeepSeek V3.2 | Decent | Weak | Medium | $0.25/M | Struggles with bash |
| GPT-OSS 120B | Poor | Very weak | Slow | Free | Bad at bash syntax |
| MiniMax M2.1 | Poor | Poor | Slow | Free | Crashed (too many API errors) |

**Recommendation**: Use Gemini 3 Flash or Gemini 2.5 Flash as the primary. For diversity, Grok 4.1 Fast and Kimi K2.5 are viable. Avoid models that struggle with shell command construction.

### Model Requirements

A model must support:
1. **Tool/function calling** (OpenAI-compatible format)
2. **Reliable JSON argument generation** (for tool call parameters)
3. **Bash command construction** (nested `$()`, pipes, `awk`)
4. **Following mechanical instructions** (copy-paste from system prompt)

## Resource Budget

Per agent:
- **RAM**: ~60MB (Python process + requests library)
- **CPU**: Negligible (I/O bound - waiting on LLM API + RPC)
- **MON**: ~5 MON per 100 dungeon attempts (commit fees + premium lootboxes)
- **API cost**: ~$0.01-0.05 per hour (free tier models: $0)

For 7 agents on a 4-CPU / 4GB RAM VM: comfortable fit.

## File Layout

```
arena/
├── orchestrate.py      # wallet gen, funding, char creation, launch, monitor
├── agent.py            # per-agent LLM loop
├── wallets.json        # persisted wallet keys + character IDs
└── logs/
    ├── agent_0_gemini3flash.log
    ├── agent_1_grok41fast.log
    └── ...
```

## Improvements Over v1

Things that went wrong in v1 and how v2 fixes them:

| v1 Problem | v2 Fix |
|-----------|--------|
| Agents spent 5+ iterations discovering contracts | Hardcode all contract addresses in system prompt |
| Keys lost when processes died | Persist to `wallets.json` immediately |
| Small models couldn't construct commit hash commands | Pre-fill exact commands with all addresses/IDs |
| Agents narrated instead of acting | Aggressive nudge messages on text-only responses |
| No character ID passed to agent | Orchestrator creates characters, passes ID as arg |
| Agents didn't open lootboxes for gear | State pre-fetched and included in first message with explicit "open lootboxes first" instruction |
| MiniMax crashed with no restart | Monitor loop should auto-restart crashed agents |

## Future: Deterministic Agent (No LLM)

The logical endpoint of making the system prompt more prescriptive is to remove the LLM entirely and write a deterministic Python loop:

```python
while True:
    state = fetch_state(char_id)
    if state.run_active:
        resolve_rooms(char_id)
    elif state.lootbox_credits > 0:
        commit_reveal_lootbox(char_id)
        equip_best(char_id)
    elif state.equipped_slots < required_slots(state.best_level + 1):
        buy_premium_lootboxes(char_id)
    else:
        commit_reveal_dungeon(char_id, state.best_level + 1)
```

This would be faster, cheaper, and more reliable. The LLM agent approach is valuable for:
- Testing game UX (do agents understand the API?)
- Stress testing (many concurrent players)
- Entertainment / marketing ("AI battle royale")
- Evaluating model capabilities

## API Reference (Quick)

```
GET  /meta/contracts                    → { gameWorld, feeVault, items, ... }
GET  /agent/bootstrap                   → { castSignatures: { ... } }
GET  /agent/state/{charId}              → full character state + recommendations
GET  /agent/characters/{address}        → list of characters owned by address
GET  /leaderboard?mode=live&limit=20    → current rankings
```

On-chain (via `cast`):
```
commitFee()                              → uint256 (currently 10000000000000 wei)
createCharacter(race, class, name)       → creates character
claimFreeLootbox(charId)                 → free starter gear
commitActionWithVariance(charId, type, hash, nonce, varMode)  → payable commit
revealOpenLootboxesMax(commitId, secret, count, maxItems, varMode)
revealStartDungeon(commitId, secret, diff, level, varMode)
resolveRooms(charId, actions[], targets[])
equipItems(charId, itemIds[])
characterBestLevel(charId)               → uint32
```
