# Cast Cookbook (Local Anvil)

Minimal end-to-end commands for character creation, commit/reveal actions, dungeon runs, claims, and RFQ fills.

## 0) Setup

```sh
# Use a fresh Anvil started with:
# anvil --port 8555 --chain-id 31337 --code-size-limit 40000
export RPC=http://127.0.0.1:8555

# Read addresses dynamically from deployment manifest (REQUIRED).
CONTRACTS_JSON="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd)/../deployments/contracts.latest.json"
if [ ! -f "$CONTRACTS_JSON" ]; then CONTRACTS_JSON="deployments/contracts.latest.json"; fi
export MMO=$(python3 -c "import json; print(json.load(open('$CONTRACTS_JSON'))['contracts']['mmoToken'])")
export GAME_WORLD=$(python3 -c "import json; print(json.load(open('$CONTRACTS_JSON'))['contracts']['gameWorld'])")
export FEE_VAULT=$(python3 -c "import json; print(json.load(open('$CONTRACTS_JSON'))['contracts']['feeVault'])")
export RFQ=$(python3 -c "import json; print(json.load(open('$CONTRACTS_JSON'))['contracts']['rfqMarket'])")
export ITEMS=$(cast call $GAME_WORLD "items()(address)" --rpc-url $RPC)

# Use one of Anvil's pre-funded accounts (Anvil prints private keys on startup).
export FAUCET_PK=0x...
export FAUCET_ADDR=$(cast wallet address --private-key $FAUCET_PK)

# Fresh wallet per agent run (avoid reused-state collisions).
export PK=0x$(openssl rand -hex 32)
export FROM=$(cast wallet address --private-key $PK)
cast send $FROM --value 20ether --private-key $FAUCET_PK --rpc-url $RPC
cast send $MMO "transfer(address,uint256)" $FROM 100000000000000000000000 \
  --private-key $FAUCET_PK --rpc-url $RPC
```

Enum values used below:
- `ActionType`: `LOOTBOX_OPEN=1`, `DUNGEON_RUN=2`
- `Difficulty`: `EASY=0`, `NORMAL=1`, `HARD=2`, `EXTREME=3`, `CHALLENGER=4`
- `VarianceMode`: `STABLE=0`, `NEUTRAL=1`, `SWINGY=2`
- `PotionChoice`: `NONE=0`
- `AbilityChoice`: `NONE=0`
- Ability soft-fail UX: invalid-class abilities or insufficient mana do not revert; they resolve as no-op.
- Progress units: `EASY=1`, `NORMAL=1`, `HARD=2`, `EXTREME=4`, `CHALLENGER=6`.

Progression gate:
- `requiredEquippedSlots(level)` returns minimum equipped slots:
  - `1..5 => 1`
  - `6..10 => 4`
  - `11+ => 8`
- `requiredClearsForLevel(level)`:
  - `1..20 => 1`
  - `21..30 => 3`
  - `31..40 => 6`
  - `41..60 => 8`
  - `61..80 => 10`
  - `81+ => 12`
- `levelClearProgress(characterId, level)` tracks current push progress.
- Push failure decay by level band:
  - `21..30 => -1`
  - `31..60 => -2` (floor `0`)
  - `61+ => -3` (floor `0`)
- `runEntryFee(level)` is charged and sunk on run start for `level > 20`.
- Dungeon rewards are only paid when clearing a new best level (no replay farming rewards).

Set/affix pressure:
- `recommendedSetPieces(level)` target count for equipped set items.
- `recommendedMatchingSetPieces(level)` target count for best matching set cluster.
- `recommendedHighAffixPieces(level)` target count for high-affix equipped items.
- `equippedSetPieceCount(characterId)` current total set pieces equipped.
- `equippedHighestSetMatchCount(characterId)` current largest same-set cluster.
- `equippedHighAffixPieceCount(characterId)` current high-affix equipped count.
- pressure penalties are floored (effective multiplier never below `2000` bps), so penalties cannot hard-zero player power.

Tactical pressure:
- from level `10+`, selecting `PotionChoice.NONE` and `AbilityChoice.NONE` increases mob power.
- inspect with `tacticalMobBonusBps(level,boss,potionChoice,abilityChoice)`.

Preflight reads before each push:

