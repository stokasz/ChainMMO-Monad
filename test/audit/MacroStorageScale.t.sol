// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ChainMMOBase} from "../helpers/ChainMMOBase.t.sol";
import {GameTypes} from "../../src/libraries/GameTypes.sol";

contract MacroStorageScaleTest is ChainMMOBase {
    function test_TrackOneThousandCharactersStateCounters() public {
        _createCrowd(1_000, 0x5000);

        assertEq(world.totalCharacters(), 1_000);
        assertEq(world.countAtLevel(1), 1_000);
        assertEq(world.maxLevel(), 1);

        assertEq(world.ownerCharacterCount(address(uint160(0x5000))), 1);
        assertEq(world.ownerCharacterCount(address(uint160(0x5000 + 999))), 1);
    }

    function test_EpochFinalizationWithLargePopulationAndClaimsNoRevert() public {
        _createCrowd(1_200, 0x9000);

        uint256 buyerCharacter = _createCharacter(playerA, "CrowdBuyer");

        vm.startPrank(playerA);
        token.approve(address(feeVault), type(uint256).max);
        (uint256 cost,) = feeVault.quotePremiumPurchase(buyerCharacter, GameTypes.Difficulty.EASY, 1);
        feeVault.buyPremiumLootboxes{value: cost}(buyerCharacter, GameTypes.Difficulty.EASY, 1);
        vm.stopPrank();

        uint32 epoch = uint32(block.timestamp / 1 hours);
        vm.warp(block.timestamp + 1 hours + 1);

        feeVault.finalizeEpoch(epoch);

        (uint256 feesForPlayers, uint256 feesForDeployer,, uint256 totalEligibleWeight, bool finalized) =
            feeVault.epochSnapshot(epoch);

        assertTrue(finalized);
        assertGt(feesForPlayers, 0);
        assertGt(feesForDeployer, 0);
        assertGt(totalEligibleWeight, 0);

        uint256 playerBalanceBefore = playerA.balance;
        vm.prank(playerA);
        feeVault.claimPlayer(epoch, buyerCharacter);
        assertGt(playerA.balance, playerBalanceBefore);

        vm.prank(feeDeployer);
        feeVault.claimDeployer(epoch);
        assertTrue(feeVault.deployerClaimed(epoch));
    }

    function test_MassCommitStorageAndRevealWindowsRemainConsistent() public {
        uint256 characterId = _createCharacter(playerA, "CommitScale");

        vm.startPrank(playerA);
        uint256 firstCommitId;
        uint256 middleCommitId;
        uint256 lastCommitId;

        for (uint256 i = 0; i < 1_500; i++) {
            bytes32 commitHash = keccak256(abi.encode("mass-commit", i));
            uint256 commitId = world.commitAction{value: world.commitFee()}(
                characterId, GameTypes.ActionType.LOOTBOX_OPEN, commitHash, uint64(i)
            );

            if (i == 0) firstCommitId = commitId;
            if (i == 749) middleCommitId = commitId;
            if (i == 1_499) lastCommitId = commitId;
        }

        _assertRevealWindowMatchesStoredCommit(firstCommitId);
        _assertRevealWindowMatchesStoredCommit(middleCommitId);
        _assertRevealWindowMatchesStoredCommit(lastCommitId);

        (,,,,, uint64 commitBlock,,) = world.commits(lastCommitId);
        vm.roll(uint256(commitBlock) + 257);
        world.cancelExpired(lastCommitId);
        vm.stopPrank();

        (,, bool canReveal, bool expired, bool resolved) = world.revealWindow(lastCommitId);
        assertFalse(canReveal);
        assertFalse(expired);
        assertTrue(resolved);
        assertEq(world.nextCommitId(), 1_501);
    }

    function _createCrowd(uint256 count, uint256 addressBase) internal {
        for (uint256 i = 0; i < count; i++) {
            address owner = address(uint160(addressBase + i));
            vm.prank(owner);
            world.createCharacter(
                GameTypes.Race(uint8(i % 3)), GameTypes.Class(uint8(i % 3)), string.concat("Crowd", vm.toString(i))
            );
        }
    }

    function _assertRevealWindowMatchesStoredCommit(uint256 commitId) internal view {
        (,,,,, uint64 commitBlock,, bool resolvedFromCommit) = world.commits(commitId);
        (uint64 startBlock, uint64 endBlock, bool canReveal, bool expired, bool resolved) = world.revealWindow(commitId);

        assertEq(startBlock, commitBlock + 2);
        assertEq(endBlock, commitBlock + 256);
        assertEq(resolved, resolvedFromCommit);

        canReveal;
        expired;
    }
}
