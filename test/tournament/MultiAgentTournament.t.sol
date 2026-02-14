// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ChainMMOBase} from "../helpers/ChainMMOBase.t.sol";
import {GameConstants} from "../../src/libraries/GameConstants.sol";
import {GameTypes} from "../../src/libraries/GameTypes.sol";
import {console2} from "forge-std/console2.sol";

/// @notice Multi-agent tournament v5: bounded rounds, reward-optimized strategies, leaderboard claim test.
/// @dev Smart difficulty scaling, proactive stone/RFQ usage, epoch finalization + claim verification.
contract MultiAgentTournament is ChainMMOBase {
    struct AgentConfig {
        address wallet;
        string name;
        GameTypes.Race race;
        GameTypes.Class classType;
        GameTypes.Difficulty difficulty;
        GameTypes.VarianceMode variance;
        bool adaptive;
        bool potionAggressive;
        bool setFarmer;
        bool rfqMaker;
        bool rfqTaker;
        bool premiumBuyer;
        bool whaleBuyer;
        bool sybil;
    }

    struct AgentState {
        uint256 characterId;
        uint64 nonceCounter;
        uint32 dungeonSuccesses;
        uint32 dungeonFailures;
        uint32 totalRoomsSurvived;
        uint32 totalRoomsAttempted;
        uint32 txCount;
        uint32 revertCount;
        uint32 itemsMinted;
        uint32 itemsEquipped;
        uint256 ethSpent;
        uint32 rfqsCreated;
        uint32 rfqsFilled;
        uint32 premiumBuyTxs;
        uint32 premiumBoxesBought;
        uint32 consecutiveFailures;
        // Combat tracking
        uint32 bossesEncountered;
        uint32 bossesDefeated;
        uint32 hpPotionsUsed;
        uint32 manaPotionsUsed;
        uint32 powerPotionsUsed;
        uint32 abilitiesUsed;
        // MMO economy tracking
        uint256 mmoRepairSunk;
        uint256 mmoEntryFeeSunk;
        uint256 mmoPremiumSunk;
        uint256 mmoRfqSpent;
        // Stone + RFQ mid-progression tracking
        uint32 stonesUsed;
        uint32 midRfqsCreated;
        uint32 midRfqsFilled;
        // Leaderboard claims
        uint256 ethClaimed;
    }

    uint8 constant NUM_AGENTS = 10;
    uint16 constant ROUNDS = 25;
    uint16 constant EQUIP_SCAN_CAP = 200;
    uint16 constant RFQ_SCAN_CAP = 100;
    uint256 constant MMO_START_BALANCE = 50_000 ether;

    AgentConfig[NUM_AGENTS] internal configs;
    AgentState[NUM_AGENTS] internal states;

    function setUp() public override {
        super.setUp();

        for (uint8 i = 0; i < NUM_AGENTS; i++) {
            address wallet = address(uint160(0xA6E0 + i));
            vm.deal(wallet, 100 ether);
            token.transfer(wallet, MMO_START_BALANCE);
        }

        // Agent 0: SteadyStable — Paladin/Dwarf, EASY+STABLE, moderate premium (control)
        configs[0] = AgentConfig({
            wallet: address(uint160(0xA6E0)),
            name: "SteadyStable",
            race: GameTypes.Race.DWARF,
            classType: GameTypes.Class.PALADIN,
            difficulty: GameTypes.Difficulty.EASY,
            variance: GameTypes.VarianceMode.STABLE,
            adaptive: false,
            potionAggressive: false,
            setFarmer: false,
            rfqMaker: false,
            rfqTaker: false,
            premiumBuyer: true,
            whaleBuyer: false,
            sybil: false
        });

        // Agent 1: SwingHunter — Mage/Elf, HARD+SWINGY, high-risk pusher (stones + 2x units)
        configs[1] = AgentConfig({
            wallet: address(uint160(0xA6E1)),
            name: "SwingHunter",
            race: GameTypes.Race.ELF,
            classType: GameTypes.Class.MAGE,
            difficulty: GameTypes.Difficulty.HARD,
            variance: GameTypes.VarianceMode.SWINGY,
            adaptive: false,
            potionAggressive: false,
            setFarmer: false,
            rfqMaker: false,
            rfqTaker: false,
            premiumBuyer: true,
            whaleBuyer: false,
            sybil: false
        });

        // Agent 2: NeutralBalancer — Warrior/Human, SMART adaptive, NEUTRAL
        configs[2] = AgentConfig({
            wallet: address(uint160(0xA6E2)),
            name: "NeutralBalancer",
            race: GameTypes.Race.HUMAN,
            classType: GameTypes.Class.WARRIOR,
            difficulty: GameTypes.Difficulty.NORMAL,
            variance: GameTypes.VarianceMode.NEUTRAL,
            adaptive: true,
            potionAggressive: false,
            setFarmer: false,
            rfqMaker: false,
            rfqTaker: false,
            premiumBuyer: true,
            whaleBuyer: false,
            sybil: false
        });

        // Agent 3: PotionOptimizer — Warrior/Dwarf, NORMAL+NEUTRAL, potion-aggressive
        configs[3] = AgentConfig({
            wallet: address(uint160(0xA6E3)),
            name: "PotionOptimizer",
            race: GameTypes.Race.DWARF,
            classType: GameTypes.Class.WARRIOR,
            difficulty: GameTypes.Difficulty.NORMAL,
            variance: GameTypes.VarianceMode.NEUTRAL,
            adaptive: false,
            potionAggressive: true,
            setFarmer: false,
            rfqMaker: false,
            rfqTaker: false,
            premiumBuyer: true,
            whaleBuyer: false,
            sybil: false
        });

        // Agent 4: SetFarmer — Mage/Elf, EASY+STABLE, set-focused with active RFQ
        configs[4] = AgentConfig({
            wallet: address(uint160(0xA6E4)),
            name: "SetFarmer",
            race: GameTypes.Race.ELF,
            classType: GameTypes.Class.MAGE,
            difficulty: GameTypes.Difficulty.EASY,
            variance: GameTypes.VarianceMode.STABLE,
            adaptive: false,
            potionAggressive: false,
            setFarmer: true,
            rfqMaker: false,
            rfqTaker: false,
            premiumBuyer: true,
            whaleBuyer: false,
            sybil: false
        });

        // Agent 5: PremiumWhale — Warrior/Human, EASY+STABLE, buys max premium batches
        configs[5] = AgentConfig({
            wallet: address(uint160(0xA6E5)),
            name: "PremiumWhale",
            race: GameTypes.Race.HUMAN,
            classType: GameTypes.Class.WARRIOR,
            difficulty: GameTypes.Difficulty.EASY,
            variance: GameTypes.VarianceMode.STABLE,
            adaptive: false,
            potionAggressive: false,
            setFarmer: false,
            rfqMaker: false,
            rfqTaker: false,
            premiumBuyer: true,
            whaleBuyer: true,
            sybil: false
        });

        // Agent 6: MinimalistRunner — Warrior/Human, EASY+STABLE, free path only (no premium)
        configs[6] = AgentConfig({
            wallet: address(uint160(0xA6E6)),
            name: "MinimalistRunner",
            race: GameTypes.Race.HUMAN,
            classType: GameTypes.Class.WARRIOR,
            difficulty: GameTypes.Difficulty.EASY,
            variance: GameTypes.VarianceMode.STABLE,
            adaptive: false,
            potionAggressive: false,
            setFarmer: false,
            rfqMaker: false,
            rfqTaker: false,
            premiumBuyer: false,
            whaleBuyer: false,
            sybil: false
        });

        // Agent 7: MageSwingy — Mage/Elf, NORMAL+SWINGY, Arcane Focus on bosses
        configs[7] = AgentConfig({
            wallet: address(uint160(0xA6E7)),
            name: "MageSwingy",
            race: GameTypes.Race.ELF,
            classType: GameTypes.Class.MAGE,
            difficulty: GameTypes.Difficulty.NORMAL,
            variance: GameTypes.VarianceMode.SWINGY,
            adaptive: false,
            potionAggressive: false,
            setFarmer: false,
            rfqMaker: false,
            rfqTaker: false,
            premiumBuyer: true,
            whaleBuyer: false,
            sybil: false
        });

        // Agent 8: PaladinTank — Paladin/Dwarf, NORMAL+STABLE, Divine Shield on bosses
        configs[8] = AgentConfig({
            wallet: address(uint160(0xA6E8)),
            name: "PaladinTank",
            race: GameTypes.Race.DWARF,
            classType: GameTypes.Class.PALADIN,
            difficulty: GameTypes.Difficulty.NORMAL,
            variance: GameTypes.VarianceMode.STABLE,
            adaptive: false,
            potionAggressive: false,
            setFarmer: false,
            rfqMaker: false,
            rfqTaker: false,
            premiumBuyer: true,
            whaleBuyer: false,
            sybil: false
        });

        // Agent 9: RFQTrader — Warrior/Human, EASY+NEUTRAL, RFQ trading
        configs[9] = AgentConfig({
            wallet: address(uint160(0xA6E9)),
            name: "RFQTrader",
            race: GameTypes.Race.HUMAN,
            classType: GameTypes.Class.WARRIOR,
            difficulty: GameTypes.Difficulty.EASY,
            variance: GameTypes.VarianceMode.NEUTRAL,
            adaptive: false,
            potionAggressive: false,
            setFarmer: false,
            rfqMaker: true,
            rfqTaker: false,
            premiumBuyer: true,
            whaleBuyer: false,
            sybil: false
        });
    }

    // ── Main tournament entry ────────────────────────────────────────────

    function test_MultiAgentTournament() public {
        console2.log("=== ChainMMO Multi-Agent Tournament v5 ===");
        console2.log("Agents:", NUM_AGENTS, "| Rounds:", ROUNDS);
        console2.log("Reward-optimized with leaderboard claim test");
        console2.log("");

        _phaseInit();
        _phaseInitialEquip();
        _phaseProgression();
        _phaseRFQTrading();
        _phaseSybilTest();
        _phaseLeaderboardClaim();
        _printReport();
    }

    function test_TierGreedyBaselineStallsInPressureBand() public {
        uint256 characterId = _createCharacter(playerA, "TierGreedy");
        _forceLevel(characterId, 39);
        _equipTierGreedyNonSetKit(characterId, playerA, 40, 910_000);

        uint256 penalty = world.estimatePressurePenaltyBps(characterId, 40);
        assertGt(penalty, 3_000);

        uint32 bestAfter =
            _runPushAttempts(playerA, characterId, GameTypes.Class.WARRIOR, GameTypes.Difficulty.EASY, 8, false);
        assertLe(bestAfter, 41);
    }

    function test_SetAwareOptimizerOutperformsTierGreedyBaseline() public {
        uint256 baselineCharacter = _createCharacter(playerA, "TierGreedyBase");
        uint256 optimizerCharacter = _createCharacter(playerB, "SetAwareOpt");
        _forceLevel(baselineCharacter, 39);
        _forceLevel(optimizerCharacter, 39);

        _equipTierGreedyNonSetKit(baselineCharacter, playerA, 40, 920_000);
        _equipSetAwareKit(optimizerCharacter, playerB, 40, 24, 930_000);

        uint256 baselinePenalty = world.estimatePressurePenaltyBps(baselineCharacter, 40);
        uint256 optimizerPenalty = world.estimatePressurePenaltyBps(optimizerCharacter, 40);
        assertLt(optimizerPenalty, baselinePenalty);

        uint32 baselineBest =
            _runPushAttempts(playerA, baselineCharacter, GameTypes.Class.WARRIOR, GameTypes.Difficulty.HARD, 10, false);
        uint32 optimizerBest =
            _runPushAttempts(playerB, optimizerCharacter, GameTypes.Class.WARRIOR, GameTypes.Difficulty.HARD, 10, true);
        assertGe(optimizerBest, baselineBest);
    }

    function test_RfqSetMaskSwarmStrategyBuildsMatchingSetCore() public {
        address leader = configs[4].wallet;
        address workerA = configs[1].wallet;
        address workerB = configs[2].wallet;
        address workerC = configs[3].wallet;

        vm.prank(leader);
        uint256 leaderCharacter = world.createCharacter(GameTypes.Race.HUMAN, GameTypes.Class.WARRIOR, "SwarmLead");
        _forceLevel(leaderCharacter, 39);
        _equipTierGreedyNonSetKit(leaderCharacter, leader, 40, 940_000);

        uint8 targetSetId = 24;
        uint256 setMask = uint256(1) << targetSetId;

        uint8 matchingBefore = world.equippedHighestSetMatchCount(leaderCharacter);
        uint256 penaltyBefore = world.estimatePressurePenaltyBps(leaderCharacter, 40);

        uint256 workerItemA = _mintSetItemForSlot(workerA, GameTypes.Slot.HEAD, 40, targetSetId, 950_000);
        uint256 workerItemB = _mintSetItemForSlot(workerB, GameTypes.Slot.CHEST, 40, targetSetId, 951_000);
        uint256 workerItemC = _mintSetItemForSlot(workerC, GameTypes.Slot.LEGS, 40, targetSetId, 952_000);

        vm.startPrank(leader);
        token.approve(address(rfqMarket), type(uint256).max);
        uint256 createFee = rfqMarket.createFee();
        uint40 expiry = uint40(block.timestamp + 1 days);
        uint256 rfqA = rfqMarket.createRFQ{value: createFee}(GameTypes.Slot.HEAD, 30, setMask, 80 ether, expiry);
        uint256 rfqB = rfqMarket.createRFQ{value: createFee}(GameTypes.Slot.CHEST, 30, setMask, 80 ether, expiry);
        uint256 rfqC = rfqMarket.createRFQ{value: createFee}(GameTypes.Slot.LEGS, 30, setMask, 80 ether, expiry);
        vm.stopPrank();

        vm.startPrank(workerA);
        items.approve(address(rfqMarket), workerItemA);
        rfqMarket.fillRFQ(rfqA, workerItemA);
        vm.stopPrank();

        vm.startPrank(workerB);
        items.approve(address(rfqMarket), workerItemB);
        rfqMarket.fillRFQ(rfqB, workerItemB);
        vm.stopPrank();

        vm.startPrank(workerC);
        items.approve(address(rfqMarket), workerItemC);
        rfqMarket.fillRFQ(rfqC, workerItemC);
        vm.stopPrank();

        vm.startPrank(leader);
        world.equipItem(leaderCharacter, workerItemA);
        world.equipItem(leaderCharacter, workerItemB);
        world.equipItem(leaderCharacter, workerItemC);
        vm.stopPrank();

        uint8 matchingAfter = world.equippedHighestSetMatchCount(leaderCharacter);
        uint256 penaltyAfter = world.estimatePressurePenaltyBps(leaderCharacter, 40);
        assertGe(matchingAfter, matchingBefore + 3);
        assertLt(penaltyAfter, penaltyBefore);
    }

    function _runPushAttempts(
        address who,
        uint256 characterId,
        GameTypes.Class classType,
        GameTypes.Difficulty difficulty,
        uint8 attempts,
        bool tactical
    ) internal returns (uint32 bestLevelAfter) {
        vm.startPrank(who);
        token.approve(address(world), type(uint256).max);

        for (uint8 i = 0; i < attempts; i++) {
            uint32 bestBefore = world.characterBestLevel(characterId);
            uint32 targetLevel = bestBefore + 1;
            bytes32 secret = keccak256(abi.encode("mini-strategy", who, characterId, i, targetLevel));
            uint64 nonce = uint64(800_000 + uint256(characterId) + i);
            bytes32 hash = keccak256(
                abi.encode(
                    secret, who, GameTypes.ActionType.DUNGEON_RUN, characterId, nonce, uint8(difficulty), targetLevel
                )
            );

            uint256 commitId = world.commitAction{value: world.commitFee()}(
                characterId, GameTypes.ActionType.DUNGEON_RUN, hash, nonce
            );
            _rollToReveal(commitId);
            world.revealStartDungeon(commitId, secret, difficulty, targetLevel);
            _resolveRunWithPolicy(characterId, classType, tactical);
        }

        vm.stopPrank();
        bestLevelAfter = world.characterBestLevel(characterId);
    }

    function _resolveRunWithPolicy(uint256 characterId, GameTypes.Class classType, bool tactical) internal {
        uint32 maxHp;
        uint32 maxMana;

        while (true) {
            (
                bool active,,
                uint8 roomsCleared,
                uint32 currentHp,
                uint32 currentMana,
                uint8 hpCharges,
                uint8 manaCharges,
                uint8 powerCharges,,
            ) = world.getRunState(characterId);
            if (!active) return;

            if (roomsCleared == 0) {
                maxHp = currentHp;
                maxMana = currentMana;
            }

            GameTypes.PotionChoice potion = GameTypes.PotionChoice.NONE;
            if (tactical) {
                bool boss = world.isBossRoom(characterId, roomsCleared);
                if (powerCharges > 0 && (boss || roomsCleared == 0)) {
                    potion = GameTypes.PotionChoice.POWER;
                } else if (hpCharges > 0 && maxHp > 0 && currentHp * 100 / maxHp < 45) {
                    potion = GameTypes.PotionChoice.HP_REGEN;
                } else if (manaCharges > 0 && maxMana > 0 && currentMana * 100 / maxMana < 30) {
                    potion = GameTypes.PotionChoice.MANA_REGEN;
                }
            }

            GameTypes.AbilityChoice ability =
                tactical ? _chooseAbility(classType, currentMana, maxMana) : GameTypes.AbilityChoice.NONE;
            world.resolveNextRoom(characterId, potion, ability);
        }
    }

    function _equipTierGreedyNonSetKit(uint256 characterId, address owner, uint32 tier, uint64 seedBase) internal {
        for (uint8 slot = 0; slot < 8; slot++) {
            uint64 seed = _findNonSetSeedForTier(tier, seedBase + uint64(slot) * 97);
            uint256 itemId = _forceMintItem(owner, GameTypes.Slot(slot), tier, seed);
            vm.prank(owner);
            world.equipItem(characterId, itemId);
        }
    }

    function _equipSetAwareKit(uint256 characterId, address owner, uint32 tier, uint8 setId, uint64 seedBase) internal {
        for (uint8 slot = 0; slot < 8; slot++) {
            uint64 seed;
            if (slot < 4) seed = _findSeedForSetTier(tier, setId, seedBase + uint64(slot) * 101);
            else seed = _findNonSetSeedForTier(tier, seedBase + uint64(slot) * 101);

            uint256 itemId = _forceMintItem(owner, GameTypes.Slot(slot), tier, seed);
            vm.prank(owner);
            world.equipItem(characterId, itemId);
        }
    }

    function _mintSetItemForSlot(address owner, GameTypes.Slot slot, uint32 tier, uint8 setId, uint64 salt)
        internal
        returns (uint256 itemId)
    {
        uint64 seed = _findSeedForSetTier(tier, setId, salt);
        itemId = _forceMintItem(owner, slot, tier, seed);
    }

    function _findNonSetSeedForTier(uint32 tier, uint64 salt) internal pure returns (uint64 seed) {
        for (uint256 i = 0; i < 40_000; i++) {
            seed = uint64(uint256(keccak256(abi.encode(salt, i))));
            (bool isSet,) = _deriveSetInfoForSeed(seed, tier);
            if (!isSet) return seed;
        }
        revert();
    }

    function _findSeedForSetTier(uint32 tier, uint8 targetSetId, uint64 salt) internal pure returns (uint64 seed) {
        for (uint256 i = 0; i < 40_000; i++) {
            seed = uint64(uint256(keccak256(abi.encode(salt, i))));
            (bool isSet, uint8 setId) = _deriveSetInfoForSeed(seed, tier);
            if (isSet && setId == targetSetId) return seed;
        }
        revert();
    }

    function _deriveSetInfoForSeed(uint64 seed, uint32 tier) internal pure returns (bool isSet, uint8 setId) {
        uint8 dropChance = GameConstants.setDropChancePct(tier);
        if (dropChance == 0) return (false, 0);

        uint256 dropRoll = uint256(keccak256(abi.encode(seed, "set"))) % 100;
        if (dropRoll >= dropChance) return (false, 0);

        uint8 band = GameConstants.setBandForTier(tier);
        uint8 localSetId = uint8(uint256(keccak256(abi.encode(seed, uint256(tier / 10)))) % GameConstants.SETS_PER_BAND);
        return (true, band * GameConstants.SETS_PER_BAND + localSetId);
    }

    // ── Phase 1: Character creation + approvals ──────────────────────────

    function _phaseInit() internal {
        console2.log("--- Phase 1: Character Creation ---");
        for (uint8 i = 0; i < NUM_AGENTS; i++) {
            AgentConfig memory cfg = configs[i];
            vm.startPrank(cfg.wallet);

            uint256 charId = world.createCharacter(cfg.race, cfg.classType, cfg.name);
            states[i].characterId = charId;
            states[i].nonceCounter = uint64(i) * 100_000 + 1;
            states[i].txCount++;

            world.claimFreeLootbox(charId);
            states[i].txCount++;

            token.approve(address(world), type(uint256).max);
            token.approve(address(feeVault), type(uint256).max);
            token.approve(address(rfqMarket), type(uint256).max);
            items.setApprovalForAll(address(rfqMarket), true);
            states[i].txCount += 4;

            vm.stopPrank();
            console2.log("  Created:", cfg.name, "-> charId", charId);
        }
    }

    // ── Phase 2: Open free lootbox & first equip ─────────────────────────

    function _phaseInitialEquip() internal {
        console2.log("--- Phase 2: Open Free Lootbox & Equip ---");
        for (uint8 i = 0; i < NUM_AGENTS; i++) {
            _openLootboxesForAgent(i, 2, 1);
            _autoEquipBest(i);
            uint8 equipped = world.equippedSlotCount(states[i].characterId);
            console2.log("  ", configs[i].name, "equipped slots:", equipped);
        }
    }

    // ── Phase 3: Main dungeon progression ────────────────────────────────

    function _phaseProgression() internal {
        console2.log("--- Phase 3: Dungeon Progression (", ROUNDS, "rounds) ---");
        for (uint16 round = 0; round < ROUNDS; round++) {
            for (uint8 i = 0; i < NUM_AGENTS; i++) {
                _runDungeonCycle(i);
            }
        }
        console2.log("  Progression complete.");
    }

    // ── Phase 4: RFQ trading ─────────────────────────────────────────────

    function _phaseRFQTrading() internal {
        console2.log("--- Phase 4: RFQ Trading ---");

        uint8 makerIdx = 9;
        AgentConfig memory makerCfg = configs[makerIdx];
        uint256 makerCharId = states[makerIdx].characterId;
        uint32 makerLevel = world.characterBestLevel(makerCharId);

        vm.startPrank(makerCfg.wallet);
        uint256 createFee = rfqMarket.createFee();
        uint40 expiry = uint40(block.timestamp + 1 days);
        for (uint8 slot = 0; slot < 8; slot++) {
            uint96 offer = uint96(10 ether);
            try rfqMarket.createRFQ{value: createFee}(GameTypes.Slot(slot), makerLevel, 0, offer, expiry) returns (
                uint256
            ) {
                states[makerIdx].rfqsCreated++;
                states[makerIdx].mmoRfqSpent += offer;
                states[makerIdx].txCount++;
            } catch {
                states[makerIdx].revertCount++;
            }
        }
        vm.stopPrank();

        for (uint8 takerIdx = 0; takerIdx < NUM_AGENTS; takerIdx++) {
            if (takerIdx == makerIdx) continue;
            AgentConfig memory takerCfg = configs[takerIdx];

            vm.startPrank(takerCfg.wallet);
            items.setApprovalForAll(address(rfqMarket), true);

            uint256 rfqCount = rfqMarket.nextRfqId();
            for (uint256 rfqId = 1; rfqId < rfqCount; rfqId++) {
                (address maker,,,,, bool active,,) = rfqMarket.rfqs(rfqId);
                if (!active) continue;
                maker;

                uint256 tokenCount = items.nextTokenId();
                uint256 tokenStart = tokenCount > RFQ_SCAN_CAP ? tokenCount - RFQ_SCAN_CAP : 1;
                for (uint256 tokenId = tokenStart; tokenId < tokenCount; tokenId++) {
                    if (items.ownerOf(tokenId) != takerCfg.wallet) continue;
                    try rfqMarket.fillRFQ(rfqId, tokenId) {
                        states[takerIdx].rfqsFilled++;
                        states[takerIdx].txCount++;
                        break;
                    } catch {}
                }
            }
            vm.stopPrank();
        }

        uint32 totalFilled;
        for (uint8 i = 0; i < NUM_AGENTS; i++) {
            totalFilled += states[i].rfqsFilled;
        }
        console2.log("  RFQs created:", states[makerIdx].rfqsCreated);
        console2.log("  RFQs filled:", totalFilled);
    }

    // ── Phase 5: Sybil adversary ─────────────────────────────────────────

    function _phaseSybilTest() internal {
        console2.log("--- Phase 5: Sybil Test ---");
        uint8 sybilIdx = 6;
        AgentConfig memory cfg = configs[sybilIdx];

        vm.startPrank(cfg.wallet);
        uint256 created = 1;
        for (uint8 c = 1; c < 6; c++) {
            try world.createCharacter(
                GameTypes.Race(c % 3), GameTypes.Class(c % 3), string.concat("Sybil", vm.toString(c))
            ) returns (
                uint256 extraCharId
            ) {
                created++;
                states[sybilIdx].txCount++;
                world.claimFreeLootbox(extraCharId);
                states[sybilIdx].txCount++;
                extraCharId;
            } catch {
                states[sybilIdx].revertCount++;
                break;
            }
        }
        vm.stopPrank();
        console2.log("  Sybil extra characters created:", created - 1);
        console2.log("  Max wallet limit enforced:", created <= 5);
    }

    // ── Phase 6: Leaderboard reward claiming ────────────────────────────

    function _phaseLeaderboardClaim() internal {
        console2.log("--- Phase 6: Leaderboard Claim Test ---");

        // Current epoch during progression
        uint32 progressionEpoch = uint32(block.timestamp / GameConstants.EPOCH_IN_SECONDS);
        console2.log("  Progression epoch:", progressionEpoch);

        // Check fees collected in the progression epoch
        uint256 feesCollected = feeVault.epochEthFees(progressionEpoch);
        console2.log("  ETH fees in epoch:", feesCollected);

        if (feesCollected == 0) {
            console2.log("  SKIP: No ETH fees collected in epoch (no premium purchases?)");
            return;
        }

        // Warp time forward past the epoch boundary (1 hour)
        vm.warp(block.timestamp + GameConstants.EPOCH_IN_SECONDS + 1);
        uint32 newEpoch = uint32(block.timestamp / GameConstants.EPOCH_IN_SECONDS);
        console2.log("  Warped to epoch:", newEpoch);

        // Finalize the progression epoch
        bool finalized = false;
        try feeVault.finalizeEpoch(progressionEpoch) {
            finalized = true;
            console2.log("  Epoch finalized successfully");
        } catch (bytes memory reason) {
            console2.log("  FAIL: finalizeEpoch reverted");
            console2.log("  Reason bytes length:", reason.length);
        }

        if (!finalized) return;

        // Read epoch snapshot
        (
            uint256 feesForPlayers,
            uint256 feesForDeployer,
            uint32 cutoffLevel,
            uint256 totalEligibleWeight,
            bool isFinalized
        ) = feeVault.epochSnapshot(progressionEpoch);

        console2.log("  Epoch snapshot:");
        console2.log("    Finalized:", isFinalized);
        console2.log("    Fees for players:", feesForPlayers);
        console2.log("    Fees for deployer:", feesForDeployer);
        console2.log("    Cutoff level:", cutoffLevel);
        console2.log("    Total eligible weight:", totalEligibleWeight);

        // Each agent tries to claim
        uint32 claimSuccesses;
        uint32 claimFailures;
        uint256 totalClaimedEth;

        for (uint8 i = 0; i < NUM_AGENTS; i++) {
            AgentConfig memory cfg = configs[i];
            uint256 charId = states[i].characterId;
            uint32 level = world.characterBestLevel(charId);

            vm.startPrank(cfg.wallet);
            try feeVault.claimPlayer(progressionEpoch, charId) returns (uint256 claimed) {
                states[i].ethClaimed = claimed;
                totalClaimedEth += claimed;
                claimSuccesses++;
                console2.log("  CLAIM OK:", cfg.name, claimed);
            } catch {
                claimFailures++;
                if (level < cutoffLevel) {
                    console2.log("  CLAIM SKIP:", cfg.name, level);
                } else {
                    console2.log("  CLAIM FAIL:", cfg.name, level);
                }
            }
            vm.stopPrank();
        }

        // Deployer claim
        vm.prank(feeDeployer);
        try feeVault.claimDeployer(progressionEpoch) returns (uint256 deployerAmount) {
            console2.log("  Deployer claimed:", deployerAmount, "wei");
        } catch {
            console2.log("  FAIL: Deployer claim reverted");
        }

        console2.log("  ---");
        console2.log("  Claim successes:", claimSuccesses);
        console2.log("  Claim failures (ineligible):", claimFailures);
        console2.log("  Total ETH claimed by players:", totalClaimedEth);
    }

    // ── Core dungeon cycle ───────────────────────────────────────────────

    function _runDungeonCycle(uint8 agentIdx) internal {
        AgentConfig memory cfg = configs[agentIdx];
        AgentState storage state = states[agentIdx];
        uint256 charId = state.characterId;
        uint32 bestLevel = world.characterBestLevel(charId);

        // Smart difficulty: pick based on level for optimal progression units
        GameTypes.Difficulty diff = _smartDifficulty(agentIdx, bestLevel);

        uint32 targetLevel = bestLevel + 1;

        (bool runActive,,,,,,,,,) = world.getRunState(charId);
        if (runActive) return;

        uint256 ethBefore = cfg.wallet.balance;

        // Gear up to meet the slot gate
        _ensureProgressionGear(agentIdx, targetLevel, diff);

        // Verify we meet the gate before attempting
        uint8 required = GameConstants.minEquippedSlotsForDungeonLevel(targetLevel);
        uint8 equipped = world.equippedSlotCount(charId);
        if (equipped < required) return;

        vm.startPrank(cfg.wallet);

        uint64 nonce = state.nonceCounter++;
        bytes32 secret = keccak256(abi.encode("run", agentIdx, charId, nonce, block.number));
        bytes32 hash = world.hashDungeonRun(secret, cfg.wallet, charId, nonce, diff, targetLevel, cfg.variance);

        bool commitOk = true;
        try world.commitActionWithVariance{value: world.commitFee()}(
            charId, GameTypes.ActionType.DUNGEON_RUN, hash, nonce, cfg.variance
        ) returns (
            uint256 commitId
        ) {
            state.txCount++;
            _rollToReveal(commitId);

            try world.revealStartDungeon(commitId, secret, diff, targetLevel, cfg.variance) {
                state.txCount++;

                // Track MMO sinks from this run
                uint256 entryFee = world.runEntryFee(targetLevel);
                if (entryFee > 0) state.mmoEntryFeeSunk += entryFee;
                uint256 repairAmount = world.repairFee(targetLevel);

                // Room-by-room combat with reactive AI
                _resolveAllRooms(agentIdx, charId, targetLevel);

                (bool stillActive,,,,,,,,,) = world.getRunState(charId);
                uint32 newBestLevel = world.characterBestLevel(charId);
                if (!stillActive && newBestLevel >= targetLevel) {
                    state.dungeonSuccesses++;
                    state.consecutiveFailures = 0;
                } else {
                    state.dungeonFailures++;
                    state.consecutiveFailures++;
                    // Repair escrow is sunk on failure
                    if (repairAmount > 0) state.mmoRepairSunk += repairAmount;
                }
            } catch {
                state.revertCount++;
                commitOk = false;
            }
        } catch {
            state.revertCount++;
            commitOk = false;
        }

        vm.stopPrank();

        // Track ETH delta (only outflow is premium purchases)
        uint256 ethAfter = cfg.wallet.balance;
        if (ethBefore > ethAfter) {
            state.ethSpent += ethBefore - ethAfter;
        }

        // Post-dungeon: open earned lootboxes and re-equip
        if (commitOk) {
            _openAllLootboxes(agentIdx);
            _autoEquipBest(agentIdx);

            uint32 postLevel = world.characterBestLevel(charId);

            // Proactive stone rerolling: use whenever we have stones and are below recommended
            if (postLevel >= 20) {
                _useUpgradeStones(agentIdx);
            }

            // Mid-progression: RFQ creation/filling for set matching at 20+
            if (postLevel >= 20) {
                _midProgressionRFQ(agentIdx);
            }
        }
    }

    // ── Smart difficulty selection ────────────────────────────────────────

    function _smartDifficulty(uint8 agentIdx, uint32 bestLevel) internal view returns (GameTypes.Difficulty) {
        AgentConfig memory cfg = configs[agentIdx];
        AgentState storage state = states[agentIdx];

        // Non-premium agents always use their config
        if (!cfg.premiumBuyer) return cfg.difficulty;

        // Adaptive agents use success-rate based logic with level awareness
        if (cfg.adaptive) {
            return _adaptiveDifficultyV2(state, bestLevel);
        }

        // Fixed-difficulty agents keep their config but clamp down on repeated failures
        if (state.consecutiveFailures >= 5 && cfg.difficulty > GameTypes.Difficulty.EASY) {
            return GameTypes.Difficulty.EASY;
        }

        return cfg.difficulty;
    }

    function _adaptiveDifficultyV2(AgentState storage state, uint32 bestLevel)
        internal
        view
        returns (GameTypes.Difficulty)
    {
        uint32 total = state.dungeonSuccesses + state.dungeonFailures;

        // Early game: EASY is fine
        if (bestLevel < 20 || total < 5) return GameTypes.Difficulty.EASY;

        uint256 successRate = (uint256(state.dungeonSuccesses) * 100) / total;

        // If failing a lot, drop to EASY
        if (state.consecutiveFailures >= 4) return GameTypes.Difficulty.EASY;

        // Level 31+: EXTREME gives 4 units (need 6 clears = 2 runs) — worth it at high WR
        if (bestLevel >= 30 && successRate >= 55) return GameTypes.Difficulty.EXTREME;

        // Level 21+: HARD gives 2 units (need 3 clears = 2 runs) — good at moderate WR
        if (bestLevel >= 20 && successRate >= 45) return GameTypes.Difficulty.HARD;

        // Fallback: NORMAL
        if (successRate >= 35) return GameTypes.Difficulty.NORMAL;

        return GameTypes.Difficulty.EASY;
    }

    function _ensureProgressionGear(uint8 agentIdx, uint32 targetLevel, GameTypes.Difficulty) internal {
        AgentConfig memory cfg = configs[agentIdx];
        if (!cfg.premiumBuyer) return;

        AgentState storage state = states[agentIdx];
        uint256 charId = state.characterId;

        GameTypes.Difficulty buyDiff = GameTypes.Difficulty.EASY;

        uint8 gateMin = GameConstants.minEquippedSlotsForDungeonLevel(targetLevel);
        uint8 target;
        if (targetLevel <= 2) {
            target = 4;
        } else {
            target = 8;
        }
        if (target < gateMin) target = gateMin;

        bool needsUpgrade = state.consecutiveFailures >= 3;

        uint8 equipped = world.equippedSlotCount(charId);
        if (equipped >= target && !needsUpgrade) return;

        uint8 maxAttempts = 5;
        for (uint8 i = 0; i < maxAttempts; i++) {
            if (equipped >= target && !needsUpgrade) break;
            if (needsUpgrade && i > 0) needsUpgrade = false;

            uint16 amount;
            if (cfg.whaleBuyer) {
                amount = 20;
            } else {
                uint8 gap = equipped < target ? target - equipped : 0;
                amount = uint16(gap * 2);
                if (amount < 4) amount = 4;
                if (amount > 20) amount = 20;
            }

            _buyPremiumLootboxes(agentIdx, buyDiff, amount);
            _openAllLootboxes(agentIdx);
            _autoEquipBest(agentIdx);
            equipped = world.equippedSlotCount(charId);
        }
    }

    function _buyPremiumLootboxes(uint8 agentIdx, GameTypes.Difficulty difficulty, uint16 amount) internal {
        AgentConfig memory cfg = configs[agentIdx];
        AgentState storage state = states[agentIdx];
        uint256 charId = state.characterId;

        vm.startPrank(cfg.wallet);
        try feeVault.quotePremiumPurchase(charId, difficulty, amount) returns (uint256 ethCost, uint256 mmoCost) {
            if (cfg.wallet.balance < ethCost) {
                vm.stopPrank();
                return;
            }
            if (token.balanceOf(cfg.wallet) < mmoCost) {
                vm.stopPrank();
                return;
            }
            try feeVault.buyPremiumLootboxes{value: ethCost}(charId, difficulty, amount) {
                state.txCount++;
                state.premiumBuyTxs++;
                state.premiumBoxesBought += amount;
                if (mmoCost > 0) state.mmoPremiumSunk += mmoCost;
            } catch {
                state.revertCount++;
            }
        } catch {
            state.revertCount++;
        }
        vm.stopPrank();
    }

    // ── Room-by-room combat with reactive AI ─────────────────────────────

    function _resolveAllRooms(uint8 agentIdx, uint256 charId, uint32 targetLevel) internal {
        AgentConfig memory cfg = configs[agentIdx];
        AgentState storage state = states[agentIdx];

        uint32 maxHp;
        uint32 maxMana;

        while (true) {
            (
                bool active,,
                uint8 roomsCleared,
                uint32 currentHp,
                uint32 currentMana,
                uint8 hpCharges,
                uint8 manaCharges,
                uint8 powerCharges,,
            ) = world.getRunState(charId);

            if (!active) break;

            // Capture max values on first room (before any damage taken)
            if (roomsCleared == 0 && maxHp == 0) {
                maxHp = currentHp;
                maxMana = currentMana;
            }

            bool isBoss = world.isBossRoom(charId, roomsCleared);
            if (isBoss) state.bossesEncountered++;

            // --- Choose potion ---
            GameTypes.PotionChoice potion = GameTypes.PotionChoice.NONE;

            // Power potion: save for boss rooms. PotionAggressive uses it on first room too.
            if (isBoss && powerCharges > 0) {
                potion = GameTypes.PotionChoice.POWER;
            } else if (cfg.potionAggressive && powerCharges > 0 && roomsCleared == 0) {
                potion = GameTypes.PotionChoice.POWER;
            }

            // HP potion when health below 40% (and no power potion chosen)
            if (potion == GameTypes.PotionChoice.NONE && hpCharges > 0 && maxHp > 0) {
                if (currentHp * 100 / maxHp < 40) {
                    potion = GameTypes.PotionChoice.HP_REGEN;
                }
            }

            // Mana potion when mana below 25% (and no other potion chosen)
            if (potion == GameTypes.PotionChoice.NONE && manaCharges > 0 && maxMana > 0) {
                if (currentMana * 100 / maxMana < 25) {
                    potion = GameTypes.PotionChoice.MANA_REGEN;
                }
            }

            // --- Choose ability ---
            // At 10+, ALWAYS use ability to avoid tactical mob bonus penalty
            GameTypes.AbilityChoice ability = GameTypes.AbilityChoice.NONE;
            if (targetLevel >= 10 || isBoss || roomsCleared == 0) {
                ability = _chooseAbility(cfg.classType, currentMana, maxMana);
            }

            // --- Resolve room ---
            uint8 clearedBefore = roomsCleared;
            bool resolved = false;

            try world.resolveNextRoom(charId, potion, ability) {
                resolved = true;
                state.txCount++;
                state.totalRoomsAttempted++;

                // Track usage on success
                if (potion == GameTypes.PotionChoice.HP_REGEN) state.hpPotionsUsed++;
                else if (potion == GameTypes.PotionChoice.MANA_REGEN) state.manaPotionsUsed++;
                else if (potion == GameTypes.PotionChoice.POWER) state.powerPotionsUsed++;
                if (ability != GameTypes.AbilityChoice.NONE) state.abilitiesUsed++;
            } catch {
                // Potion/ability might have caused revert, retry with NONE/NONE
                try world.resolveNextRoom(charId, GameTypes.PotionChoice.NONE, GameTypes.AbilityChoice.NONE) {
                    resolved = true;
                    state.txCount++;
                    state.totalRoomsAttempted++;
                } catch {
                    state.revertCount++;
                    break;
                }
            }

            if (!resolved) break;

            // Check outcome
            (,, uint8 clearedAfter,,,,,,,) = world.getRunState(charId);
            if (clearedAfter > clearedBefore) {
                state.totalRoomsSurvived++;
                if (isBoss) state.bossesDefeated++;
            }

            (bool stillActive,,,,,,,,,) = world.getRunState(charId);
            if (!stillActive) break;
        }
    }

    function _chooseAbility(GameTypes.Class classType, uint32 currentMana, uint32 maxMana)
        internal
        pure
        returns (GameTypes.AbilityChoice)
    {
        if (maxMana == 0) return GameTypes.AbilityChoice.NONE;

        if (classType == GameTypes.Class.WARRIOR) {
            uint32 cost = maxMana * GameConstants.WARRIOR_ABILITY_MANA_COST_BPS / GameConstants.BPS;
            if (currentMana >= cost) return GameTypes.AbilityChoice.BERSERK;
        } else if (classType == GameTypes.Class.MAGE) {
            uint32 cost = maxMana * GameConstants.MAGE_ABILITY_MANA_COST_BPS / GameConstants.BPS;
            if (currentMana >= cost) return GameTypes.AbilityChoice.ARCANE_FOCUS;
        } else if (classType == GameTypes.Class.PALADIN) {
            uint32 cost = maxMana * GameConstants.PALADIN_ABILITY_MANA_COST_BPS / GameConstants.BPS;
            if (currentMana >= cost) return GameTypes.AbilityChoice.DIVINE_SHIELD;
        }

        return GameTypes.AbilityChoice.NONE;
    }

    // ── Lootbox helpers ──────────────────────────────────────────────────

    function _openLootboxesForAgent(uint8 agentIdx, uint32 tier, uint16 amount) internal {
        AgentConfig memory cfg = configs[agentIdx];
        AgentState storage state = states[agentIdx];
        uint256 charId = state.characterId;

        vm.startPrank(cfg.wallet);

        (,,, uint16 openable) = world.quoteOpenLootboxes(charId, tier, amount, cfg.variance);
        if (openable == 0) {
            vm.stopPrank();
            return;
        }

        uint64 nonce = state.nonceCounter++;
        bytes32 secret = keccak256(abi.encode("open", agentIdx, charId, tier, nonce));
        bytes32 hash = world.hashLootboxOpen(secret, cfg.wallet, charId, nonce, tier, openable, cfg.variance, true);

        try world.commitActionWithVariance{value: world.commitFee()}(
            charId, GameTypes.ActionType.LOOTBOX_OPEN, hash, nonce, cfg.variance
        ) returns (
            uint256 commitId
        ) {
            state.txCount++;
            _rollToReveal(commitId);

            uint256 tokensBefore = items.nextTokenId();
            try world.revealOpenLootboxesMax(commitId, secret, tier, openable, cfg.variance) {
                state.txCount++;
                state.itemsMinted += uint32(items.nextTokenId() - tokensBefore);
            } catch {
                state.revertCount++;
            }
        } catch {
            state.revertCount++;
        }

        vm.stopPrank();
    }

    function _openAllLootboxes(uint8 agentIdx) internal {
        uint256 charId = states[agentIdx].characterId;
        uint32 bestLevel = world.characterBestLevel(charId);
        uint32 maxTier = bestLevel + 4;
        if (maxTier > 200) maxTier = 200;

        for (uint32 tier = 2; tier <= maxTier; tier++) {
            uint32 credits = world.lootboxCredits(charId, tier);
            if (credits == 0) continue;
            uint16 toOpen = credits > 20 ? 20 : uint16(credits);
            _openLootboxesForAgent(agentIdx, tier, toOpen);
        }
    }

    // ── Equip helpers ────────────────────────────────────────────────────

    function _autoEquipBest(uint8 agentIdx) internal {
        AgentConfig memory cfg = configs[agentIdx];
        AgentState storage state = states[agentIdx];
        uint256 charId = state.characterId;

        uint256 upper = items.nextTokenId();
        if (upper <= 1) return;
        uint256 lower = upper > EQUIP_SCAN_CAP ? upper - EQUIP_SCAN_CAP : 1;

        uint256[8] memory bestItems;
        uint32[8] memory bestTiers;
        uint32 bestLevel = world.characterBestLevel(charId);
        uint32 maxEquipTier = bestLevel + 1;

        for (uint256 tokenId = lower; tokenId < upper; tokenId++) {
            if (items.ownerOf(tokenId) != cfg.wallet) continue;
            (GameTypes.Slot slot, uint32 tier,) = items.decode(tokenId);
            if (tier > maxEquipTier) continue;
            uint8 slotIdx = uint8(slot);
            if (tier > bestTiers[slotIdx]) {
                bestTiers[slotIdx] = tier;
                bestItems[slotIdx] = tokenId;
            }
        }

        uint256[] memory toEquip = new uint256[](8);
        uint8 equipCount = 0;
        for (uint8 slot = 0; slot < 8; slot++) {
            if (bestItems[slot] == 0) continue;
            uint256 currentEquipped = world.equippedItemBySlot(charId, slot);
            if (currentEquipped == bestItems[slot]) continue;
            toEquip[equipCount++] = bestItems[slot];
        }

        if (equipCount == 0) return;

        uint256[] memory trimmed = new uint256[](equipCount);
        for (uint8 j = 0; j < equipCount; j++) {
            trimmed[j] = toEquip[j];
        }

        vm.prank(cfg.wallet);
        try world.equipItems(charId, trimmed) {
            state.txCount++;
            state.itemsEquipped += equipCount;
        } catch {
            state.revertCount++;
            vm.startPrank(cfg.wallet);
            for (uint8 j = 0; j < equipCount; j++) {
                try world.equipItem(charId, trimmed[j]) {
                    state.txCount++;
                    state.itemsEquipped++;
                } catch {
                    state.revertCount++;
                }
            }
            vm.stopPrank();
        }
    }

    // ── Stone rerolling (proactive) ──────────────────────────────────────

    function _useUpgradeStones(uint8 agentIdx) internal {
        AgentConfig memory cfg = configs[agentIdx];
        AgentState storage state = states[agentIdx];
        uint256 charId = state.characterId;

        uint32 stones = world.upgradeStoneBalance(charId);
        if (stones == 0) return;

        // Always reroll if we have stones and any equipped item is below high-affix threshold
        uint32 bestLevel = world.characterBestLevel(charId);
        uint8 recommendedHighAffix = GameConstants.recommendedHighAffixPiecesForDungeonLevel(bestLevel + 1);
        uint8 currentHighAffix = world.equippedHighAffixPieceCount(charId);

        // Only reroll if we're below recommended or on consecutive failures
        if (currentHighAffix >= recommendedHighAffix && state.consecutiveFailures < 2) return;

        vm.startPrank(cfg.wallet);
        for (uint8 slot = 0; slot < 8 && stones > 0; slot++) {
            uint256 equippedId = world.equippedItemBySlot(charId, slot);
            if (equippedId == 0) continue;
            if (items.isHighAffix(equippedId)) continue;

            try world.rerollItemStats(charId, equippedId) {
                state.txCount++;
                state.stonesUsed++;
                stones--;
            } catch {
                state.revertCount++;
            }
        }
        vm.stopPrank();
    }

    // ── Mid-progression RFQ ──────────────────────────────────────────────

    function _midProgressionRFQ(uint8 agentIdx) internal {
        AgentConfig memory cfg = configs[agentIdx];
        AgentState storage state = states[agentIdx];
        uint256 charId = state.characterId;
        uint32 bestLevel = world.characterBestLevel(charId);

        // Check set pressure: if below recommended, try RFQ
        uint8 recommendedSet = GameConstants.recommendedSetPiecesForDungeonLevel(bestLevel + 1);
        uint8 currentSet = world.equippedSetPieceCount(charId);
        if (currentSet >= recommendedSet) return;

        // Try to fill existing RFQs first
        vm.startPrank(cfg.wallet);
        uint256 rfqCount = rfqMarket.nextRfqId();
        for (uint256 rfqId = 1; rfqId < rfqCount; rfqId++) {
            (address maker,,,,, bool active,,) = rfqMarket.rfqs(rfqId);
            if (!active || maker == cfg.wallet) continue;

            uint256 tokenCount = items.nextTokenId();
            uint256 tokenStart = tokenCount > RFQ_SCAN_CAP ? tokenCount - RFQ_SCAN_CAP : 1;
            for (uint256 tokenId = tokenStart; tokenId < tokenCount; tokenId++) {
                if (items.ownerOf(tokenId) != cfg.wallet) continue;
                // Don't sell equipped items
                (GameTypes.Slot slot,,) = items.decode(tokenId);
                if (world.equippedItemBySlot(charId, uint8(slot)) == tokenId) continue;

                try rfqMarket.fillRFQ(rfqId, tokenId) {
                    state.midRfqsFilled++;
                    state.txCount++;
                    break;
                } catch {}
            }
        }

        // Create RFQs for set completion (even without consecutive failures)
        if (token.balanceOf(cfg.wallet) > 500 ether) {
            uint256 createFee = rfqMarket.createFee();
            uint40 expiry = uint40(block.timestamp + 1 days);
            for (uint8 slot = 0; slot < 8; slot++) {
                uint96 offer = uint96(20 ether);
                try rfqMarket.createRFQ{value: createFee}(GameTypes.Slot(slot), bestLevel, 0, offer, expiry) returns (
                    uint256
                ) {
                    state.midRfqsCreated++;
                    state.mmoRfqSpent += offer;
                    state.txCount++;
                } catch {
                    // Slot already has active RFQ or other issue
                }
            }
        }
        vm.stopPrank();

        // Re-equip after RFQ fills bring in new items
        _autoEquipBest(agentIdx);
    }

    // ── Report ───────────────────────────────────────────────────────────

    function _printReport() internal view {
        console2.log("");
        console2.log("=========================================");
        console2.log("   MULTI-AGENT TOURNAMENT v5 REPORT");
        console2.log("=========================================");
        console2.log("");

        // Sort by best level descending
        uint8[NUM_AGENTS] memory ranking;
        for (uint8 i = 0; i < NUM_AGENTS; i++) {
            ranking[i] = i;
        }
        for (uint8 i = 0; i < NUM_AGENTS; i++) {
            for (uint8 j = i + 1; j < NUM_AGENTS; j++) {
                uint32 levelI = world.characterBestLevel(states[ranking[i]].characterId);
                uint32 levelJ = world.characterBestLevel(states[ranking[j]].characterId);
                if (levelJ > levelI) {
                    uint8 tmp = ranking[i];
                    ranking[i] = ranking[j];
                    ranking[j] = tmp;
                }
            }
        }

        console2.log("--- Leaderboard ---");
        console2.log("");

        for (uint8 rank = 0; rank < NUM_AGENTS; rank++) {
            uint8 idx = ranking[rank];
            AgentConfig memory cfg = configs[idx];
            AgentState memory state = states[idx];
            uint32 bestLevel = world.characterBestLevel(state.characterId);

            console2.log("---");
            console2.log("Rank", rank + 1, ":", cfg.name);
            console2.log("  Best Level:", bestLevel);
            console2.log("  Dungeon W/L:", state.dungeonSuccesses, "/", state.dungeonFailures);
            uint32 total = state.dungeonSuccesses + state.dungeonFailures;
            if (total > 0) {
                console2.log("  Win Rate:", (state.dungeonSuccesses * 100) / total, "%");
            }
            console2.log("  TX Count:", state.txCount);
            console2.log("  Revert Count:", state.revertCount);
            console2.log("  Items Minted:", state.itemsMinted);
            console2.log("  Premium Boxes:", state.premiumBoxesBought);
            console2.log("  ETH Spent (wei):", state.ethSpent);
            console2.log("  ETH Claimed (wei):", state.ethClaimed);
            console2.log("  Equipped Slots:", world.equippedSlotCount(state.characterId));
        }

        // ── Combat Analysis ──
        console2.log("");
        console2.log("--- Combat Analysis ---");
        console2.log("");

        for (uint8 rank = 0; rank < NUM_AGENTS; rank++) {
            uint8 idx = ranking[rank];
            AgentConfig memory cfg = configs[idx];
            AgentState memory state = states[idx];

            console2.log(cfg.name);
            console2.log("  Boss W/L:", state.bossesDefeated, "/", state.bossesEncountered);
            console2.log("  Rooms Survived/Attempted:", state.totalRoomsSurvived, "/", state.totalRoomsAttempted);
            console2.log("  Power Potions:", state.powerPotionsUsed);
            console2.log("  HP Potions:", state.hpPotionsUsed);
            console2.log("  Mana Potions:", state.manaPotionsUsed);
            console2.log("  Abilities Used:", state.abilitiesUsed);
            console2.log("  Upgrade Stones Remaining:", world.upgradeStoneBalance(state.characterId));
            console2.log("  Stones Used (rerolls):", state.stonesUsed);
            console2.log("  Mid-RFQs Created:", state.midRfqsCreated);
            console2.log("  Mid-RFQs Filled:", state.midRfqsFilled);
            console2.log("  High-Affix Equipped:", world.equippedHighAffixPieceCount(state.characterId));
            console2.log("  Set Pieces Equipped:", world.equippedSetPieceCount(state.characterId));
            console2.log("  Matching Set Count:", world.equippedHighestSetMatchCount(state.characterId));
        }

        // ── MMO Economy ──
        console2.log("");
        console2.log("--- MMO Economy ---");
        console2.log("");

        uint256 globalRewards;
        uint256 globalRepairSunk;
        uint256 globalEntrySunk;
        uint256 globalPremiumSunk;
        uint256 globalRfqSpent;

        for (uint8 rank = 0; rank < NUM_AGENTS; rank++) {
            uint8 idx = ranking[rank];
            AgentConfig memory cfg = configs[idx];
            AgentState memory state = states[idx];

            uint256 mmoBalance = token.balanceOf(cfg.wallet);
            uint256 totalSunk = state.mmoRepairSunk + state.mmoEntryFeeSunk + state.mmoPremiumSunk + state.mmoRfqSpent;
            uint256 mmoFromRewards = 0;
            if (mmoBalance + totalSunk >= MMO_START_BALANCE) {
                mmoFromRewards = mmoBalance + totalSunk - MMO_START_BALANCE;
            }

            console2.log(cfg.name);
            console2.log("  MMO Rewards:", mmoFromRewards);
            console2.log("  MMO Repair Sunk:", state.mmoRepairSunk);
            console2.log("  MMO Entry Fee Sunk:", state.mmoEntryFeeSunk);
            console2.log("  MMO Premium Sunk:", state.mmoPremiumSunk);

            globalRewards += mmoFromRewards;
            globalRepairSunk += state.mmoRepairSunk;
            globalEntrySunk += state.mmoEntryFeeSunk;
            globalPremiumSunk += state.mmoPremiumSunk;
            globalRfqSpent += state.mmoRfqSpent;
        }

        // ── Global Metrics ──
        console2.log("");
        console2.log("--- Global Metrics ---");
        console2.log("Total Characters:", world.totalCharacters());
        console2.log("Max Level Reached:", world.maxLevel());
        console2.log("Items Minted Total:", items.nextTokenId() - 1);

        uint256 totalEthSpent;
        uint256 totalEthClaimed;
        uint32 totalTx;
        uint32 totalReverts;
        uint32 totalPremiumBoxes;
        for (uint8 i = 0; i < NUM_AGENTS; i++) {
            totalEthSpent += states[i].ethSpent;
            totalEthClaimed += states[i].ethClaimed;
            totalTx += states[i].txCount;
            totalReverts += states[i].revertCount;
            totalPremiumBoxes += states[i].premiumBoxesBought;
        }
        console2.log("Total ETH Spent:", totalEthSpent);
        console2.log("Total ETH Claimed:", totalEthClaimed);
        console2.log("Total Premium Boxes:", totalPremiumBoxes);
        console2.log("Total TX:", totalTx);
        console2.log("Total Reverts:", totalReverts);
        if (totalTx > 0) {
            console2.log("Revert Rate:", (totalReverts * 100) / totalTx, "%");
        }

        console2.log("");
        console2.log("--- MMO Economy Summary ---");
        console2.log("Total MMO Earned (rewards):", globalRewards);
        console2.log("Total MMO Repair Sunk:", globalRepairSunk);
        console2.log("Total MMO Entry Fee Sunk:", globalEntrySunk);
        console2.log("Total MMO Premium Sunk:", globalPremiumSunk);
        console2.log("Total MMO RFQ Spent:", globalRfqSpent);
        uint256 globalTotalSunk = globalRepairSunk + globalEntrySunk + globalPremiumSunk;
        console2.log("Total Sunk (excl RFQ):", globalTotalSunk);
        if (globalRewards > 0) {
            console2.log("Sink/Reward Ratio:", (globalTotalSunk * 100) / globalRewards, "%");
        }

        // ── Stone + Mid-Progression RFQ Summary ──
        console2.log("");
        console2.log("--- Stone & Mid-Progression RFQ Summary ---");
        uint32 totalStones;
        uint32 totalStonesRemaining;
        uint32 totalMidRfqCreated;
        uint32 totalMidRfqFilled;
        for (uint8 i = 0; i < NUM_AGENTS; i++) {
            totalStones += states[i].stonesUsed;
            totalStonesRemaining += world.upgradeStoneBalance(states[i].characterId);
            totalMidRfqCreated += states[i].midRfqsCreated;
            totalMidRfqFilled += states[i].midRfqsFilled;
        }
        console2.log("Total Stones Used:", totalStones);
        console2.log("Total Stones Remaining:", totalStonesRemaining);
        console2.log("Total Mid-RFQs Created:", totalMidRfqCreated);
        console2.log("Total Mid-RFQs Filled:", totalMidRfqFilled);

        console2.log("");
        console2.log("=========================================");
        console2.log("   END OF REPORT");
        console2.log("=========================================");
    }
}