```sh
BEST=$(cast call $GAME_WORLD "characterBestLevel(uint256)(uint32)" $CHAR_ID --rpc-url $RPC)
TARGET=$((BEST + 1))

cast call $GAME_WORLD "requiredEquippedSlots(uint32)(uint8)" $TARGET --rpc-url $RPC
cast call $GAME_WORLD "requiredClearsForLevel(uint32)(uint8)" $TARGET --rpc-url $RPC
cast call $GAME_WORLD "levelClearProgress(uint256,uint32)(uint8)" $CHAR_ID $TARGET --rpc-url $RPC
cast call $GAME_WORLD "getProgressionSnapshot(uint256)((uint32,uint32,uint8,uint8,uint8,uint8,uint8,uint8,uint8,uint8,uint8,uint8,uint256,uint256))" $CHAR_ID --rpc-url $RPC
cast call $GAME_WORLD "runEntryFee(uint32)(uint256)" $TARGET --rpc-url $RPC
cast call $GAME_WORLD "repairFee(uint32)(uint256)" $TARGET --rpc-url $RPC
cast call $GAME_WORLD "recommendedSetPieces(uint32)(uint8)" $TARGET --rpc-url $RPC
cast call $GAME_WORLD "equippedSetPieceCount(uint256)(uint8)" $CHAR_ID --rpc-url $RPC
cast call $GAME_WORLD "recommendedMatchingSetPieces(uint32)(uint8)" $TARGET --rpc-url $RPC
cast call $GAME_WORLD "recommendedHighAffixPieces(uint32)(uint8)" $TARGET --rpc-url $RPC
cast call $GAME_WORLD "equippedHighestSetMatchCount(uint256)(uint8)" $CHAR_ID --rpc-url $RPC
cast call $GAME_WORLD "equippedHighAffixPieceCount(uint256)(uint8)" $CHAR_ID --rpc-url $RPC
cast call $GAME_WORLD "estimatePressurePenaltyBps(uint256,uint32)(uint256)" $CHAR_ID $TARGET --rpc-url $RPC
cast call $GAME_WORLD "recommendedBuildDeficits(uint256,uint32)((uint8,uint8,uint8,uint8,uint8,uint8,uint256))" $CHAR_ID $TARGET --rpc-url $RPC
cast call $GAME_WORLD "tacticalMobBonusBps(uint32,bool,uint8,uint8)(uint16)" $TARGET true 0 0 --rpc-url $RPC
```

Commit reveal window helper:

```sh
# returns (startBlock,endBlock,canReveal,expired,resolved)
cast call $GAME_WORLD "revealWindow(uint256)(uint64,uint64,bool,bool,bool)" $COMMIT_ID --rpc-url $RPC
```

## 1) Create Character

```sh
CHAR_ID=$(cast call $GAME_WORLD "nextCharacterId()(uint256)" --rpc-url $RPC)
cast send $GAME_WORLD "createCharacter(uint8,uint8,string)" 0 0 "AgentOne" \
  --private-key $PK --rpc-url $RPC
```

## 2) Claim Free Lootbox

```sh
cast send $GAME_WORLD "claimFreeLootbox(uint256)" $CHAR_ID \
  --private-key $PK --rpc-url $RPC
```

## 3) Commit/Reveal Lootbox Open (Variance-Aware)

```sh
NONCE=1001
SECRET=$(cast keccak "open-1")
COMMIT_ID=$(cast call $GAME_WORLD "nextCommitId()(uint256)" --rpc-url $RPC)

# SWINGY open of tier=2, amount=1 using on-chain hash helper.
OPEN_HASH=$(cast call $GAME_WORLD \
  "hashLootboxOpen(bytes32,address,uint256,uint64,uint32,uint16,uint8,bool)(bytes32)" \
  $SECRET $FROM $CHAR_ID $NONCE 2 1 2 false --rpc-url $RPC)

cast send $GAME_WORLD \
  "commitActionWithVariance(uint256,uint8,bytes32,uint64,uint8)" \
  $CHAR_ID 1 $OPEN_HASH $NONCE 2 \
  --private-key $PK --rpc-url $RPC

cast rpc anvil_mine 2 --rpc-url $RPC

cast send $GAME_WORLD \
  "revealOpenLootboxes(uint256,bytes32,uint32,uint16,uint8)" \
  $COMMIT_ID $SECRET 2 1 2 \
  --private-key $PK --rpc-url $RPC
```

## 3b) Agent-Safe Max Open (Best-Effort, Non-Reverting for Over-Request)

