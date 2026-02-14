// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {GameTypes} from "./GameTypes.sol";

/// @notice ChainMMO.com
/// @notice Product tagline: "MMO to be played by LLMs."
/// @notice Product description: Infinite fantasy themed dungeon crawler, built to be played through the LLM and TUI.
/// @notice All interactions and game state fetching happen on the target EVM chain (Monad in production).
/// @dev We are building this to create a new standard for benchmarking agents performance in permissionless environment
/// with economic rules and multiple bots competing, and we plan on to release more games for AI labs to test their
/// agentic frameworks on.
library GameConstants {
    uint8 internal constant MAX_CHARACTERS_PER_WALLET = 5;
    uint8 internal constant MAX_POTION_CHARGES = 1;
    uint8 internal constant ROOM_MIN = 5;
    uint8 internal constant ROOM_MAX = 11;

    uint16 internal constant BPS = 10_000;
    uint16 internal constant MIN_EFFECTIVE_POWER_BPS = 2_000;
    uint16 internal constant EASY_BPS = 10_000;
    uint16 internal constant NORMAL_BPS = 11_250;
    uint16 internal constant HARD_BPS = 12_400;
    uint16 internal constant EXTREME_BPS = 14_500;
    uint16 internal constant CHALLENGER_BPS = 17_200;

    uint16 internal constant POWER_POTION_BONUS_BPS = 2_500;
    uint16 internal constant POWER_POTION_STRONG_BONUS_BPS = 4_000;
    uint16 internal constant POWER_POTION_EXTREME_BONUS_BPS = 6_000;
    uint16 internal constant MAGE_ABILITY_BONUS_BPS = 4_000;
    uint16 internal constant WARRIOR_ABILITY_BONUS_BPS = 4_000;
    uint16 internal constant PALADIN_ABILITY_BONUS_BPS = 2_400;
    uint16 internal constant WARRIOR_EXTRA_DAMAGE_BPS = 1_500;
    uint16 internal constant HP_POTION_RESTORE_BPS = 3_500;
    uint16 internal constant HP_POTION_RESTORE_STRONG_BPS = 5_000;
    uint16 internal constant HP_POTION_RESTORE_EXTREME_BPS = 7_000;
    uint16 internal constant MANA_POTION_RESTORE_BPS = 4_000;
    uint16 internal constant MANA_POTION_RESTORE_STRONG_BPS = 5_500;
    uint16 internal constant MANA_POTION_RESTORE_EXTREME_BPS = 7_500;
    uint16 internal constant MAGE_ABILITY_MANA_COST_BPS = 2_000;
    uint16 internal constant WARRIOR_ABILITY_MANA_COST_BPS = 1_000;
    uint16 internal constant PALADIN_ABILITY_MANA_COST_BPS = 2_500;

    uint8 internal constant EASY_LOOT_COUNT = 1;
    uint8 internal constant NORMAL_LOOT_COUNT = 1;
    uint8 internal constant HARD_LOOT_COUNT = 4;
    uint8 internal constant EXTREME_LOOT_COUNT = 7;
    uint8 internal constant CHALLENGER_LOOT_COUNT = 10;

    uint32 internal constant DAY_IN_SECONDS = 1 days;
    uint32 internal constant EPOCH_IN_SECONDS = 1 hours;
    uint32 internal constant FIRST_DAILY_LOOTBOXES = 1000;
    uint16 internal constant MAX_BUY_PER_TX = 200;

    uint256 internal constant WAD = 1e18;
    uint256 internal constant LOOTBOX_BASE_PRICE = 0.001 ether;
    uint256 internal constant COMMIT_ACTION_FEE = 0.00001 ether;
    uint256 internal constant RFQ_CREATE_FEE = 0.00001 ether;
    uint256 internal constant TRADE_OFFER_CREATE_FEE = 0.00001 ether;
    uint40 internal constant RFQ_MAX_TTL = 7 days;
    uint40 internal constant TRADE_OFFER_TTL = 7 days;
    uint256 internal constant PRICE_GROWTH_WAD = 1.15e18;
    uint256 internal constant FEE_PLAYERS_BPS = 9_000;
    uint256 internal constant FEE_DEPLOYER_BPS = 1_000;
    uint256 internal constant TOP_DECILE_DIVISOR = 10;
    uint256 internal constant WEIGHT_BASE_WAD = 1.1e18;
    uint256 internal constant WEIGHT_CLAMP = 256;

    uint256 internal constant MMO_SUPPLY = 500_000_000 ether;
    uint256 internal constant MMO_SINK_BASE = 50 ether;
    uint256 internal constant MMO_SINK_GROWTH_WAD = 1.07e18;
    uint256 internal constant MMO_SINK_MAX_PER_LOOTBOX = 2_000_000 ether;
    address internal constant MMO_SINK_ADDRESS = address(0x000000000000000000000000000000000000dEaD);

    uint256 internal constant MMO_REWARD_BASE = 25 ether;
    uint256 internal constant MMO_REWARD_GROWTH_WAD = 1.08e18;

    uint256 internal constant DUNGEON_BASE_POWER_WAD = 286e18;
    uint256 internal constant DUNGEON_LEVEL_GROWTH_WAD = 1.154e18;
    uint256 internal constant DUNGEON_POST_10_GROWTH_WAD = 1.045e18;
    uint256 internal constant DUNGEON_POST_25_GROWTH_WAD = 1.105e18;

    uint16 internal constant BOSS_POWER_BPS = 17_500;
    uint16 internal constant BOSS_DAMAGE_BPS = 15_000;
    uint16 internal constant TEMPLATE_MIN_BPS = 8_500;
    uint16 internal constant TEMPLATE_MAX_BPS = 11_500;
    uint16 internal constant ROOM_DAMAGE_BASE_BPS = 6_000;
    uint16 internal constant NO_TACTIC_BOSS_MOB_BONUS_BPS = 1_800;
    uint16 internal constant NO_TACTIC_ROOM_MOB_BONUS_BPS = 300;
    uint16 internal constant NO_TACTIC_BONUS_PER_LEVEL_BPS = 25;
    uint16 internal constant NO_TACTIC_BOSS_MOB_BONUS_MAX_BPS = 4_200;
    uint16 internal constant NO_TACTIC_ROOM_MOB_BONUS_MAX_BPS = 1_500;

    uint8 internal constant VARIANCE_MODE_COUNT = 3;
    uint8 internal constant NUM_SETS = 48;
    uint8 internal constant SETS_PER_BAND = 8;

    uint16 internal constant SET_2PC_PRIMARY_BPS = 1200;
    uint16 internal constant SET_4PC_PRIMARY_BPS = 1800;
    uint16 internal constant SET_4PC_SECONDARY_BPS = 700;
    uint16 internal constant SET_6PC_OFFSTAT_BPS = 900;
    uint16 internal constant SET_8PC_ALL_BPS = 1800;
    uint16 internal constant MISSING_SET_PENALTY_BPS = 700;
    uint16 internal constant MISSING_MATCHED_SET_PENALTY_BPS = 850;
    uint16 internal constant MISSING_AFFIX_PENALTY_BPS = 600;
    uint16 internal constant HIGH_AFFIX_THRESHOLD_BPS = 11_800;

    uint16 internal constant STONE_DROP_EASY_BPS = 500;
    uint16 internal constant STONE_DROP_NORMAL_BPS = 1000;
    uint16 internal constant STONE_DROP_HARD_BPS = 1800;
    uint16 internal constant STONE_DROP_EXTREME_BPS = 2800;
    uint16 internal constant STONE_DROP_CHALLENGER_BPS = 4000;
    uint8 internal constant UPGRADE_STONE_REASON_DUNGEON = 1;

    uint256 internal constant REPAIR_BASE = 80 ether;
    uint256 internal constant REPAIR_GROWTH_WAD = 1.07e18;
    uint256 internal constant REPAIR_MAX = 2_000_000 ether;
    uint256 internal constant RUN_ENTRY_BASE = 15 ether;
    uint256 internal constant RUN_ENTRY_GROWTH_WAD = 1.06e18;
    uint256 internal constant RUN_ENTRY_MAX = 50_000 ether;
    uint256 internal constant FORGE_SET_BASE_MMO = 500 ether;
    uint256 internal constant FORGE_SET_TIER_MMO = 30 ether;
    uint256 internal constant FORGE_SET_MAX_MMO = 150_000 ether;
    uint8 internal constant FORGE_SET_BASE_STONES = 2;
    uint8 internal constant FORGE_SET_MAX_STONES = 7;
    uint32 internal constant FORGED_SET_MAGIC = 0xC0DEC0DE;

    function difficultyMultiplierBps(GameTypes.Difficulty difficulty) internal pure returns (uint16) {
        if (difficulty == GameTypes.Difficulty.EASY) return EASY_BPS;
        if (difficulty == GameTypes.Difficulty.NORMAL) return NORMAL_BPS;
        if (difficulty == GameTypes.Difficulty.HARD) return HARD_BPS;
        if (difficulty == GameTypes.Difficulty.EXTREME) return EXTREME_BPS;
        return CHALLENGER_BPS;
    }

    function lootTierBonus(GameTypes.Difficulty difficulty) internal pure returns (uint8) {
        if (difficulty == GameTypes.Difficulty.HARD) return 3;
        if (difficulty == GameTypes.Difficulty.EXTREME) return 6;
        if (difficulty == GameTypes.Difficulty.CHALLENGER) return 9;
        return 0;
    }

    function lootCount(GameTypes.Difficulty difficulty) internal pure returns (uint8) {
        if (difficulty == GameTypes.Difficulty.CHALLENGER) return CHALLENGER_LOOT_COUNT;
        if (difficulty == GameTypes.Difficulty.EXTREME) return EXTREME_LOOT_COUNT;
        if (difficulty == GameTypes.Difficulty.HARD) return HARD_LOOT_COUNT;
        if (difficulty == GameTypes.Difficulty.NORMAL) return NORMAL_LOOT_COUNT;
        return EASY_LOOT_COUNT;
    }

    function progressionUnits(GameTypes.Difficulty difficulty) internal pure returns (uint8) {
        if (difficulty == GameTypes.Difficulty.CHALLENGER) return 6;
        if (difficulty == GameTypes.Difficulty.EXTREME) return 4;
        if (difficulty == GameTypes.Difficulty.HARD) return 2;
        return 1;
    }

    function starterMobAssistBps(uint32 dungeonLevel, uint8 equippedSlots) internal pure returns (uint16) {
        if (dungeonLevel <= 2 && equippedSlots <= 1) return 5_000;
        if (dungeonLevel <= 5 && equippedSlots <= 1) return 6_500;
        if (dungeonLevel <= 10 && equippedSlots < 4) return 8_500;
        return BPS;
    }

    function upgradeStoneDropChanceBps(GameTypes.Difficulty difficulty) internal pure returns (uint16) {
        if (difficulty == GameTypes.Difficulty.EASY) return STONE_DROP_EASY_BPS;
        if (difficulty == GameTypes.Difficulty.NORMAL) return STONE_DROP_NORMAL_BPS;
        if (difficulty == GameTypes.Difficulty.HARD) return STONE_DROP_HARD_BPS;
        if (difficulty == GameTypes.Difficulty.EXTREME) return STONE_DROP_EXTREME_BPS;
        return STONE_DROP_CHALLENGER_BPS;
    }

    function minEquippedSlotsForDungeonLevel(uint32 dungeonLevel) internal pure returns (uint8) {
        if (dungeonLevel <= 5) return 1;
        if (dungeonLevel <= 10) return 4;
        return 8;
    }

    function requiredClearsForDungeonLevel(uint32 dungeonLevel) internal pure returns (uint8) {
        if (dungeonLevel <= 20) return 1;
        if (dungeonLevel <= 30) return 3;
        if (dungeonLevel <= 40) return 6;
        if (dungeonLevel <= 60) return 8;
        if (dungeonLevel <= 80) return 10;
        return 12;
    }

    function recommendedSetPiecesForDungeonLevel(uint32 dungeonLevel) internal pure returns (uint8) {
        if (dungeonLevel <= 18) return 0;
        if (dungeonLevel <= 23) return 1;
        if (dungeonLevel <= 28) return 2;
        if (dungeonLevel <= 33) return 3;
        if (dungeonLevel <= 38) return 4;
        if (dungeonLevel <= 47) return 5;
        if (dungeonLevel <= 57) return 6;
        if (dungeonLevel <= 69) return 7;
        return 8;
    }

    function recommendedMatchingSetPiecesForDungeonLevel(uint32 dungeonLevel) internal pure returns (uint8) {
        if (dungeonLevel <= 28) return 0;
        if (dungeonLevel <= 33) return 1;
        if (dungeonLevel <= 38) return 2;
        if (dungeonLevel <= 47) return 3;
        if (dungeonLevel <= 57) return 4;
        if (dungeonLevel <= 69) return 5;
        if (dungeonLevel <= 79) return 6;
        if (dungeonLevel <= 89) return 7;
        return 8;
    }

    function recommendedHighAffixPiecesForDungeonLevel(uint32 dungeonLevel) internal pure returns (uint8) {
        if (dungeonLevel <= 22) return 0;
        if (dungeonLevel <= 30) return 1;
        if (dungeonLevel <= 38) return 2;
        if (dungeonLevel <= 50) return 3;
        if (dungeonLevel <= 64) return 4;
        if (dungeonLevel <= 80) return 5;
        return 6;
    }

    function setBandBounds(uint8 band) internal pure returns (uint8 minSetId, uint8 maxSetId) {
        minSetId = band * SETS_PER_BAND;
        maxSetId = minSetId + SETS_PER_BAND - 1;
    }

    function forgeSetPieceMmoCost(uint32 tier) internal pure returns (uint256 cost) {
        cost = FORGE_SET_BASE_MMO + uint256(tier) * FORGE_SET_TIER_MMO;
        if (cost > FORGE_SET_MAX_MMO) return FORGE_SET_MAX_MMO;
    }

    function forgeSetPieceStoneCost(uint32 tier) internal pure returns (uint8 stones) {
        stones = FORGE_SET_BASE_STONES;
        if (tier >= 20) stones += 1;
        if (tier >= 35) stones += 1;
        if (tier >= 50) stones += 1;
        if (tier >= 70) stones += 1;
        if (stones > FORGE_SET_MAX_STONES) return FORGE_SET_MAX_STONES;
    }

    function tacticalMobBonusBps(
        uint32 dungeonLevel,
        bool boss,
        GameTypes.PotionChoice potionChoice,
        GameTypes.AbilityChoice abilityChoice
    ) internal pure returns (uint16 bonusBps) {
        if (dungeonLevel < 10) return 0;
        if (potionChoice != GameTypes.PotionChoice.NONE || abilityChoice != GameTypes.AbilityChoice.NONE) return 0;

        if (boss) {
            uint32 levelDelta = dungeonLevel - 10;
            uint32 bonus = NO_TACTIC_BOSS_MOB_BONUS_BPS + levelDelta * NO_TACTIC_BONUS_PER_LEVEL_BPS;
            if (bonus > NO_TACTIC_BOSS_MOB_BONUS_MAX_BPS) return NO_TACTIC_BOSS_MOB_BONUS_MAX_BPS;
            return uint16(bonus);
        }

        if (dungeonLevel < 20) return 0;
        uint32 nonBossDelta = dungeonLevel - 20;
        uint32 nonBossBonus = NO_TACTIC_ROOM_MOB_BONUS_BPS + nonBossDelta * (NO_TACTIC_BONUS_PER_LEVEL_BPS / 2);
        if (nonBossBonus > NO_TACTIC_ROOM_MOB_BONUS_MAX_BPS) return NO_TACTIC_ROOM_MOB_BONUS_MAX_BPS;
        return uint16(nonBossBonus);
    }

    function setDropChancePct(uint32 tier) internal pure returns (uint8) {
        if (tier < 11) return 0;
        if (tier <= 20) return 15;
        if (tier <= 40) return 25;
        if (tier <= 60) return 35;
        return 45;
    }

    function setBandForTier(uint32 tier) internal pure returns (uint8 band) {
        if (tier <= 19) return 0;
        if (tier <= 29) return 1;
        if (tier <= 39) return 2;
        if (tier <= 49) return 3;
        if (tier <= 69) return 4;
        return 5;
    }

    function classBaseStats(GameTypes.Class classType) internal pure returns (GameTypes.Stats memory stats) {
        if (classType == GameTypes.Class.WARRIOR) {
            return GameTypes.Stats({hp: 640, mana: 180, def: 55, manaReg: 8, hpReg: 0, atkM: 30, atkR: 125});
        }
        if (classType == GameTypes.Class.PALADIN) {
            return GameTypes.Stats({hp: 900, mana: 240, def: 95, manaReg: 10, hpReg: 0, atkM: 42, atkR: 90});
        }
        return GameTypes.Stats({hp: 560, mana: 460, def: 40, manaReg: 16, hpReg: 0, atkM: 140, atkR: 35});
    }

    function raceModifiers(GameTypes.Race race) internal pure returns (GameTypes.Stats memory stats) {
        if (race == GameTypes.Race.HUMAN) {
            return GameTypes.Stats({hp: 20, mana: 10, def: 5, manaReg: 0, hpReg: 0, atkM: 5, atkR: 5});
        }
        if (race == GameTypes.Race.DWARF) {
            return GameTypes.Stats({hp: 80, mana: 0, def: 15, manaReg: 0, hpReg: 0, atkM: 0, atkR: 8});
        }
        return GameTypes.Stats({hp: 0, mana: 70, def: 0, manaReg: 0, hpReg: 0, atkM: 15, atkR: 10});
    }
}
