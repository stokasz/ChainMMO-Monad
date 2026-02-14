// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {FixedPointMathLib} from "solady/utils/FixedPointMathLib.sol";
import {GameConstants} from "../../src/libraries/GameConstants.sol";
import {GameTypes} from "../../src/libraries/GameTypes.sol";

contract CombatCalibrationTest is Test {
    function test_DumbAgentCalibrationHitsTargetBands() public pure {
        uint256 runs = 400;
        uint256 winsL1;
        uint256 winsL10;

        for (uint256 i = 0; i < runs; i++) {
            if (_simulateRun(1, uint256(keccak256(abi.encode("L1", i))))) winsL1++;
            if (_simulateRun(10, uint256(keccak256(abi.encode("L10", i))))) winsL10++;
        }

        uint256 l1Bps = (winsL1 * GameConstants.BPS) / runs;
        uint256 l10Bps = (winsL10 * GameConstants.BPS) / runs;

        assertGe(l1Bps, 5_000);
        assertLe(l1Bps, 7_000);
        assertGe(l10Bps, 1_200);
        assertLe(l10Bps, 2_800);
    }

    function test_DumbAgentSuccessRateShowsDownwardTrend() public pure {
        uint256 runs = 180;
        uint256[10] memory bpsByLevel;
        for (uint32 level = 1; level <= 10; level++) {
            uint256 wins;
            for (uint256 i = 0; i < runs; i++) {
                if (_simulateRun(level, uint256(keccak256(abi.encode(level, i))))) wins++;
            }
            bpsByLevel[level - 1] = (wins * GameConstants.BPS) / runs;
        }

        uint256 decreases;
        for (uint256 i = 0; i < 9; i++) {
            if (bpsByLevel[i] >= bpsByLevel[i + 1]) decreases++;
        }

        assertGt(bpsByLevel[0], bpsByLevel[9]);
        assertGe(decreases, 6);
    }

    function test_EliteStrategyEventuallyHitsHardWall() public pure {
        uint256 runs = 300;
        uint256 winsL40;
        uint256 winsL200;
        for (uint256 i = 0; i < runs; i++) {
            if (_simulateEliteStrategicRun(40, uint256(keccak256(abi.encode("L40", i))))) winsL40++;
            if (_simulateEliteStrategicRun(200, uint256(keccak256(abi.encode("L200", i))))) winsL200++;
        }
        uint256 l40Bps = (winsL40 * GameConstants.BPS) / runs;
        uint256 l200Bps = (winsL200 * GameConstants.BPS) / runs;
        assertGt(l40Bps, l200Bps);
        assertEq(l200Bps, 0);
    }

    function test_MobGenerativityUsesFullRoomRange() public pure {
        bool hasMin;
        bool hasMax;
        bool hasMidBossCase;
        for (uint256 i = 0; i < 500; i++) {
            uint8 roomCount = uint8(
                GameConstants.ROOM_MIN
                    + (uint256(keccak256(abi.encode("rooms", i)))
                        % (GameConstants.ROOM_MAX - GameConstants.ROOM_MIN + 1))
            );
            if (roomCount == GameConstants.ROOM_MIN) hasMin = true;
            if (roomCount == GameConstants.ROOM_MAX) hasMax = true;
            if (roomCount >= 7) hasMidBossCase = true;
        }
        assertTrue(hasMin);
        assertTrue(hasMax);
        assertTrue(hasMidBossCase);
    }

    function _simulateRun(uint32 level, uint256 seed) internal pure returns (bool success) {
        GameTypes.Stats memory stats = _standardWarriorStats(level);
        uint256 hp = stats.hp;
        uint256 mana = stats.mana;

        uint8 roomCount = uint8(GameConstants.ROOM_MIN + (seed % (GameConstants.ROOM_MAX - GameConstants.ROOM_MIN + 1)));
        for (uint8 roomIndex = 0; roomIndex < roomCount; roomIndex++) {
            bool boss = roomIndex == roomCount - 1 || (roomCount >= 7 && roomIndex == roomCount / 2);
            uint256 mobPower = _mobPower(level, roomIndex, seed, boss);

            uint256 playerPower = uint256(stats.atkR) + uint256(stats.def) + (hp / 6) + (mana / 12);
            if (playerPower < mobPower) return false;

            uint256 scaledMobDamage = (mobPower * GameConstants.ROOM_DAMAGE_BASE_BPS) / GameConstants.BPS;
            uint256 damage = (scaledMobDamage * 100) / (uint256(stats.def) + 100);
            if (boss) damage = (damage * GameConstants.BOSS_DAMAGE_BPS) / GameConstants.BPS;
            if (damage >= hp) return false;

            hp -= damage;
        }

        success = true;
    }

    function _simulateEliteStrategicRun(uint32 level, uint256 seed) internal pure returns (bool success) {
        GameTypes.Stats memory stats = _eliteWarriorStats(level);
        uint256 hp = stats.hp;
        uint256 mana = stats.mana;
        uint256 maxHp = stats.hp;
        uint256 maxMana = stats.mana;
        uint8 hpPotions = 1;
        uint8 manaPotions = 1;
        uint8 powerPotions = 1;

        uint8 roomCount = uint8(GameConstants.ROOM_MIN + (seed % (GameConstants.ROOM_MAX - GameConstants.ROOM_MIN + 1)));
        for (uint8 roomIndex = 0; roomIndex < roomCount; roomIndex++) {
            bool boss = roomIndex == roomCount - 1 || (roomCount >= 7 && roomIndex == roomCount / 2);
            uint256 mobPower = _mobPower(level, roomIndex, seed, boss);

            uint256 attack = stats.atkR;
            uint256 defense = stats.def;
            uint256 damageBonusBps;
            uint256 abilityCost = (maxMana * GameConstants.WARRIOR_ABILITY_MANA_COST_BPS) / GameConstants.BPS;

            if (hpPotions > 0 && hp * 100 <= maxHp * 45) {
                hpPotions--;
                uint256 restored = (maxHp * GameConstants.HP_POTION_RESTORE_BPS) / GameConstants.BPS;
                hp = hp + restored > maxHp ? maxHp : hp + restored;
            }
            if (manaPotions > 0 && mana < abilityCost) {
                manaPotions--;
                uint256 restoredMana = (maxMana * GameConstants.MANA_POTION_RESTORE_BPS) / GameConstants.BPS;
                mana = mana + restoredMana > maxMana ? maxMana : mana + restoredMana;
            }

            if (mana >= abilityCost) {
                mana -= abilityCost;
                attack = (attack * (GameConstants.BPS + GameConstants.WARRIOR_ABILITY_BONUS_BPS)) / GameConstants.BPS;
                damageBonusBps = GameConstants.WARRIOR_EXTRA_DAMAGE_BPS;
            }
            if (powerPotions > 0 && (boss || roomIndex == 0)) {
                powerPotions--;
                attack = (attack * (GameConstants.BPS + GameConstants.POWER_POTION_BONUS_BPS)) / GameConstants.BPS;
            }

            uint256 playerPower = attack + defense + (hp / 6) + (mana / 12);
            if (playerPower < mobPower) return false;

            uint256 scaledMobDamage = (mobPower * GameConstants.ROOM_DAMAGE_BASE_BPS) / GameConstants.BPS;
            uint256 damage = (scaledMobDamage * 100) / (defense + 100);
            if (boss) damage = (damage * GameConstants.BOSS_DAMAGE_BPS) / GameConstants.BPS;
            if (damageBonusBps > 0) damage = (damage * (GameConstants.BPS + damageBonusBps)) / GameConstants.BPS;
            if (damage >= hp) return false;
            hp -= damage;
        }

        success = true;
    }

    function _mobPower(uint32 dungeonLevel, uint8 roomIndex, uint256 seed, bool boss)
        internal
        pure
        returns (uint256 power)
    {
        uint256 levelGrowth;
        if (dungeonLevel <= 10) {
            levelGrowth =
                FixedPointMathLib.rpow(GameConstants.DUNGEON_LEVEL_GROWTH_WAD, dungeonLevel - 1, GameConstants.WAD);
        } else {
            uint256 earlyGrowth = FixedPointMathLib.rpow(GameConstants.DUNGEON_LEVEL_GROWTH_WAD, 9, GameConstants.WAD);
            if (dungeonLevel <= 25) {
                uint256 midExponent = uint256(dungeonLevel - 10);
                if (midExponent > 5000) midExponent = 5000;
                uint256 midGrowth =
                    FixedPointMathLib.rpow(GameConstants.DUNGEON_POST_10_GROWTH_WAD, midExponent, GameConstants.WAD);
                levelGrowth = FixedPointMathLib.mulWad(earlyGrowth, midGrowth);
            } else {
                uint256 midGrowth =
                    FixedPointMathLib.rpow(GameConstants.DUNGEON_POST_10_GROWTH_WAD, 15, GameConstants.WAD);
                uint256 lateExponent = uint256(dungeonLevel - 25);
                if (lateExponent > 5000) lateExponent = 5000;
                uint256 lateGrowth =
                    FixedPointMathLib.rpow(GameConstants.DUNGEON_POST_25_GROWTH_WAD, lateExponent, GameConstants.WAD);
                levelGrowth = FixedPointMathLib.mulWad(FixedPointMathLib.mulWad(earlyGrowth, midGrowth), lateGrowth);
            }
        }
        uint256 basePower = FixedPointMathLib.mulWad(GameConstants.DUNGEON_BASE_POWER_WAD, levelGrowth) / 1e18;
        uint256 difficultyPower = (basePower * GameConstants.EASY_BPS) / GameConstants.BPS;

        uint256 roll =
            uint256(keccak256(abi.encode(seed, roomIndex, uint8(GameTypes.Difficulty.EASY), dungeonLevel))) % 3001;
        uint256 templateBps = GameConstants.TEMPLATE_MIN_BPS + roll;
        power = (difficultyPower * templateBps) / GameConstants.BPS;
        if (boss) power = (power * GameConstants.BOSS_POWER_BPS) / GameConstants.BPS;
    }

    function _standardWarriorStats(uint32 level) internal pure returns (GameTypes.Stats memory stats) {
        stats = _sumStats(
            GameConstants.classBaseStats(GameTypes.Class.WARRIOR), GameConstants.raceModifiers(GameTypes.Race.HUMAN)
        );

        if (level > 1) {
            uint32 delta = level - 1;
            stats.hp += delta * 24;
            stats.mana += delta * 10;
            stats.def += delta * 5;
            stats.atkM += delta * 8;
            stats.atkR += delta * 8;
        }

        uint32 tier = level + 1;
        uint32 roll = _medianRoll(tier);

        // V1 "standard gear" baseline uses a practical core kit rather than full best-in-slot.
        uint8[4] memory coreSlots = [
            uint8(GameTypes.Slot.CHEST),
            uint8(GameTypes.Slot.LEGS),
            uint8(GameTypes.Slot.MAIN_HAND),
            uint8(GameTypes.Slot.TRINKET)
        ];
        for (uint256 i = 0; i < coreSlots.length; i++) {
            (uint32 hp, uint32 mana, uint32 def, uint32 atkM, uint32 atkR) = _slotStats(coreSlots[i], roll);
            stats.hp += hp;
            stats.mana += mana;
            stats.def += def;
            stats.atkM += atkM;
            stats.atkR += atkR;
        }
    }

    function _eliteWarriorStats(uint32 level) internal pure returns (GameTypes.Stats memory stats) {
        stats = _sumStats(
            GameConstants.classBaseStats(GameTypes.Class.WARRIOR), GameConstants.raceModifiers(GameTypes.Race.HUMAN)
        );

        if (level > 1) {
            uint32 delta = level - 1;
            stats.hp += delta * 24;
            stats.mana += delta * 10;
            stats.def += delta * 5;
            stats.atkM += delta * 8;
            stats.atkR += delta * 8;
        }

        uint32 tier = level + 1;
        uint32 roll = uint32(((uint256(tier) * 11 + 9) * 14_500) / GameConstants.BPS);
        for (uint8 slot = 0; slot < 8; slot++) {
            (uint32 hp, uint32 mana, uint32 def, uint32 atkM, uint32 atkR) = _slotStats(slot, roll);
            stats.hp += hp;
            stats.mana += mana;
            stats.def += def;
            stats.atkM += atkM;
            stats.atkR += atkR;
        }
    }

    function _medianRoll(uint32 tier) internal pure returns (uint32) {
        uint32 range = tier * 5 + 10;
        return tier * 6 + ((range - 1) / 2);
    }

    function _slotStats(uint8 slot, uint32 roll)
        internal
        pure
        returns (uint32 hp, uint32 mana, uint32 def, uint32 atkM, uint32 atkR)
    {
        if (slot == uint8(GameTypes.Slot.HEAD)) return (roll * 3, roll, roll * 2, 0, 0);
        if (slot == uint8(GameTypes.Slot.SHOULDERS)) return (roll * 2, 0, roll * 2, 0, roll);
        if (slot == uint8(GameTypes.Slot.CHEST)) return (roll * 5, roll, roll * 3, 0, 0);
        if (slot == uint8(GameTypes.Slot.LEGS)) return (roll * 4, 0, roll * 2, 0, roll);
        if (slot == uint8(GameTypes.Slot.FEET)) return (roll * 2, roll * 2, roll, 0, 0);
        if (slot == uint8(GameTypes.Slot.MAIN_HAND)) return (0, 0, 0, roll * 3, roll * 4);
        if (slot == uint8(GameTypes.Slot.OFF_HAND)) return (0, roll * 2, roll * 2, roll * 2, 0);
        return (0, roll * 3, 0, roll * 2, roll * 2);
    }

    function _sumStats(GameTypes.Stats memory a, GameTypes.Stats memory b)
        internal
        pure
        returns (GameTypes.Stats memory result)
    {
        result.hp = a.hp + b.hp;
        result.mana = a.mana + b.mana;
        result.def = a.def + b.def;
        result.manaReg = a.manaReg + b.manaReg;
        result.hpReg = a.hpReg + b.hpReg;
        result.atkM = a.atkM + b.atkM;
        result.atkR = a.atkR + b.atkR;
    }
}
