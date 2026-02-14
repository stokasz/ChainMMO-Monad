// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ChainMMOBase} from "../helpers/ChainMMOBase.t.sol";
import {FixedPointMathLib} from "solady/utils/FixedPointMathLib.sol";
import {GameConstants} from "../../src/libraries/GameConstants.sol";
import {GameErrors} from "../../src/libraries/GameErrors.sol";
import {GameTypes} from "../../src/libraries/GameTypes.sol";
import {FeeVault} from "../../src/FeeVault.sol";
import {GameWorld} from "../../src/GameWorld.sol";

contract ReentrantPlayer {
    FeeVault internal immutable vault;
    GameWorld internal immutable world;

    uint32 internal claimEpoch;
    uint256 internal claimCharacterId;
    bool public attempted;
    bool public reentrySucceeded;

    constructor(FeeVault vault_, GameWorld world_) {
        vault = vault_;
        world = world_;
    }

    function createCharacter(string calldata name) external returns (uint256) {
        return world.createCharacter(GameTypes.Race.HUMAN, GameTypes.Class.WARRIOR, name);
    }

    function claimWithFallbackReentry(uint32 epochId, uint256 characterId) external {
        claimEpoch = epochId;
        claimCharacterId = characterId;
        vault.claimPlayer(epochId, characterId);
    }

    receive() external payable {
        if (!attempted) {
            attempted = true;
            (bool ok,) =
                address(vault).call(abi.encodeWithSelector(FeeVault.claimPlayer.selector, claimEpoch, claimCharacterId));
            reentrySucceeded = ok;
        }
    }
}

