// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ChainMMOBase} from "../helpers/ChainMMOBase.t.sol";
import {GameConstants} from "../../src/libraries/GameConstants.sol";
import {GameErrors} from "../../src/libraries/GameErrors.sol";
import {GameTypes} from "../../src/libraries/GameTypes.sol";

contract RepairSinkTest is ChainMMOBase {
    address internal playerC = address(0xC0FFEE);

    function test_LevelTwentyOrBelowHasNoRunEntryFee() public view {
        assertEq(world.runEntryFee(1), 0);
        assertEq(world.runEntryFee(20), 0);
        assertGt(world.runEntryFee(21), 0);
    }

    function test_LevelTenOrBelowRequiresNoRepairEscrow() public {
        uint256 characterId = _createCharacter(playerA, "NoRepairL10");
        _forceLevel(characterId, 9);
        _equipFullKit(characterId, playerA, 10, 51_000);

        uint256 worldBefore = token.balanceOf(address(world));

        vm.startPrank(playerA);
        uint64 nonce = 51_001;
        bytes32 secret = keccak256("repair-l10");
        bytes32 hash = keccak256(
            abi.encode(
                secret,
                playerA,
                GameTypes.ActionType.DUNGEON_RUN,
                characterId,
                nonce,
                uint8(GameTypes.Difficulty.EASY),
                uint32(10)
            )
        );
        uint256 commitId =
            world.commitAction{value: world.commitFee()}(characterId, GameTypes.ActionType.DUNGEON_RUN, hash, nonce);
        _rollToReveal(commitId);
        world.revealStartDungeon(commitId, secret, GameTypes.Difficulty.EASY, 10);
        vm.stopPrank();

        assertEq(token.balanceOf(address(world)), worldBefore);
    }

    function test_LevelAboveTwentySinksEntryFeeOnRevealStart() public {
        uint256 characterId = _createCharacter(playerA, "EntryFee");
        _forceLevel(characterId, 20);
        _equipFullKit(characterId, playerA, 21, 51_050);

        uint256 entryFee = world.runEntryFee(21);
        uint256 sinkBefore = token.balanceOf(GameConstants.MMO_SINK_ADDRESS);

        vm.startPrank(playerA);
        token.approve(address(world), type(uint256).max);
        uint256 commitId = _commitRun(characterId, playerA, GameTypes.Difficulty.EASY, 21, 51_055, bytes32("entry-fee"));
        _rollToReveal(commitId);
        world.revealStartDungeon(commitId, bytes32("entry-fee"), GameTypes.Difficulty.EASY, 21);
        vm.stopPrank();

        assertEq(token.balanceOf(GameConstants.MMO_SINK_ADDRESS), sinkBefore + entryFee);
    }

    function test_LevelAboveTenNeedsEscrowAndRevertsWithoutFunds() public {
        vm.deal(playerC, 1 ether);
        vm.prank(playerC);
        uint256 characterId = world.createCharacter(GameTypes.Race.HUMAN, GameTypes.Class.WARRIOR, "NoFunds");
        _forceLevel(characterId, 10);
        _equipFullKit(characterId, playerC, 11, 52_000);

        vm.startPrank(playerC);
        uint64 nonce = 51_101;
        bytes32 secret = keccak256("repair-no-funds");
        bytes32 hash = keccak256(
            abi.encode(
                secret,
                playerC,
                GameTypes.ActionType.DUNGEON_RUN,
                characterId,
                nonce,
                uint8(GameTypes.Difficulty.EASY),
                uint32(11)
            )
        );
        uint256 commitId =
            world.commitAction{value: world.commitFee()}(characterId, GameTypes.ActionType.DUNGEON_RUN, hash, nonce);
        _rollToReveal(commitId);

        vm.expectRevert();
        world.revealStartDungeon(commitId, secret, GameTypes.Difficulty.EASY, 11);
        vm.stopPrank();

        uint256 escrowFee = world.repairFee(11);
        token.transfer(playerC, escrowFee);

        vm.startPrank(playerC);
        token.approve(address(world), type(uint256).max);
        world.revealStartDungeon(commitId, secret, GameTypes.Difficulty.EASY, 11);
        vm.stopPrank();
    }

    function test_SuccessRefundsRepairEscrow() public {
        uint256 characterId = _createCharacter(playerA, "RepairSuccess");
        _forceLevel(characterId, 200);
        _equipFullKit(characterId, playerA, 201, 88_000);

        uint256 fee = world.repairFee(11);
        uint256 sinkBefore = token.balanceOf(GameConstants.MMO_SINK_ADDRESS);
        uint256 playerBefore = token.balanceOf(playerA);

        vm.startPrank(playerA);
        token.approve(address(world), type(uint256).max);
        uint256 commitId =
            _commitRun(characterId, playerA, GameTypes.Difficulty.EASY, 11, 51_200, bytes32("repair-success"));
        _rollToReveal(commitId);
        world.revealStartDungeon(commitId, bytes32("repair-success"), GameTypes.Difficulty.EASY, 11);
        _drainRun(characterId);
        vm.stopPrank();

        assertEq(token.balanceOf(GameConstants.MMO_SINK_ADDRESS), sinkBefore);
        assertGe(token.balanceOf(playerA), playerBefore);
        assertEq(world.repairFee(11), fee);
    }

    function test_FailureSinksRepairEscrowAndCannotDoubleSettle() public {
        uint256 characterId = _createCharacter(playerA, "RepairFail");
        _forceLevel(characterId, 59);
        _equipFullKit(characterId, playerA, 1, 53_000);

        uint256 fee = world.repairFee(60);
        uint256 entryFee = world.runEntryFee(60);
        uint256 sinkBefore = token.balanceOf(GameConstants.MMO_SINK_ADDRESS);
        uint256 playerBefore = token.balanceOf(playerA);

        vm.startPrank(playerA);
        token.approve(address(world), type(uint256).max);
        uint256 commitId =
            _commitRun(characterId, playerA, GameTypes.Difficulty.CHALLENGER, 60, 51_300, bytes32("repair-fail"));
        _rollToReveal(commitId);
        world.revealStartDungeon(commitId, bytes32("repair-fail"), GameTypes.Difficulty.CHALLENGER, 60);
        _drainRun(characterId);

        assertEq(token.balanceOf(GameConstants.MMO_SINK_ADDRESS), sinkBefore + fee + entryFee);
        assertEq(token.balanceOf(playerA), playerBefore - fee - entryFee);

        vm.expectRevert(GameErrors.RunNotActive.selector);
        world.resolveNextRoom(characterId, GameTypes.PotionChoice.NONE, GameTypes.AbilityChoice.NONE);
        assertEq(token.balanceOf(GameConstants.MMO_SINK_ADDRESS), sinkBefore + fee + entryFee);
        vm.stopPrank();
    }

    function _equipFullKit(uint256 characterId, address who, uint32 tier, uint64 seedBase) internal {
        for (uint8 slot = 0; slot < 8; slot++) {
            uint256 itemId = _forceMintItem(who, GameTypes.Slot(slot), tier, seedBase + slot);
            vm.prank(who);
            world.equipItem(characterId, itemId);
        }
    }

    function _commitRun(
        uint256 characterId,
        address who,
        GameTypes.Difficulty difficulty,
        uint32 dungeonLevel,
        uint64 nonce,
        bytes32 secret
    ) internal returns (uint256 commitId) {
        bytes32 hash = keccak256(
            abi.encode(
                secret, who, GameTypes.ActionType.DUNGEON_RUN, characterId, nonce, uint8(difficulty), dungeonLevel
            )
        );
        commitId =
            world.commitAction{value: world.commitFee()}(characterId, GameTypes.ActionType.DUNGEON_RUN, hash, nonce);
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
