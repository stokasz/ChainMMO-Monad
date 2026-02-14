// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ChainMMOBase} from "../helpers/ChainMMOBase.t.sol";
import {GameConstants} from "../../src/libraries/GameConstants.sol";
import {GameErrors} from "../../src/libraries/GameErrors.sol";
import {GameTypes} from "../../src/libraries/GameTypes.sol";

contract UpgradeStonesTest is ChainMMOBase {
    function test_UpgradeStonesCanDropOnDungeonSuccess() public {
        uint256 characterId = _createCharacter(playerA, "StoneDrops");
        _forceLevel(characterId, 10);
        _equipFullKit(characterId, playerA, 11, 91_000);

        vm.startPrank(playerA);
        token.approve(address(world), type(uint256).max);

        bool gained;
        for (uint64 i = 0; i < 16; i++) {
            uint32 targetLevel = 11;
            uint64 nonce = uint64(60_000 + i);
            bytes32 secret = _findStoneSecret(characterId, targetLevel, GameTypes.Difficulty.EASY, nonce);
            bytes32 hash = keccak256(
                abi.encode(
                    secret,
                    playerA,
                    GameTypes.ActionType.DUNGEON_RUN,
                    characterId,
                    nonce,
                    uint8(GameTypes.Difficulty.EASY),
                    targetLevel
                )
            );
            uint256 commitId = world.commitAction{value: world.commitFee()}(
                characterId, GameTypes.ActionType.DUNGEON_RUN, hash, nonce
            );
            _rollToReveal(commitId);
            world.revealStartDungeon(commitId, secret, GameTypes.Difficulty.EASY, targetLevel);
            _drainRun(characterId);

            if (world.upgradeStoneBalance(characterId) > 0) {
                gained = true;
                break;
            }
        }
        vm.stopPrank();

        assertTrue(gained);
    }

    function _findStoneSecret(uint256 characterId, uint32 dungeonLevel, GameTypes.Difficulty difficulty, uint64 nonce)
        internal
        pure
        returns (bytes32 secret)
    {
        uint16 chanceBps = GameConstants.upgradeStoneDropChanceBps(difficulty);
        for (uint256 i = 0; i < 10_000; i++) {
            secret = keccak256(abi.encode("stone-seed", characterId, dungeonLevel, nonce, i));
            uint256 runSeed =
                uint256(keccak256(abi.encode(secret, bytes32(0), characterId, dungeonLevel, uint8(difficulty), nonce)));
            uint256 roll =
                uint256(keccak256(abi.encode(runSeed, dungeonLevel, characterId, uint8(difficulty), "stone"))) % 10_000;
            if (roll < chanceBps) return secret;
        }
        revert();
    }

    function test_RerollConsumesStoneAndPreservesTierSlotAndSet() public {
        uint256 characterId = _createCharacter(playerA, "StoneReroll");
        _forceLevel(characterId, 39);

        uint256 itemId = _forceMintItem(playerA, GameTypes.Slot.MAIN_HAND, 40, 123456);
        _forceGrantUpgradeStones(characterId, 2);

        vm.startPrank(playerA);
        world.equipItem(characterId, itemId);
        (GameTypes.Slot beforeSlot, uint32 beforeTier, uint64 beforeSeed) = items.decode(itemId);
        (bool beforeIsSet, uint8 beforeSetId) = items.itemSetInfo(itemId);

        uint32 newNonce = world.rerollItemStats(characterId, itemId);
        vm.stopPrank();

        assertEq(newNonce, 1);
        assertEq(world.upgradeStoneBalance(characterId), 1);

        (GameTypes.Slot afterSlot, uint32 afterTier, uint64 afterSeed) = items.decode(itemId);
        (bool afterIsSet, uint8 afterSetId) = items.itemSetInfo(itemId);

        assertEq(uint8(afterSlot), uint8(beforeSlot));
        assertEq(afterTier, beforeTier);
        assertEq(afterSeed, beforeSeed);
        assertEq(afterIsSet, beforeIsSet);
        assertEq(afterSetId, beforeSetId);
    }

    function test_RerollChangesDerivedStats() public {
        uint256 characterId = _createCharacter(playerA, "StoneDelta");
        _forceLevel(characterId, 59);

        uint256 itemId = _forceMintItem(playerA, GameTypes.Slot.MAIN_HAND, 60, 999_111);
        _forceGrantUpgradeStones(characterId, 3);

        vm.prank(playerA);
        world.equipItem(characterId, itemId);

        (uint32 hp0, uint32 mana0, uint32 def0, uint32 atkM0, uint32 atkR0) = items.deriveBonuses(itemId);

        bool changed;
        for (uint256 i = 0; i < 3; i++) {
            vm.prank(playerA);
            world.rerollItemStats(characterId, itemId);
            (uint32 hp1, uint32 mana1, uint32 def1, uint32 atkM1, uint32 atkR1) = items.deriveBonuses(itemId);
            if (hp1 != hp0 || mana1 != mana0 || def1 != def0 || atkM1 != atkM0 || atkR1 != atkR0) {
                changed = true;
                break;
            }
        }

        assertTrue(changed);
    }

    function test_RerollRevertsWithoutOwnershipEquipOrStone() public {
        uint256 characterId = _createCharacter(playerA, "StoneGuards");
        _forceLevel(characterId, 39);

        uint256 itemId = _forceMintItem(playerA, GameTypes.Slot.MAIN_HAND, 40, 7777);
        uint256 foreignItem = _forceMintItem(playerB, GameTypes.Slot.MAIN_HAND, 40, 8888);

        vm.prank(playerA);
        vm.expectRevert(GameErrors.InsufficientUpgradeStones.selector);
        world.rerollItemStats(characterId, itemId);

        _forceGrantUpgradeStones(characterId, 1);

        vm.prank(playerA);
        vm.expectRevert(GameErrors.NotItemOwner.selector);
        world.rerollItemStats(characterId, foreignItem);

        vm.prank(playerB);
        vm.expectRevert(GameErrors.OnlyCharacterOwner.selector);
        world.rerollItemStats(characterId, itemId);

        vm.prank(playerA);
        vm.expectRevert(GameErrors.ItemNotEquipped.selector);
        world.rerollItemStats(characterId, itemId);

        vm.prank(playerA);
        world.equipItem(characterId, itemId);

        vm.prank(playerB);
        vm.expectRevert(GameErrors.OnlyCharacterOwner.selector);
        world.rerollItemStats(characterId, itemId);
    }

    function test_RerollRevertsDuringActiveRun() public {
        uint256 characterId = _createCharacter(playerA, "StoneActiveRun");

        uint256 itemId = _forceMintItem(playerA, GameTypes.Slot.MAIN_HAND, 2, 9_901);
        _forceGrantUpgradeStones(characterId, 1);

        vm.startPrank(playerA);
        world.equipItem(characterId, itemId);

        uint64 nonce = 70_001;
        bytes32 secret = keccak256("reroll-active-run");
        bytes32 hash = keccak256(
            abi.encode(
                secret,
                playerA,
                GameTypes.ActionType.DUNGEON_RUN,
                characterId,
                nonce,
                uint8(GameTypes.Difficulty.EASY),
                uint32(2)
            )
        );
        uint256 commitId =
            world.commitAction{value: world.commitFee()}(characterId, GameTypes.ActionType.DUNGEON_RUN, hash, nonce);
        _rollToReveal(commitId);
        world.revealStartDungeon(commitId, secret, GameTypes.Difficulty.EASY, 2);

        vm.expectRevert(GameErrors.GearLockedDuringRun.selector);
        world.rerollItemStats(characterId, itemId);
        vm.stopPrank();
    }

    function _equipFullKit(uint256 characterId, address who, uint32 tier, uint64 seedBase) internal {
        for (uint8 slot = 0; slot < 8; slot++) {
            uint256 itemId = _forceMintItem(who, GameTypes.Slot(slot), tier, seedBase + slot);
            vm.prank(who);
            world.equipItem(characterId, itemId);
        }
    }

    function _drainRun(uint256 characterId) internal {
        while (true) {
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
            roomCount;
            roomsCleared;
            hp;
            mana;
            hpPotionCharges;
            manaPotionCharges;
            powerPotionCharges;
            dungeonLevel;
            difficulty;
            if (!active) return;
            world.resolveNextRoom(characterId, GameTypes.PotionChoice.NONE, GameTypes.AbilityChoice.NONE);
        }
    }
}