```sh
# Preflight: how much can actually be opened for a requested amount and variance.
cast call $GAME_WORLD \
  "quoteOpenLootboxes(uint256,uint32,uint16,uint8)(uint32,uint32,uint32,uint16)" \
  $CHAR_ID 2 50 1 --rpc-url $RPC
# returns: (totalCredits,boundForMode,genericCredits,openableAmount)

MAX_NONCE=1002
MAX_SECRET=$(cast keccak "open-max")
MAX_COMMIT_ID=$(cast call $GAME_WORLD "nextCommitId()(uint256)" --rpc-url $RPC)

# Request up to 50 opens, NEUTRAL mode, max-domain hash.
MAX_HASH=$(cast call $GAME_WORLD \
  "hashLootboxOpen(bytes32,address,uint256,uint64,uint32,uint16,uint8,bool)(bytes32)" \
  $MAX_SECRET $FROM $CHAR_ID $MAX_NONCE 2 50 1 true --rpc-url $RPC)

cast send $GAME_WORLD \
  "commitActionWithVariance(uint256,uint8,bytes32,uint64,uint8)" \
  $CHAR_ID 1 $MAX_HASH $MAX_NONCE 1 \
  --private-key $PK --rpc-url $RPC

cast rpc anvil_mine 2 --rpc-url $RPC

cast send $GAME_WORLD \
  "revealOpenLootboxesMax(uint256,bytes32,uint32,uint16,uint8)" \
  $MAX_COMMIT_ID $MAX_SECRET 2 50 1 \
  --private-key $PK --rpc-url $RPC
# return value = openedAmount (can be 0..50), commit is resolved either way.
```

## 3c) Buy Premium Lootboxes (ETH + MMO Sink) Then Open

```sh
# Example: buy 8 EASY premium boxes (equippable tier path).
BUY_DIFF=0
BUY_AMOUNT=8

# Always query tier dynamically before opening.
PREM_TIER=$(cast call $GAME_WORLD \
  "premiumLootboxTier(uint256,uint8)(uint32)" \
  $CHAR_ID $BUY_DIFF --rpc-url $RPC)

cast call $FEE_VAULT \
  "quotePremiumPurchase(uint256,uint8,uint16)(uint256,uint256)" \
  $CHAR_ID $BUY_DIFF $BUY_AMOUNT --rpc-url $RPC

# Approve MMO in case level>10 adds MMO sink.
cast send $MMO "approve(address,uint256)" $FEE_VAULT \
  0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff \
  --private-key $PK --rpc-url $RPC

# Set this from the quote call output above.
ETH_COST=<eth_cost_from_quote>

cast send $FEE_VAULT \
  "buyPremiumLootboxes(uint256,uint8,uint16)" \
  $CHAR_ID $BUY_DIFF $BUY_AMOUNT \
  --value $ETH_COST \
  --private-key $PK --rpc-url $RPC

# Open purchased credits with max semantics.
P_NONCE=1500
P_SECRET=$(cast keccak "premium-open")
P_COMMIT_ID=$(cast call $GAME_WORLD "nextCommitId()(uint256)" --rpc-url $RPC)

P_HASH=$(cast call $GAME_WORLD \
  "hashLootboxOpen(bytes32,address,uint256,uint64,uint32,uint16,uint8,bool)(bytes32)" \
  $P_SECRET $FROM $CHAR_ID $P_NONCE $PREM_TIER $BUY_AMOUNT 1 true --rpc-url $RPC)

cast send $GAME_WORLD \
  "commitActionWithVariance(uint256,uint8,bytes32,uint64,uint8)" \
  $CHAR_ID 1 $P_HASH $P_NONCE 1 \
  --private-key $PK --rpc-url $RPC

cast rpc anvil_mine 2 --rpc-url $RPC

cast send $GAME_WORLD \
  "revealOpenLootboxesMax(uint256,bytes32,uint32,uint16,uint8)" \
  $P_COMMIT_ID $P_SECRET $PREM_TIER $BUY_AMOUNT 1 \
  --private-key $PK --rpc-url $RPC
```

## 4) Commit/Reveal Dungeon Run (Repair Escrow > L10, Entry Fee > L20)

```sh
# Approve MMO for repair escrow + rerolls.
cast send $MMO "approve(address,uint256)" $GAME_WORLD \
  0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff \
  --private-key $PK --rpc-url $RPC

RUN_NONCE=2001
RUN_SECRET=$(cast keccak "run-11")
RUN_COMMIT_ID=$(cast call $GAME_WORLD "nextCommitId()(uint256)" --rpc-url $RPC)

# EASY level-11 run with NEUTRAL variance.
RUN_HASH=$(cast call $GAME_WORLD \
  "hashDungeonRun(bytes32,address,uint256,uint64,uint8,uint32,uint8)(bytes32)" \
  $RUN_SECRET $FROM $CHAR_ID $RUN_NONCE 0 11 1 --rpc-url $RPC)

cast send $GAME_WORLD \
  "commitActionWithVariance(uint256,uint8,bytes32,uint64,uint8)" \
  $CHAR_ID 2 $RUN_HASH $RUN_NONCE 1 \
  --private-key $PK --rpc-url $RPC

cast rpc anvil_mine 2 --rpc-url $RPC

cast send $GAME_WORLD \
  "revealStartDungeon(uint256,bytes32,uint8,uint32,uint8)" \
  $RUN_COMMIT_ID $RUN_SECRET 0 11 1 \
  --private-key $PK --rpc-url $RPC
```

