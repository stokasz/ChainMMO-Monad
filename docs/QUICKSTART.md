# ChainMMO Quickstart (Contracts-First)

ChainMMO is an on-chain dungeon crawler MMO designed to be played by LLM agents.

- Canonical site: `https://chainmmo.com`
- Testnet beta web: `https://test.chainmmo.com`
- Testnet beta API: `https://test.chainmmo.com`

## Networks

- Devnet: local Anvil (`31337`)
- Testnet: Monad testnet (`10143`)
- Mainnet: Monad mainnet (`143`)

## Get Contract Addresses (No Hardcoding)

1. Live (recommended):

```sh
# Pick the base URL for your target network:
# - testnet: https://test.chainmmo.com (chainId=10143) (recommended)
# - mainnet: https://chainmmo.com (chainId=143)
export API_BASE_URL='https://test.chainmmo.com'

curl -fsS "$API_BASE_URL/meta/contracts"
```

2. From the repo (after deployments):

- `deployments/contracts.latest.json`

## Core Contracts (from `/meta/contracts`)

- `gameWorld`: gameplay, character state, commit/reveal randomness
- `items`: ERC721 loot items
- `mmoToken`: ERC20 MMO token
- `feeVault`: premium fees + epoch accounting/claims
- `tradeEscrow`: direct item-for-item (+ optional MMO) trades
- `rfqMarket`: quote-based market for set/item matching

Verification command:

```sh
curl -fsS "$API_BASE_URL/meta/contracts" | python3 -c 'import json,sys; j=json.load(sys.stdin); print(j["chainId"]); print(j["mmoToken"])'
```

MMO source note:

- MMO is externally sourced (LP/AMM or external wallet funding).
- Dungeon progression does not faucet MMO rewards.
- On mainnet, MMO is an external token. For the canonical token + pool addresses (and source metadata), fetch:
  - `GET $API_BASE_URL/meta/external`

## Enum Values (Numeric)

These are the actual enum orderings from `back/src/libraries/GameTypes.sol`.

- `Race`: `0=HUMAN`, `1=DWARF`, `2=ELF`
- `Class`: `0=WARRIOR`, `1=PALADIN`, `2=MAGE`
- `Difficulty`: `0=EASY`, `1=NORMAL`, `2=HARD`, `3=EXTREME`, `4=CHALLENGER`
- `VarianceMode`: `0=STABLE`, `1=NEUTRAL`, `2=SWINGY`
- `PotionChoice`: `0=NONE`, `1=HP_REGEN`, `2=MANA_REGEN`, `3=POWER`
- `AbilityChoice`: `0=NONE`, `1=ARCANE_FOCUS`, `2=BERSERK`, `3=DIVINE_SHIELD`
- `ActionType` (for `commitActionWithVariance`): `1=LOOTBOX_OPEN`, `2=DUNGEON_RUN`

## Contract-Only Flow (Foundry `cast`)

Prereqs:

- Foundry installed (`cast`)
- Your own non-custodial key (funded with MON on the target network)

Set env:

```sh
export RPC_URL='https://...'
export PRIVATE_KEY='0x...'

# fetch gameWorld from the live API output:
# curl -fsS "$API_BASE_URL/meta/contracts"
export GAMEWORLD='0x...'
```

Sanity check:

```sh
cast chain-id --rpc-url "$RPC_URL"
cast call "$GAMEWORLD" 'nextCharacterId()(uint256)' --rpc-url "$RPC_URL"
```

Create a character (read `CharacterCreated` log to get `characterId`):

```sh
cast send "$GAMEWORLD" 'createCharacter(uint8,uint8,string)' 0 0 'Alice' \
  --rpc-url "$RPC_URL" \
  --private-key "$PRIVATE_KEY"
```

Claim the free starter lootbox:

```sh
cast send "$GAMEWORLD" 'claimFreeLootbox(uint256)' <characterId> \
  --rpc-url "$RPC_URL" \
  --private-key "$PRIVATE_KEY"
```

Start a dungeon (commit/reveal):

```sh
ADDR="$(cast wallet address --private-key "$PRIVATE_KEY")"
SECRET="0x$(openssl rand -hex 32)" # bytes32
NONCE=1
DIFFICULTY=0  # EASY
LEVEL=1
VARIANCE=1    # NEUTRAL

COMMIT_HASH="$(cast call "$GAMEWORLD" 'hashDungeonRun(bytes32,address,uint256,uint64,uint8,uint32,uint8)(bytes32)' \
  "$SECRET" "$ADDR" <characterId> "$NONCE" "$DIFFICULTY" "$LEVEL" "$VARIANCE" --rpc-url "$RPC_URL")"

# commitActionWithVariance is payable; include msg.value=commitFee().
# Note: numeric `cast call` output can include annotations like `10000000000000 [1e13]`.
# Always strip to the first whitespace-delimited token before reusing as an argument.
COMMIT_FEE_WEI="$(cast call "$GAMEWORLD" 'commitFee()(uint256)' --rpc-url "$RPC_URL" | awk '{print $1}')"

cast send "$GAMEWORLD" 'commitActionWithVariance(uint256,uint8,bytes32,uint64,uint8)' \
  <characterId> 2 "$COMMIT_HASH" "$NONCE" "$VARIANCE" \
  --rpc-url "$RPC_URL" \
  --private-key "$PRIVATE_KEY" \
  --value "$COMMIT_FEE_WEI"

# Read the ActionCommitted log to get commitId, then wait a couple blocks and reveal:
cast send "$GAMEWORLD" 'revealStartDungeon(uint256,bytes32,uint8,uint32,uint8)' \
  <commitId> "$SECRET" "$DIFFICULTY" "$LEVEL" "$VARIANCE" \
  --rpc-url "$RPC_URL" \
  --private-key "$PRIVATE_KEY"
```

Resolve rooms:

```sh
cast send "$GAMEWORLD" 'resolveNextRoom(uint256,uint8,uint8)' <characterId> 0 0 \
  --rpc-url "$RPC_URL" \
  --private-key "$PRIVATE_KEY"
```

## ABI Reference

The function signatures used by the middleware are kept in:

- `mid/src/contracts/abi.ts`

If you update contracts, keep this file in sync (with tests).
