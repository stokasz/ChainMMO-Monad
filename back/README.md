# ChainMMO `/back`

ChainMMO.com  
“MMO to be played by LLMs.”

Infinite fantasy themed dungeon crawler, built to be played through the LLM and TUI. All interactions and game state fetching happen on the target EVM chain (Monad in production).

## Scope

- Smart contracts only (`/back`).
- Immutable deployment model (no admin powers in gameplay/economics flows).
- Foundry stack (`forge`, `anvil`, `cast`).

## Contracts

- `src/MMOToken.sol` (`MMO`)
- `src/Items.sol` (Solady ERC721, variance-shaped rolls, set metadata/naming, reroll nonce)
- `src/GameWorld.sol` (characters, equip, dungeon, commit-reveal, set bonuses, upgrade stones, repair sink, run-entry sink, multi-clear progression)
- `src/FeeVault.sol` (premium ETH/MMO accounting, hourly epochs, top-10%-style claims)
- `src/TradeEscrow.sol` (p2p item-for-item + optional MMO)
- `src/RFQMarket.sol` (quote-based item matching with MMO escrow)

## High-Signal Entry Points

- Character lifecycle: `createCharacter`, `claimFreeLootbox`, `equipItem`
- Random actions: `commitAction`, `commitActionWithVariance`, `revealOpenLootboxes`, `revealStartDungeon`, `cancelExpired`
- Dungeon loop: `resolveNextRoom`
- Progression reads: `requiredClearsForLevel`, `levelClearProgress`, `requiredEquippedSlots`
- Sink reads: `runEntryFee`, `repairFee`
- Set-pressure reads: `recommendedSetPieces`, `recommendedMatchingSetPieces`, `equippedSetPieceCount`, `equippedHighestSetMatchCount`
- Affix-pressure reads: `recommendedHighAffixPieces`, `equippedHighAffixPieceCount`
- Compact agent reads: `getProgressionSnapshot`, `estimatePressurePenaltyBps`, `recommendedBuildDeficits`, `scoreItemForTargetLevel`
- Tactical-pressure read: `tacticalMobBonusBps`
- Commit window read: `revealWindow`
- Item progression: `rerollItemStats`, `upgradeStoneBalance`, `forgeSetPiece`, `forgeSetPieceMmoCost`, `forgeSetPieceStoneCost`
- Shop: `FeeVault.quotePremiumPurchase`, `FeeVault.buyPremiumLootboxes`
- Claims: `FeeVault.finalizeEpoch`, `FeeVault.claimPlayer`, `FeeVault.claimDeployer`
- Trade: `TradeEscrow.createOffer`, `TradeEscrow.fulfillOffer`, `TradeEscrow.cancelOffer`
- RFQ: `RFQMarket.createRFQ`, `RFQMarket.fillRFQ`, `RFQMarket.cancelRFQ`

## Tests (explicitly split)

- `test/characters/*`
- `test/randomness/*`
- `test/dungeon/*`
- `test/items/*`
- `test/economics/*`
- `test/trade/*`

Run all:

```sh
forge test --offline
```

## Solar (Dev-Only Fast Checks)

`solar` can be used as a fast front-end parser/ABI pass during development:

```sh
./script/solar-dev-check.sh
```

Notes:

- This is **dev-only** and does not replace Solc/Foundry for deploy artifacts.
- Production builds/deploys stay on `forge` + `solc`.

## Compiler Lanes

- Dev feedback lane (fast): `solar` via `./script/solar-dev-check.sh`
- Production lane (authoritative): `solc` via Foundry (`forge build/test --use solc:0.8.26`)
- Contract size gate: `python3 script/check-contract-sizes.py --preset monad`
- CI/CD enforces this split in:
  - `/Users/stokarz/Code/chainmmo/.github/workflows/chainmmo-ci.yml`
  - `/Users/stokarz/Code/chainmmo/.github/workflows/chainmmo-deploy.yml`

## Balance Model (Current)

- Slot gate:
  - target level `1..5`: `1` equipped slot
  - target level `6..10`: `4` equipped slots
  - target level `11+`: `8` equipped slots
- Level-up clear units:
  - level `1..20`: `1`
  - level `21..30`: `3`
  - level `31..40`: `6`
  - level `41..60`: `8`
  - level `61..80`: `10`
  - level `81+`: `12`
- Successful clear units per difficulty:
  - `EASY=1`, `NORMAL=1`, `HARD=2`, `EXTREME=4`, `CHALLENGER=6`
- Failure while pushing (`best+1`):
  - levels `21..30`: clear progress decrements by `1`
  - levels `31..60`: clear progress decrements by `2` (floored at `0`)
  - levels `61+`: clear progress decrements by `3` (floored at `0`)
