// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ChainMMOBase} from "../helpers/ChainMMOBase.t.sol";
import {Vm} from "forge-std/Vm.sol";
import {GameConstants} from "../../src/libraries/GameConstants.sol";
import {GameTypes} from "../../src/libraries/GameTypes.sol";

contract SetBonusesTest is ChainMMOBase {
    function test_SetPieceDropRulesFollowTierBands() public pure {
        uint256 samples = 500;
        uint256 tier10Sets;
        uint256 tier15Sets;
        uint256 tier30Sets;
        uint256 tier50Sets;
        uint256 tier80Sets;

        for (uint256 i = 0; i < samples; i++) {
            uint64 seed = uint64(uint256(keccak256(abi.encode("set-rate", i))));
            (bool s10,) = _deriveSetInfo(seed, 10);
            (bool s15,) = _deriveSetInfo(seed, 15);
            (bool s30,) = _deriveSetInfo(seed, 30);
            (bool s50,) = _deriveSetInfo(seed, 50);
            (bool s80,) = _deriveSetInfo(seed, 80);
            if (s10) tier10Sets++;
            if (s15) tier15Sets++;
            if (s30) tier30Sets++;
            if (s50) tier50Sets++;
            if (s80) tier80Sets++;
        }

        assertEq(tier10Sets, 0);
        assertGt(tier15Sets, 20);
        assertGt(tier30Sets, tier15Sets);
        assertGt(tier50Sets, tier30Sets);
        assertGt(tier80Sets, tier50Sets);
    }

    function test_TwoPieceAndFourPieceBonusesApplyForWarrior() public {
        uint256 characterId = _createCharacter(playerA, "SetWarrior");
        _forceLevel(characterId, 19);

        uint32 tier = 20;
        uint8 targetSetId = 8;
        uint64 setSeed = _findSeedForSet(tier, targetSetId, 7_001);

        uint256 head = _forceMintItem(playerA, GameTypes.Slot.HEAD, tier, setSeed);
        uint256 chest = _forceMintItem(playerA, GameTypes.Slot.CHEST, tier, setSeed);
        uint256 feet = _forceMintItem(playerA, GameTypes.Slot.FEET, tier, setSeed);
        uint256 offHand = _forceMintItem(playerA, GameTypes.Slot.OFF_HAND, tier, setSeed);

        vm.startPrank(playerA);
        GameTypes.Stats memory base = _characterStats(characterId);

        world.equipItem(characterId, head);
        GameTypes.Stats memory onePiece = _characterStats(characterId);
        assertEq(onePiece.atkR, base.atkR);

        world.equipItem(characterId, chest);
        GameTypes.Stats memory twoPiece = _characterStats(characterId);
        uint32 expectedTwoPieceAtkR =
            base.atkR + uint32((uint256(base.atkR) * GameConstants.SET_2PC_PRIMARY_BPS) / GameConstants.BPS);
        assertEq(twoPiece.atkR, expectedTwoPieceAtkR);

        world.equipItem(characterId, feet);
        world.equipItem(characterId, offHand);
        GameTypes.Stats memory fourPiece = _characterStats(characterId);

        uint32 expectedFourPieceAtkR = base.atkR
            + uint32(
                (uint256(base.atkR) * (GameConstants.SET_2PC_PRIMARY_BPS + GameConstants.SET_4PC_PRIMARY_BPS))
                    / GameConstants.BPS
            );
        assertEq(fourPiece.atkR, expectedFourPieceAtkR);
        vm.stopPrank();
    }

    function test_MultipleTwoPieceSetBonusesStackForWarrior() public {
        uint256 characterId = _createCharacter(playerA, "MultiSetStack");
        _forceLevel(characterId, 19);

        uint32 tier = 20;
        uint8 setA = 8;
        uint8 setB = 9;
        uint64 seedA = _findSeedForSet(tier, setA, 12_001);
        uint64 seedB = _findSeedForSet(tier, setB, 12_002);

        uint256 headA = _forceMintItem(playerA, GameTypes.Slot.HEAD, tier, seedA);
        uint256 chestA = _forceMintItem(playerA, GameTypes.Slot.CHEST, tier, seedA);
        uint256 feetB = _forceMintItem(playerA, GameTypes.Slot.FEET, tier, seedB);
        uint256 offHandB = _forceMintItem(playerA, GameTypes.Slot.OFF_HAND, tier, seedB);

        (bool isSet, uint8 setId) = items.itemSetInfo(headA);
        assertTrue(isSet);
        assertEq(setId, setA);
        (isSet, setId) = items.itemSetInfo(feetB);
        assertTrue(isSet);
        assertEq(setId, setB);

        vm.startPrank(playerA);
        GameTypes.Stats memory expected = _characterStats(characterId);

        (uint32 hp, uint32 mana, uint32 def, uint32 atkM, uint32 atkR) = items.deriveBonuses(headA);
        expected.hp += hp;
        expected.mana += mana;
        expected.def += def;
        expected.atkM += atkM;
        expected.atkR += atkR;
        world.equipItem(characterId, headA);

        (hp, mana, def, atkM, atkR) = items.deriveBonuses(chestA);
        expected.hp += hp;
        expected.mana += mana;
        expected.def += def;
        expected.atkM += atkM;
        expected.atkR += atkR;
        world.equipItem(characterId, chestA);

        (hp, mana, def, atkM, atkR) = items.deriveBonuses(feetB);
        expected.hp += hp;
        expected.mana += mana;
        expected.def += def;
        expected.atkM += atkM;
        expected.atkR += atkR;
        world.equipItem(characterId, feetB);

        (hp, mana, def, atkM, atkR) = items.deriveBonuses(offHandB);
        expected.hp += hp;
        expected.mana += mana;
        expected.def += def;
        expected.atkM += atkM;
        expected.atkR += atkR;
        world.equipItem(characterId, offHandB);
        vm.stopPrank();

        uint32 atkRBps = uint32(GameConstants.SET_2PC_PRIMARY_BPS) * 2;
        expected.atkR += uint32((uint256(expected.atkR) * atkRBps) / GameConstants.BPS);

        GameTypes.Stats memory actual = _characterStats(characterId);
        assertEq(actual.hp, expected.hp);
        assertEq(actual.mana, expected.mana);
        assertEq(actual.def, expected.def);
        assertEq(actual.atkM, expected.atkM);
        assertEq(actual.atkR, expected.atkR);
    }

    function test_SetBonusEventsActivateAndDeactivateOnEquip() public {
        uint256 characterId = _createCharacter(playerA, "SetEvents");
        _forceLevel(characterId, 19);

        uint32 tier = 20;
        uint8 targetSetId = 8;
        uint64 setSeed = _findSeedForSet(tier, targetSetId, 9_001);
        uint64 nonSetSeed = _findNonSetSeed(tier, 9_777);

        uint256 headSet = _forceMintItem(playerA, GameTypes.Slot.HEAD, tier, setSeed);
        uint256 chestSet = _forceMintItem(playerA, GameTypes.Slot.CHEST, tier, setSeed);
        uint256 headNonSet = _forceMintItem(playerA, GameTypes.Slot.HEAD, tier, nonSetSeed);

        vm.startPrank(playerA);
        world.equipItem(characterId, headSet);

        vm.recordLogs();
        world.equipItem(characterId, chestSet);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        bytes32 activatedSig = keccak256("SetBonusActivated(uint256,uint8,uint8)");
        bool sawActivate;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics.length > 0 && logs[i].topics[0] == activatedSig) {
                uint8 pieceCount = abi.decode(logs[i].data, (uint8));
                if (pieceCount == 2) {
                    sawActivate = true;
                    break;
                }
            }
        }
        assertTrue(sawActivate);

        vm.recordLogs();
        world.equipItem(characterId, headNonSet);
        logs = vm.getRecordedLogs();

        bytes32 deactivatedSig = keccak256("SetBonusDeactivated(uint256,uint8)");
        bool sawDeactivate;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics.length > 0 && logs[i].topics[0] == deactivatedSig) {
                sawDeactivate = true;
                break;
            }
        }
        assertTrue(sawDeactivate);
        vm.stopPrank();
    }

    function test_SixAndEightPieceBonusesAreClassAdaptive() public {
        uint32 tier = 20;
        uint8 targetSetId = 8;
        uint64 setSeed = _findSeedForSet(tier, targetSetId, 11_111);

        for (uint8 classIndex = 0; classIndex < 3; classIndex++) {
            GameTypes.Class classType = GameTypes.Class(classIndex);
            uint256 characterId = _createCharacterWithClass(playerA, "AdaptiveSet", classType);
            _forceLevel(characterId, 19);

            GameTypes.Stats memory expected = _characterStats(characterId);

            vm.startPrank(playerA);
            for (uint8 slot = 0; slot < 8; slot++) {
                uint256 itemId = _forceMintItem(playerA, GameTypes.Slot(slot), tier, setSeed);
                (bool isSet, uint8 setId) = items.itemSetInfo(itemId);
                assertTrue(isSet);
                assertEq(setId, targetSetId);

                (uint32 hp, uint32 mana, uint32 def, uint32 atkM, uint32 atkR) = items.deriveBonuses(itemId);
                expected.hp += hp;
                expected.mana += mana;
                expected.def += def;
                expected.atkM += atkM;
                expected.atkR += atkR;

                world.equipItem(characterId, itemId);
            }
            vm.stopPrank();

            expected = _applyExpectedEightPiece(expected, classType);
            GameTypes.Stats memory actual = _characterStats(characterId);
            assertEq(actual.hp, expected.hp);
            assertEq(actual.mana, expected.mana);
            assertEq(actual.def, expected.def);
            assertEq(actual.atkM, expected.atkM);
            assertEq(actual.atkR, expected.atkR);
        }
    }

    function _findSeedForSet(uint32 tier, uint8 targetSetId, uint64 salt) internal pure returns (uint64 seed) {
        for (uint256 i = 0; i < 40_000; i++) {
            seed = uint64(uint256(keccak256(abi.encode(salt, i))));
            (bool isSet, uint8 setId) = _deriveSetInfo(seed, tier);
            if (isSet && setId == targetSetId) return seed;
        }
        revert();
    }

    function _findNonSetSeed(uint32 tier, uint64 salt) internal pure returns (uint64 seed) {
        for (uint256 i = 0; i < 20_000; i++) {
            seed = uint64(uint256(keccak256(abi.encode(salt, i))));
            (bool isSet,) = _deriveSetInfo(seed, tier);
            if (!isSet) return seed;
        }
        revert();
    }

    function _deriveSetInfo(uint64 seed, uint32 tier) internal pure returns (bool isSet, uint8 setId) {
        uint8 dropChance = GameConstants.setDropChancePct(tier);
        if (dropChance == 0) return (false, 0);

        uint256 dropRoll = uint256(keccak256(abi.encode(seed, "set"))) % 100;
        if (dropRoll >= dropChance) return (false, 0);

        uint8 band = GameConstants.setBandForTier(tier);
        uint8 localSetId = uint8(uint256(keccak256(abi.encode(seed, uint256(tier / 10)))) % GameConstants.SETS_PER_BAND);

        return (true, band * GameConstants.SETS_PER_BAND + localSetId);
    }

    function _createCharacterWithClass(address who, string memory name, GameTypes.Class classType)
        internal
        returns (uint256 characterId)
    {
        vm.prank(who);
        characterId = world.createCharacter(GameTypes.Race.HUMAN, classType, name);
    }

    function _applyExpectedEightPiece(GameTypes.Stats memory total, GameTypes.Class classType)
        internal
        pure
        returns (GameTypes.Stats memory)
    {
        uint32 hpBps = GameConstants.SET_8PC_ALL_BPS;
        uint32 manaBps = GameConstants.SET_8PC_ALL_BPS;
        uint32 defBps = GameConstants.SET_8PC_ALL_BPS;
        uint32 atkMBps = GameConstants.SET_8PC_ALL_BPS;
        uint32 atkRBps = GameConstants.SET_8PC_ALL_BPS;

        if (classType == GameTypes.Class.WARRIOR) {
            atkRBps += GameConstants.SET_2PC_PRIMARY_BPS + GameConstants.SET_4PC_PRIMARY_BPS;
            hpBps += GameConstants.SET_4PC_SECONDARY_BPS;
            defBps += GameConstants.SET_6PC_OFFSTAT_BPS;
            manaBps += GameConstants.SET_6PC_OFFSTAT_BPS;
        } else if (classType == GameTypes.Class.PALADIN) {
            defBps += GameConstants.SET_2PC_PRIMARY_BPS + GameConstants.SET_4PC_PRIMARY_BPS;
            hpBps += GameConstants.SET_4PC_SECONDARY_BPS;
            atkRBps += GameConstants.SET_6PC_OFFSTAT_BPS;
            manaBps += GameConstants.SET_6PC_OFFSTAT_BPS;
        } else {
            atkMBps += GameConstants.SET_2PC_PRIMARY_BPS + GameConstants.SET_4PC_PRIMARY_BPS;
            manaBps += GameConstants.SET_4PC_SECONDARY_BPS;
            defBps += GameConstants.SET_6PC_OFFSTAT_BPS;
            hpBps += GameConstants.SET_6PC_OFFSTAT_BPS;
        }

        total.hp += _scaleByBps(total.hp, hpBps);
        total.mana += _scaleByBps(total.mana, manaBps);
        total.def += _scaleByBps(total.def, defBps);
        total.atkM += _scaleByBps(total.atkM, atkMBps);
        total.atkR += _scaleByBps(total.atkR, atkRBps);
        return total;
    }

    function _scaleByBps(uint32 value, uint32 bps) internal pure returns (uint32) {
        return uint32((uint256(value) * bps) / GameConstants.BPS);
    }
}