Resolve rooms until `active=false`:

```sh
cast call $GAME_WORLD \
  "getRunState(uint256)(bool,uint8,uint8,uint32,uint32,uint8,uint8,uint8,uint32,uint8)" \
  $CHAR_ID --rpc-url $RPC

cast send $GAME_WORLD "resolveNextRoom(uint256,uint8,uint8)" $CHAR_ID 0 0 \
  --private-key $PK --rpc-url $RPC
```

## 5) Epoch Finalize + Claims

```sh
# Example: finalize the previous hour.
EPOCH=$(($(date +%s) / 3600 - 1))
cast send $FEE_VAULT "finalizeEpoch(uint32)" $EPOCH \
  --private-key $PK --rpc-url $RPC

cast send $FEE_VAULT "claimPlayer(uint32,uint256)" $EPOCH $CHAR_ID \
  --private-key $PK --rpc-url $RPC
```

## 6) Upgrade Stone Reroll

```sh
ITEM_ID=1
cast send $GAME_WORLD "rerollItemStats(uint256,uint256)" $CHAR_ID $ITEM_ID \
  --private-key $PK --rpc-url $RPC

cast call $GAME_WORLD "upgradeStoneBalance(uint256)(uint32)" $CHAR_ID --rpc-url $RPC
cast call $ITEMS "affixBps(uint256)(uint16)" $ITEM_ID --rpc-url $RPC
cast call $ITEMS "isHighAffix(uint256)(bool)" $ITEM_ID --rpc-url $RPC
```

## 6b) Deterministic Set Forge

```sh
# Determine convergence costs for your equipped item tier.
ITEM_ID=<equipped_item_id>
ITEM_TIER=<item_tier>
cast call $GAME_WORLD "forgeSetPieceStoneCost(uint32)(uint8)" $ITEM_TIER --rpc-url $RPC
cast call $GAME_WORLD "forgeSetPieceMmoCost(uint32)(uint256)" $ITEM_TIER --rpc-url $RPC

# Example: forge equipped item into set id 24 (must be in the item's tier band).
cast send $GAME_WORLD "forgeSetPiece(uint256,uint256,uint8)" $CHAR_ID $ITEM_ID 24 \
  --private-key $PK --rpc-url $RPC
```

## 7) Batch Agent Throughput Helpers

Batch equip up to 8 items in one tx:

```sh
# Example equips 8 item ids in slot order.
cast send $GAME_WORLD "equipItems(uint256,uint256[])" \
  $CHAR_ID "[11,12,13,14,15,16,17,18]" \
  --private-key $PK --rpc-url $RPC
```

Batch room resolution (up to `ROOM_MAX=11` steps per tx):

```sh
# All NONE choices for up to 11 rooms.
cast send $GAME_WORLD \
  "resolveRooms(uint256,uint8[],uint8[])" \
  $CHAR_ID "[0,0,0,0,0,0,0,0,0,0,0]" "[0,0,0,0,0,0,0,0,0,0,0]" \
  --private-key $PK --rpc-url $RPC
```

## 8) RFQ Flow

Maker:

```sh
# Escrow MMO into RFQ market.
cast send $MMO "approve(address,uint256)" $RFQ \
  0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff \
  --private-key $PK --rpc-url $RPC

# slot=5 (MAIN_HAND), minTier=10, setMask=0(any), mmoOffered=100e18, expiry=0(no expiry)
RFQ_ID=$(cast call $RFQ "nextRfqId()(uint256)" --rpc-url $RPC)
cast send $RFQ "createRFQ(uint8,uint32,uint256,uint96,uint40)" 5 10 0 100000000000000000000 0 \
  --private-key $PK --rpc-url $RPC
```

Taker:

```sh
TAKER_PK=<other-private-key>
ITEM_ID=<matching-item-id>

cast send $ITEMS "approve(address,uint256)" $RFQ $ITEM_ID \
  --private-key $TAKER_PK --rpc-url $RPC

cast send $RFQ "fillRFQ(uint256,uint256)" $RFQ_ID $ITEM_ID \
  --private-key $TAKER_PK --rpc-url $RPC
```

Cancel (maker only):

```sh
cast send $RFQ "cancelRFQ(uint256)" $RFQ_ID \
  --private-key $PK --rpc-url $RPC
```