contract FeeVaultClaimsTest is ChainMMOBase {
    function test_FeeVaultEpochSplitEligibilityAndClaimSafety() public {
        uint256 topCharacter = _createCharacter(playerA, "TopOne");
        uint256 lowCharacter = _createCharacter(playerB, "LowOne");
        for (uint256 i = 0; i < 8; i++) {
            _createCharacter(address(uint160(100 + i)), string.concat("F", vm.toString(i)));
        }

        _openFreeLootbox(topCharacter, playerA, 1000);
        vm.startPrank(playerA);
        world.equipItem(topCharacter, items.tokenOfOwnerByIndex(playerA, 0));
        vm.stopPrank();

        _forceLevel(topCharacter, 5);

        vm.startPrank(playerA);
        token.approve(address(feeVault), type(uint256).max);
        (uint256 cost,) = feeVault.quotePremiumPurchase(topCharacter, GameTypes.Difficulty.EASY, 1);
        feeVault.buyPremiumLootboxes{value: cost}(topCharacter, GameTypes.Difficulty.EASY, 1);
        vm.stopPrank();

        uint32 epoch = uint32(block.timestamp / 1 hours);
        vm.warp(block.timestamp + 1 hours + 1);
        feeVault.finalizeEpoch(epoch);

        (uint256 playerPool, uint256 deployerPool,, uint256 totalWeight,) = feeVault.epochSnapshot(epoch);
        assertEq(playerPool, (cost * 90) / 100);
        assertEq(deployerPool, cost - playerPool);
        assertGt(totalWeight, 0);

        uint256 topBalanceBefore = playerA.balance;
        vm.prank(playerA);
        feeVault.claimPlayer(epoch, topCharacter);
        assertGt(playerA.balance, topBalanceBefore);

        vm.prank(playerA);
        vm.expectRevert(GameErrors.AlreadyClaimed.selector);
        feeVault.claimPlayer(epoch, topCharacter);

        vm.prank(playerB);
        vm.expectRevert(GameErrors.NotEligible.selector);
        feeVault.claimPlayer(epoch, lowCharacter);

        vm.prank(playerB);
        vm.expectRevert(GameErrors.OnlyCharacterOwner.selector);
        feeVault.claimPlayer(epoch, topCharacter);

        uint256 deployerBefore = feeDeployer.balance;
        vm.prank(feeDeployer);
        feeVault.claimDeployer(epoch);
        assertGt(feeDeployer.balance, deployerBefore);

        vm.prank(feeDeployer);
        vm.expectRevert(GameErrors.AlreadyClaimed.selector);
        feeVault.claimDeployer(epoch);
    }

    function test_CannotClaimBeforeEpochFinalization() public {
        uint256 characterId = _createCharacter(playerA, "Unfinalized");

        vm.startPrank(playerA);
        token.approve(address(feeVault), type(uint256).max);
        (uint256 cost,) = feeVault.quotePremiumPurchase(characterId, GameTypes.Difficulty.EASY, 1);
        feeVault.buyPremiumLootboxes{value: cost}(characterId, GameTypes.Difficulty.EASY, 1);
        vm.stopPrank();

        uint32 epoch = uint32(block.timestamp / 1 hours);
        vm.prank(playerA);
        vm.expectRevert(GameErrors.EpochNotFinalized.selector);
        feeVault.claimPlayer(epoch, characterId);
    }

    function test_LevelUpsAfterEpochCannotSpoofOldEpochClaims() public {
        uint256 topCharacter = _createCharacter(playerA, "TopLocker");
        uint256 lateCharacter = _createCharacter(playerB, "LateLeveler");
        for (uint256 i = 0; i < 9; i++) {
            _createCharacter(address(uint160(0x400 + i)), string.concat("L", vm.toString(i)));
        }

        _forceLevel(topCharacter, 4);

        vm.startPrank(playerA);
        token.approve(address(feeVault), type(uint256).max);
        (uint256 cost,) = feeVault.quotePremiumPurchase(topCharacter, GameTypes.Difficulty.EASY, 1);
        feeVault.buyPremiumLootboxes{value: cost}(topCharacter, GameTypes.Difficulty.EASY, 1);
        vm.stopPrank();

        uint32 epoch = uint32(block.timestamp / 1 hours);
        vm.warp(block.timestamp + 1 hours + 1);

        _forceLevelAtEpoch(lateCharacter, 8, epoch + 1);
        feeVault.finalizeEpoch(epoch);

        vm.prank(playerB);
        vm.expectRevert(GameErrors.NotEligible.selector);
        feeVault.claimPlayer(epoch, lateCharacter);
    }

    function test_WeightingMatches1p1ExponentRelativeToCutoff() public {
        uint256 levelFive = _createCharacter(playerA, "LevelFive");
        uint256 levelFour = _createCharacter(playerB, "LevelFour");
        for (uint256 i = 0; i < 9; i++) {
            _createCharacter(address(uint160(0x900 + i)), string.concat("W", vm.toString(i)));
        }

        _forceLevel(levelFive, 5);
        _forceLevel(levelFour, 4);

        vm.startPrank(playerA);
        token.approve(address(feeVault), type(uint256).max);
        (uint256 cost,) = feeVault.quotePremiumPurchase(levelFive, GameTypes.Difficulty.EASY, 3);
        feeVault.buyPremiumLootboxes{value: cost}(levelFive, GameTypes.Difficulty.EASY, 3);
        vm.stopPrank();

        uint32 epoch = uint32(block.timestamp / 1 hours);
        vm.warp(block.timestamp + 1 hours + 1);
        feeVault.finalizeEpoch(epoch);

        (uint256 playersPool,,, uint256 totalWeight,) = feeVault.epochSnapshot(epoch);
        uint256 expectedWeight = GameConstants.WAD + FixedPointMathLib.rpow(1.1e18, 1, GameConstants.WAD);
        assertEq(totalWeight, expectedWeight);

        uint256 playerABefore = playerA.balance;
        uint256 playerBBefore = playerB.balance;
        vm.prank(playerA);
        feeVault.claimPlayer(epoch, levelFive);
        vm.prank(playerB);
        feeVault.claimPlayer(epoch, levelFour);

        uint256 expectedA = (playersPool * FixedPointMathLib.rpow(1.1e18, 1, GameConstants.WAD)) / expectedWeight;
        uint256 expectedB = (playersPool * GameConstants.WAD) / expectedWeight;
        assertEq(playerA.balance - playerABefore, expectedA);
        assertEq(playerB.balance - playerBBefore, expectedB);
    }

    function test_ReentrancyAttemptOnPlayerClaimFails() public {
        ReentrantPlayer attacker = new ReentrantPlayer(feeVault, world);
        vm.deal(address(attacker), 1 ether);
        uint256 attackerCharacter = attacker.createCharacter("Reentrant");

        uint256 buyerCharacter = _createCharacter(playerA, "FeeSource");
        vm.startPrank(playerA);
        token.approve(address(feeVault), type(uint256).max);
        (uint256 cost,) = feeVault.quotePremiumPurchase(buyerCharacter, GameTypes.Difficulty.EASY, 1);
        feeVault.buyPremiumLootboxes{value: cost}(buyerCharacter, GameTypes.Difficulty.EASY, 1);
        vm.stopPrank();

        uint32 epoch = uint32(block.timestamp / 1 hours);
        vm.warp(block.timestamp + 1 hours + 1);
        feeVault.finalizeEpoch(epoch);

        uint256 attackerBefore = address(attacker).balance;
        attacker.claimWithFallbackReentry(epoch, attackerCharacter);
        uint256 attackerAfter = address(attacker).balance;

        assertGt(attackerAfter, attackerBefore);
        assertTrue(attacker.attempted());
        assertFalse(attacker.reentrySucceeded());
        assertTrue(feeVault.playerClaimed(epoch, attackerCharacter));
    }
}
