// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ChainMMOBase} from "../helpers/ChainMMOBase.t.sol";
import {GameConstants} from "../../src/libraries/GameConstants.sol";
import {GameErrors} from "../../src/libraries/GameErrors.sol";
import {GameTypes} from "../../src/libraries/GameTypes.sol";

contract DungeonExecutionTest is ChainMMOBase {
    function test_DungeonSuccessDoesNotGrantMmoFaucetRewards() public {
        uint256 characterId = _createCharacter(playerA, "NoFaucetDungeon");
        _openFreeLootbox(characterId, playerA, 9701);

        uint256 firstItem = items.tokenOfOwnerByIndex(playerA, 0);
        vm.prank(playerA);
        world.equipItem(characterId, firstItem);

        uint256 mmoBefore = token.balanceOf(playerA);
        _levelUpTo(characterId, playerA, 2);
        assertEq(world.characterBestLevel(characterId), 2);
        assertEq(token.balanceOf(playerA), mmoBefore);
    }

    function test_DungeonRangeBossesProgressAndPotionLimits() public {
        uint256 characterId = _createCharacter(playerA, "DungeonRules");
        _openFreeLootbox(characterId, playerA, 77);

        vm.startPrank(playerA);
        uint256 firstItem = items.tokenOfOwnerByIndex(playerA, 0);
        world.equipItem(characterId, firstItem);

        uint64 nonceRun = 13;
        bytes32 secretRun = keccak256("run-rules");
        bytes32 runHash = keccak256(
            abi.encode(
                secretRun,
                playerA,
                GameTypes.ActionType.DUNGEON_RUN,
                characterId,
                nonceRun,
                uint8(GameTypes.Difficulty.EASY),
                uint32(2)
            )
        );
        uint256 runCommit = world.commitAction{value: world.commitFee()}(
            characterId, GameTypes.ActionType.DUNGEON_RUN, runHash, nonceRun
        );
        _rollToReveal(runCommit);
        world.revealStartDungeon(runCommit, secretRun, GameTypes.Difficulty.EASY, 2);

        (
            bool active,
            uint8 roomCount,
            uint8 roomsCleared,
            uint32 hp,
            uint32 mana,
            uint8 hpPotionCharges,
            uint8 manaPotionCharges,
            uint8 powerPotionCharges,
            uint32 dungeonLevel,
            GameTypes.Difficulty difficulty
        ) = world.getRunState(characterId);
        hp;
        mana;
        hpPotionCharges;
        manaPotionCharges;
        powerPotionCharges;
        dungeonLevel;
        difficulty;
        assertTrue(active);
        assertGe(roomCount, 5);
        assertLe(roomCount, 11);
        assertEq(roomsCleared, 0);
        assertTrue(world.isBossRoom(characterId, roomCount - 1));
        if (roomCount >= 7) {
            assertTrue(world.isBossRoom(characterId, roomCount / 2));
        }

        world.resolveNextRoom(characterId, GameTypes.PotionChoice.HP_REGEN, GameTypes.AbilityChoice.NONE);
        (
            bool activeAfter,
            uint8 roomCountAfter,
            uint8 clearedAfterFirst,
            uint32 hpAfter,
            uint32 manaAfter,
            uint8 hpPotionAfter,
            uint8 manaPotionAfter,
            uint8 powerPotionAfter,
            uint32 levelAfter,
            GameTypes.Difficulty difficultyAfter
        ) = world.getRunState(characterId);
        activeAfter;
        roomCountAfter;
        hpAfter;
        manaAfter;
        hpPotionAfter;
        manaPotionAfter;
        powerPotionAfter;
        levelAfter;
        difficultyAfter;
        assertEq(clearedAfterFirst, 1);

        vm.expectRevert(GameErrors.PotionUnavailable.selector);
        world.resolveNextRoom(characterId, GameTypes.PotionChoice.HP_REGEN, GameTypes.AbilityChoice.NONE);
        vm.stopPrank();
    }

    function test_NoPassiveRegenBetweenRooms() public {
        uint256 characterId = _createCharacter(playerA, "NoPassiveRegen");
        _openFreeLootbox(characterId, playerA, 8101);

        vm.startPrank(playerA);
        world.equipItem(characterId, items.tokenOfOwnerByIndex(playerA, 0));
        uint64 nonceRun = 8102;
        bytes32 secretRun = keccak256("regen-run");
        bytes32 runHash = keccak256(
            abi.encode(
                secretRun,
                playerA,
                GameTypes.ActionType.DUNGEON_RUN,
                characterId,
                nonceRun,
                uint8(GameTypes.Difficulty.EASY),
                uint32(1)
            )
        );
        uint256 runCommit = world.commitAction{value: world.commitFee()}(
            characterId, GameTypes.ActionType.DUNGEON_RUN, runHash, nonceRun
        );
        _rollToReveal(runCommit);
        world.revealStartDungeon(runCommit, secretRun, GameTypes.Difficulty.EASY, 1);
        world.resolveNextRoom(characterId, GameTypes.PotionChoice.NONE, GameTypes.AbilityChoice.NONE);

        (
            bool activeAfterFirst,
            uint8 roomCountAfterFirst,
            uint8 roomsClearedAfterFirst,
            uint32 hpAfterFirst,
            uint32 manaAfterFirst,
            uint8 hpPotionAfterFirst,
            uint8 manaPotionAfterFirst,
            uint8 powerPotionAfterFirst,
            uint32 dungeonLevelAfterFirst,
            GameTypes.Difficulty difficultyAfterFirst
        ) = world.getRunState(characterId);
        roomCountAfterFirst;
        roomsClearedAfterFirst;
        hpPotionAfterFirst;
        manaPotionAfterFirst;
        powerPotionAfterFirst;
        dungeonLevelAfterFirst;
        difficultyAfterFirst;

        if (activeAfterFirst) {
            world.resolveNextRoom(characterId, GameTypes.PotionChoice.NONE, GameTypes.AbilityChoice.NONE);
            (
                bool activeAfterSecond,
                uint8 roomCountAfterSecond,
                uint8 roomsClearedAfterSecond,
                uint32 hpAfterSecond,
                uint32 manaAfterSecond,
                uint8 hpPotionAfterSecond,
                uint8 manaPotionAfterSecond,
                uint8 powerPotionAfterSecond,
                uint32 dungeonLevelAfterSecond,
                GameTypes.Difficulty difficultyAfterSecond
            ) = world.getRunState(characterId);
            activeAfterSecond;
            roomCountAfterSecond;
            roomsClearedAfterSecond;
            hpPotionAfterSecond;
            manaPotionAfterSecond;
            powerPotionAfterSecond;
            dungeonLevelAfterSecond;
            difficultyAfterSecond;
            assertLe(hpAfterSecond, hpAfterFirst);
            assertLe(manaAfterSecond, manaAfterFirst);
        }
        vm.stopPrank();
    }

    function test_PowerPotionAndAbilityConsumeAndStackPath() public {
        uint256 characterId = _createCharacter(playerA, "StackedBuffs");
        _openFreeLootbox(characterId, playerA, 9101);

        vm.startPrank(playerA);
        world.equipItem(characterId, items.tokenOfOwnerByIndex(playerA, 0));
        uint64 nonceRun = 9102;
        bytes32 secretRun = keccak256("stacked-run");
        bytes32 runHash = keccak256(
            abi.encode(
                secretRun,
                playerA,
                GameTypes.ActionType.DUNGEON_RUN,
                characterId,
                nonceRun,
                uint8(GameTypes.Difficulty.CHALLENGER),
                uint32(2)
            )
        );
        uint256 runCommit = world.commitAction{value: world.commitFee()}(
            characterId, GameTypes.ActionType.DUNGEON_RUN, runHash, nonceRun
        );
        _rollToReveal(runCommit);
        world.revealStartDungeon(runCommit, secretRun, GameTypes.Difficulty.CHALLENGER, 2);

        (
            bool activeBefore,
            uint8 roomCountBefore,
            uint8 roomsClearedBefore,
            uint32 hpBefore,
            uint32 manaBefore,
            uint8 hpPotionBefore,
            uint8 manaPotionBefore,
            uint8 powerPotionBefore,
            uint32 dungeonLevelBefore,
            GameTypes.Difficulty difficultyBefore
        ) = world.getRunState(characterId);
        activeBefore;
        roomCountBefore;
        roomsClearedBefore;
        hpBefore;
        dungeonLevelBefore;
        difficultyBefore;
        world.resolveNextRoom(characterId, GameTypes.PotionChoice.POWER, GameTypes.AbilityChoice.BERSERK);

        (
            bool activeAfter,
            uint8 roomCountAfter,
            uint8 roomsClearedAfter,
            uint32 hpAfter,
            uint32 manaAfter,
            uint8 hpPotionAfter,
            uint8 manaPotionAfter,
            uint8 powerPotionAfter,
            uint32 dungeonLevelAfter,
            GameTypes.Difficulty difficultyAfter
        ) = world.getRunState(characterId);
        activeAfter;
        roomCountAfter;
        roomsClearedAfter;
        hpAfter;
        dungeonLevelAfter;
        difficultyAfter;

        uint256 manaCost = (uint256(manaBefore) * GameConstants.WARRIOR_ABILITY_MANA_COST_BPS) / GameConstants.BPS;
        assertEq(manaAfter, manaBefore - uint32(manaCost));
        assertEq(hpPotionAfter, hpPotionBefore);
        assertEq(manaPotionAfter, manaPotionBefore);
        assertEq(powerPotionBefore, 1);
        assertEq(powerPotionAfter, 0);
        vm.stopPrank();
    }

    function test_AbilityThenPowerPotionOrderIsMultiplicative() public pure {
        uint256 base = 10_000;
        uint256 afterAbility =
            (base * (GameConstants.BPS + GameConstants.WARRIOR_ABILITY_BONUS_BPS)) / GameConstants.BPS;
        uint256 afterPotion =
            (afterAbility * (GameConstants.BPS + GameConstants.POWER_POTION_BONUS_BPS)) / GameConstants.BPS;
        uint256 additive =
            (base
                    * (GameConstants.BPS
                        + GameConstants.WARRIOR_ABILITY_BONUS_BPS
                        + GameConstants.POWER_POTION_BONUS_BPS)) / GameConstants.BPS;
        assertEq(afterPotion, 17_500);
        assertGt(afterPotion, additive);
    }

    function test_AbilityChoiceSoftFailsWithoutManaOrClassMatch() public {
        uint256 characterId = _createCharacter(playerA, "SoftAbilityFail");
        _openFreeLootbox(characterId, playerA, 9801);

        vm.startPrank(playerA);
        world.equipItem(characterId, items.tokenOfOwnerByIndex(playerA, 0));
        uint64 nonceRun = 9802;
        bytes32 secretRun = keccak256("soft-fail-run");
        bytes32 runHash = keccak256(
            abi.encode(
                secretRun,
                playerA,
                GameTypes.ActionType.DUNGEON_RUN,
                characterId,
                nonceRun,
                uint8(GameTypes.Difficulty.EASY),
                uint32(2)
            )
        );
        uint256 runCommit = world.commitAction{value: world.commitFee()}(
            characterId, GameTypes.ActionType.DUNGEON_RUN, runHash, nonceRun
        );
        _rollToReveal(runCommit);
        world.revealStartDungeon(runCommit, secretRun, GameTypes.Difficulty.EASY, 2);

        (
            bool activeBefore,
            uint8 roomCountBefore,
            uint8 roomsClearedBefore,
            uint32 hpBefore,
            uint32 manaBefore,
            uint8 hpPotionBefore,
            uint8 manaPotionBefore,
            uint8 powerPotionBefore,
            uint32 dungeonLevelBefore,
            GameTypes.Difficulty difficultyBefore
        ) = world.getRunState(characterId);
        activeBefore;
        roomCountBefore;
        roomsClearedBefore;
        hpBefore;
        hpPotionBefore;
        manaPotionBefore;
        powerPotionBefore;
        dungeonLevelBefore;
        difficultyBefore;

        world.resolveNextRoom(characterId, GameTypes.PotionChoice.NONE, GameTypes.AbilityChoice.ARCANE_FOCUS);

        (
            bool activeAfter,
            uint8 roomCountAfter,
            uint8 roomsClearedAfter,
            uint32 hpAfter,
            uint32 manaAfter,
            uint8 hpPotionAfter,
            uint8 manaPotionAfter,
            uint8 powerPotionAfter,
            uint32 dungeonLevelAfter,
            GameTypes.Difficulty difficultyAfter
        ) = world.getRunState(characterId);
        activeAfter;
        roomCountAfter;
        roomsClearedAfter;
        hpAfter;
        hpPotionAfter;
        manaPotionAfter;
        powerPotionAfter;
        dungeonLevelAfter;
        difficultyAfter;

        assertEq(manaAfter, manaBefore);
        vm.stopPrank();
    }

    function test_Level200And201DungeonEntryHasNoHardCap() public {
        uint256 character200 = _createCharacter(playerA, "NoLevelCap200");
        _equipFullKit(character200, playerA, 2, 9901);

        _forceLevel(character200, 199);
        token.transfer(playerA, 5_000_000 ether);

        vm.startPrank(playerA);
        token.approve(address(world), type(uint256).max);
        uint64 nonceA = 9902;
        bytes32 secretA = keccak256("l200-run");
        bytes32 hashA = keccak256(
            abi.encode(
                secretA,
                playerA,
                GameTypes.ActionType.DUNGEON_RUN,
                character200,
                nonceA,
                uint8(GameTypes.Difficulty.EASY),
                uint32(200)
            )
        );
        uint256 commitA =
            world.commitAction{value: world.commitFee()}(character200, GameTypes.ActionType.DUNGEON_RUN, hashA, nonceA);
        _rollToReveal(commitA);
        world.revealStartDungeon(commitA, secretA, GameTypes.Difficulty.EASY, 200);

        (bool active200,,,,,,,,,) = world.getRunState(character200);
        assertTrue(active200);
        vm.stopPrank();

        uint256 character201 = _createCharacter(playerA, "NoLevelCap201");
        _equipFullKit(character201, playerA, 2, 9950);
        _forceLevel(character201, 200);

        vm.startPrank(playerA);
        uint64 nonceB = 9905;
        bytes32 secretB = keccak256("l201-run");
        bytes32 hashB = keccak256(
            abi.encode(
                secretB,
                playerA,
                GameTypes.ActionType.DUNGEON_RUN,
                character201,
                nonceB,
                uint8(GameTypes.Difficulty.EASY),
                uint32(201)
            )
        );
        uint256 commitB =
            world.commitAction{value: world.commitFee()}(character201, GameTypes.ActionType.DUNGEON_RUN, hashB, nonceB);
        _rollToReveal(commitB);
        world.revealStartDungeon(commitB, secretB, GameTypes.Difficulty.EASY, 201);
        (bool active201,,,,,,,,,) = world.getRunState(character201);
        assertTrue(active201);
        vm.stopPrank();
    }

    function _equipFullKit(uint256 characterId, address who, uint32 tier, uint64 seedBase) internal {
        for (uint8 slot = 0; slot < 8; slot++) {
            uint256 itemId = _forceMintItem(who, GameTypes.Slot(slot), tier, seedBase + slot);
            vm.prank(who);
            world.equipItem(characterId, itemId);
        }
    }
}