- MMO sinks:
  - repair escrow for level `>10` (refund on success, sink on failure)
  - run entry fee for level `>20` (always sunk at run start)
  - checkpoint values (approx):
    - `repairFee(30) ~= 310 MMO`, `repairFee(40) ~= 609 MMO`, `repairFee(50) ~= 1198 MMO`
    - `runEntryFee(30) ~= 25 MMO`, `runEntryFee(40) ~= 45 MMO`, `runEntryFee(50) ~= 81 MMO`
- MMO source:
  - MMO is externally sourced (LP/AMM or operator-funded test wallets).
  - dungeon success does not faucet MMO rewards.
- Premium/forge sink checkpoints (approx):
  - premium MMO sink per lootbox at `L30 ~= 181 MMO`, `L40 ~= 356 MMO`, `L50 ~= 700 MMO`
  - deterministic forge at tier `30` costs `1400 MMO` + stones
- Set pressure:
  - recommended set pieces by target level: `0` (`<=18`), `1` (`19..23`), `2` (`24..28`), `3` (`29..33`), `4` (`34..38`), `5` (`39..47`), `6` (`48..57`), `7` (`58..69`), `8` (`70+`)
  - recommended same-set matching by target level: `0` (`<=28`), `1` (`29..33`), `2` (`34..38`), `3` (`39..47`), `4` (`48..57`), `5` (`58..69`), `6` (`70..79`), `7` (`80..89`), `8` (`90+`)
- Affix pressure:
  - recommended high-affix equipped pieces: `0` (`<=22`), `1` (`23..30`), `2` (`31..38`), `3` (`39..50`), `4` (`51..64`), `5` (`65..80`), `6` (`81+`)
- Pressure floor:
  - pressure penalties never hard-zero player power; effective power multiplier is floored at `MIN_EFFECTIVE_POWER_BPS=2000` (20%).
- Starter assist:
  - low-gear early runs (`<=5` with 0-1 equipped slots) apply deterministic mob-power reduction to prevent level-2 fail loops.
- Tactical pressure:
  - from level `10+`, selecting `NONE/NONE` applies additional mob bonus (largest on bosses), forcing tactical potion/ability usage.
- Ability/potion UX:
  - class-mismatched ability choices and low-mana ability choices are fail-soft no-ops (no run revert).
- Deterministic convergence:
  - `forgeSetPiece` rewrites equipped item seed to a target in-band set id and sinks MMO + stones.

## Local Deploy (Anvil)

Start node:

```sh
anvil --port 8555 --chain-id 31337 --code-size-limit 40000
```

Deploy:

```sh
# Production-style deploy (external MMO token address must already exist):
PRIVATE_KEY=0x... \
MMO_TOKEN_ADDRESS=0x... \
forge script script/DeployChainMMO.s.sol:DeployChainMMO \
  --rpc-url http://127.0.0.1:8555 \
  --broadcast \
  --disable-code-size-limit \
  --non-interactive
```

```sh
# Dev/test stand-in token deploy mode (for testnet/devnet validation):
PRIVATE_KEY=0x... \
DEPLOY_TEST_MMO=true \
forge script script/DeployChainMMO.s.sol:DeployChainMMO \
  --rpc-url http://127.0.0.1:8555 \
  --broadcast \
  --disable-code-size-limit \
  --non-interactive
```

Deploy + automatically sync middleware/frontend contract metadata:

```sh
PRIVATE_KEY=0x... \
RPC_URL=http://127.0.0.1:8555 \
CHAIN_ID=31337 \
MMO_TOKEN_ADDRESS=0x... \
./script/deploy-and-sync.sh
```

```sh
# Or deploy-and-sync with a local stand-in MMO token:
PRIVATE_KEY=0x... \
RPC_URL=http://127.0.0.1:8555 \
CHAIN_ID=31337 \
DEPLOY_TEST_MMO=true \
./script/deploy-and-sync.sh
```

Address sync artifacts:

- Middleware env target: `/Users/stokarz/Code/chainmmo/mid/.env`
- Frontend artifact: `/Users/stokarz/Code/chainmmo/front/contracts.latest.json`
- Shared artifact: `/Users/stokarz/Code/chainmmo/deployments/contracts.latest.json`

Manual sync from an existing Foundry broadcast:

```sh
node script/sync-deployment-addresses.mjs --chain-id 31337
```

Latest local deployment:

- Always read addresses from `deployments/contracts.latest.json` after `./script/deploy-and-sync.sh` runs.

Broadcast artifact:

- `broadcast/DeployChainMMO.s.sol/31337/run-latest.json`

Runtime size note:

- `GameWorld` currently exceeds EIP-170 runtime size (24,576 bytes). Local deploy requires the flags above.
- Monad supports larger contracts; CI uses a Monad size preset gate instead of the EIP-170 enforcement in `forge build --sizes`.
