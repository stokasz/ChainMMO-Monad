// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ChainMMOBase} from "../helpers/ChainMMOBase.t.sol";
import {GameErrors} from "../../src/libraries/GameErrors.sol";
import {GameTypes} from "../../src/libraries/GameTypes.sol";

contract CommitRevealTest is ChainMMOBase {
    function test_CommitRevealTwoBlocksAndWrongRevealFails() public {
        uint256 characterId = _createCharacter(playerA, "ArcaneCommit");
        vm.startPrank(playerA);
        world.claimFreeLootbox(characterId);

        uint64 nonce = 1;
        bytes32 secret = keccak256("open-secret");
        bytes32 commitHash = keccak256(
            abi.encode(secret, playerA, GameTypes.ActionType.LOOTBOX_OPEN, characterId, nonce, uint32(2), uint16(1))
        );

        uint256 commitId = world.commitAction{value: world.commitFee()}(
            characterId, GameTypes.ActionType.LOOTBOX_OPEN, commitHash, nonce
        );

        vm.expectRevert(GameErrors.RevealTooEarly.selector);
        world.revealOpenLootboxes(commitId, secret, 2, 1);

        _rollToReveal(commitId);
        world.revealOpenLootboxes(commitId, secret, 2, 1);
        assertEq(items.balanceOf(playerA), 1);

        (address actor,,,,,,,) = world.commits(commitId);
        assertEq(actor, address(0));
        vm.stopPrank();
    }

    function test_WrongRevealSecretFails() public {
        uint256 characterId = _createCharacter(playerA, "WrongSecret");
        vm.startPrank(playerA);
        world.claimFreeLootbox(characterId);

        uint64 nonce = 7;
        bytes32 secret = keccak256("secret-a");
        bytes32 commitHash = keccak256(
            abi.encode(secret, playerA, GameTypes.ActionType.LOOTBOX_OPEN, characterId, nonce, uint32(2), uint16(1))
        );

        uint256 commitId = world.commitAction{value: world.commitFee()}(
            characterId, GameTypes.ActionType.LOOTBOX_OPEN, commitHash, nonce
        );
        _rollToReveal(commitId);

        vm.expectRevert(GameErrors.InvalidReveal.selector);
        world.revealOpenLootboxes(commitId, keccak256("secret-b"), 2, 1);
        vm.stopPrank();
    }

    function test_RevealExpiredAndCancelAfterWindow() public {
        uint256 characterId = _createCharacter(playerA, "ExpiryCase");
        vm.startPrank(playerA);
        world.claimFreeLootbox(characterId);

        uint64 nonce = 18;
        bytes32 secret = keccak256("expiry-open");
        bytes32 commitHash = keccak256(
            abi.encode(secret, playerA, GameTypes.ActionType.LOOTBOX_OPEN, characterId, nonce, uint32(2), uint16(1))
        );
        uint256 commitId = world.commitAction{value: world.commitFee()}(
            characterId, GameTypes.ActionType.LOOTBOX_OPEN, commitHash, nonce
        );

        _rollToReveal(commitId);
        vm.expectRevert(GameErrors.CommitNotExpired.selector);
        world.cancelExpired(commitId);

        (,,,,, uint64 commitBlock,,) = world.commits(commitId);
        vm.roll(uint256(commitBlock) + 257);
        vm.expectRevert(GameErrors.RevealExpired.selector);
        world.revealOpenLootboxes(commitId, secret, 2, 1);

        world.cancelExpired(commitId);
        vm.expectRevert(GameErrors.InvalidCommit.selector);
        world.cancelExpired(commitId);
        vm.stopPrank();
    }

    function test_CancelExpiredRequiresCommitOwner() public {
        uint256 characterId = _createCharacter(playerA, "NotYourCommit");
        vm.startPrank(playerA);
        world.claimFreeLootbox(characterId);
        uint64 nonce = 27;
        bytes32 secret = keccak256("owner-expiry");
        bytes32 commitHash = keccak256(
            abi.encode(secret, playerA, GameTypes.ActionType.LOOTBOX_OPEN, characterId, nonce, uint32(2), uint16(1))
        );
        uint256 commitId = world.commitAction{value: world.commitFee()}(
            characterId, GameTypes.ActionType.LOOTBOX_OPEN, commitHash, nonce
        );
        vm.stopPrank();

        vm.roll(block.number + 300);
        vm.prank(playerB);
        vm.expectRevert(GameErrors.OnlyCharacterOwner.selector);
        world.cancelExpired(commitId);
    }

    function test_ExpiredDungeonCommitCannotBeRevealedAfterCancel() public {
        uint256 characterId = _createCharacter(playerA, "ExpiredDungeon");
        vm.startPrank(playerA);
        uint64 nonce = 33;
        bytes32 secret = keccak256("dungeon-expired");
        bytes32 commitHash = keccak256(
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
        uint256 commitId = world.commitAction{value: world.commitFee()}(
            characterId, GameTypes.ActionType.DUNGEON_RUN, commitHash, nonce
        );
        vm.roll(block.number + 300);
        world.cancelExpired(commitId);

        vm.expectRevert(GameErrors.InvalidCommit.selector);
        world.revealStartDungeon(commitId, secret, GameTypes.Difficulty.EASY, 2);
        vm.stopPrank();
    }

    function test_RevealWindowHelperTracksLifecycle() public {
        uint256 characterId = _createCharacter(playerA, "RevealWindow");

        vm.startPrank(playerA);
        bytes32 secret = keccak256("window-check");
        uint64 nonce = 3501;
        bytes32 hash = keccak256(
            abi.encode(secret, playerA, GameTypes.ActionType.LOOTBOX_OPEN, characterId, nonce, uint32(2), uint16(1))
        );
        uint256 commitId =
            world.commitAction{value: world.commitFee()}(characterId, GameTypes.ActionType.LOOTBOX_OPEN, hash, nonce);

        (uint64 startBlock, uint64 endBlock, bool canReveal, bool expired, bool resolved) = world.revealWindow(commitId);
        assertEq(startBlock, uint64(block.number) + 2);
        assertEq(endBlock, uint64(block.number) + 256);
        assertFalse(canReveal);
        assertFalse(expired);
        assertFalse(resolved);

        vm.roll(startBlock);
        (,, bool canRevealMid, bool expiredMid, bool resolvedMid) = world.revealWindow(commitId);
        assertTrue(canRevealMid);
        assertFalse(expiredMid);
        assertFalse(resolvedMid);

        vm.roll(uint256(endBlock) + 1);
        (,, bool canRevealLate, bool expiredLate, bool resolvedLate) = world.revealWindow(commitId);
        assertFalse(canRevealLate);
        assertTrue(expiredLate);
        assertFalse(resolvedLate);
        vm.stopPrank();
    }
}
