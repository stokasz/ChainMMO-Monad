// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ChainMMOBase} from "../helpers/ChainMMOBase.t.sol";
import {GameConstants} from "../../src/libraries/GameConstants.sol";
import {GameErrors} from "../../src/libraries/GameErrors.sol";
import {GameTypes} from "../../src/libraries/GameTypes.sol";

contract AgentWorkflowTest is ChainMMOBase {
    function test_BatchDungeonSuccessDoesNotGrantMmoFaucetRewards() public {
        uint256 characterId = _createCharacter(playerA, "BatchNoFaucet");
        _equipFullKit(characterId, playerA, 2, 330_000);

        uint256 mmoBefore = token.balanceOf(playerA);

        vm.startPrank(playerA);
        _startEasyRun(characterId, playerA, 330_100);

        GameTypes.PotionChoice[] memory potionChoices = new GameTypes.PotionChoice[](GameConstants.ROOM_MAX);
        GameTypes.AbilityChoice[] memory abilityChoices = new GameTypes.AbilityChoice[](GameConstants.ROOM_MAX);
        for (uint8 i = 0; i < GameConstants.ROOM_MAX; i++) {
            potionChoices[i] = GameTypes.PotionChoice.NONE;
            abilityChoices[i] = GameTypes.AbilityChoice.NONE;
        }

        world.resolveRooms(characterId, potionChoices, abilityChoices);
        vm.stopPrank();

        assertEq(world.characterBestLevel(characterId), 2);
        assertEq(token.balanceOf(playerA), mmoBefore);
    }

    function test_EquipItemsBatchEquipsAllSlots() public {
        uint256 characterId = _createCharacter(playerA, "BatchEquip");

        uint256[] memory itemIds = new uint256[](8);
        for (uint8 slot = 0; slot < 8; slot++) {
            itemIds[slot] = _forceMintItem(playerA, GameTypes.Slot(slot), 2, 111_000 + slot);
        }

        vm.prank(playerA);
        world.equipItems(characterId, itemIds);

        for (uint8 slot = 0; slot < 8; slot++) {
            assertEq(world.equippedItemBySlot(characterId, slot), itemIds[slot]);
        }
    }

    function test_EquipItemsBatchGuards() public {
        uint256 characterId = _createCharacter(playerA, "BatchEquipGuards");

        uint256[] memory none = new uint256[](0);
        vm.prank(playerA);
        vm.expectRevert(GameErrors.AmountZero.selector);
        world.equipItems(characterId, none);

        uint256[] memory tooMany = new uint256[](9);
        vm.prank(playerA);
        vm.expectRevert(GameErrors.BatchTooLarge.selector);
        world.equipItems(characterId, tooMany);

        uint256 foreignItem = _forceMintItem(playerB, GameTypes.Slot.MAIN_HAND, 2, 222_001);
        uint256[] memory mixed = new uint256[](1);
        mixed[0] = foreignItem;
        vm.prank(playerA);
        vm.expectRevert(GameErrors.NotItemOwner.selector);
        world.equipItems(characterId, mixed);

        uint256 ownItem = _forceMintItem(playerA, GameTypes.Slot.MAIN_HAND, 2, 222_002);
        uint256[] memory own = new uint256[](1);
        own[0] = ownItem;

        vm.startPrank(playerA);
        world.equipItems(characterId, own);
        _startEasyRun(characterId, playerA, 222_003);
        vm.expectRevert(GameErrors.GearLockedDuringRun.selector);
        world.equipItems(characterId, own);
        vm.stopPrank();
    }

    function test_ResolveRoomsBatchCompletesRunAndGuards() public {
        uint256 characterId = _createCharacter(playerA, "BatchRooms");
        _forceLevel(characterId, 200);
        _equipFullKit(characterId, playerA, 201, 333_000);

        vm.startPrank(playerA);
        uint8 roomCount = _startEasyRun(characterId, playerA, 333_100);

        GameTypes.PotionChoice[] memory potionChoices = new GameTypes.PotionChoice[](GameConstants.ROOM_MAX);
        GameTypes.AbilityChoice[] memory abilityChoices = new GameTypes.AbilityChoice[](GameConstants.ROOM_MAX);
        for (uint8 i = 0; i < GameConstants.ROOM_MAX; i++) {
            potionChoices[i] = GameTypes.PotionChoice.NONE;
            abilityChoices[i] = GameTypes.AbilityChoice.NONE;
        }

        (uint8 resolvedCount, bool runStillActive) = world.resolveRooms(characterId, potionChoices, abilityChoices);
        assertEq(resolvedCount, roomCount);
        assertFalse(runStillActive);

        GameTypes.PotionChoice[] memory none = new GameTypes.PotionChoice[](0);
        GameTypes.AbilityChoice[] memory noneAbilities = new GameTypes.AbilityChoice[](0);
        vm.expectRevert(GameErrors.AmountZero.selector);
        world.resolveRooms(characterId, none, noneAbilities);

        GameTypes.PotionChoice[] memory mismatchPotions = new GameTypes.PotionChoice[](1);
        GameTypes.AbilityChoice[] memory mismatchAbilities = new GameTypes.AbilityChoice[](2);
        vm.expectRevert(GameErrors.ArrayLengthMismatch.selector);
        world.resolveRooms(characterId, mismatchPotions, mismatchAbilities);

        GameTypes.PotionChoice[] memory tooManyPotions =
            new GameTypes.PotionChoice[](uint256(GameConstants.ROOM_MAX) + 1);
        GameTypes.AbilityChoice[] memory tooManyAbilities =
            new GameTypes.AbilityChoice[](uint256(GameConstants.ROOM_MAX) + 1);
        vm.expectRevert(GameErrors.BatchTooLarge.selector);
        world.resolveRooms(characterId, tooManyPotions, tooManyAbilities);
        vm.stopPrank();
    }

    function _startEasyRun(uint256 characterId, address who, uint64 nonce) internal returns (uint8 roomCount) {
        bytes32 secret = keccak256(abi.encode("batch-run", characterId, nonce));
        bytes32 hash = world.hashDungeonRun(
            secret, who, characterId, nonce, GameTypes.Difficulty.EASY, 2, GameTypes.VarianceMode.NEUTRAL
        );

        uint256 commitId = world.commitActionWithVariance{value: world.commitFee()}(
            characterId, GameTypes.ActionType.DUNGEON_RUN, hash, nonce, GameTypes.VarianceMode.NEUTRAL
        );
        _rollToReveal(commitId);
        world.revealStartDungeon(commitId, secret, GameTypes.Difficulty.EASY, 2, GameTypes.VarianceMode.NEUTRAL);

        (bool active, uint8 startedRoomCount,,,,,,,,) = world.getRunState(characterId);
        assertTrue(active);
        roomCount = startedRoomCount;
    }

    function _equipFullKit(uint256 characterId, address who, uint32 tier, uint64 seedBase) internal {
        for (uint8 slot = 0; slot < 8; slot++) {
            uint256 itemId = _forceMintItem(who, GameTypes.Slot(slot), tier, seedBase + slot);
            vm.prank(who);
            world.equipItem(characterId, itemId);
        }
    }
}
