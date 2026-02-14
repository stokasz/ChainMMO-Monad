// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ChainMMOBase} from "../helpers/ChainMMOBase.t.sol";
import {FixedPointMathLib} from "solady/utils/FixedPointMathLib.sol";
import {GameConstants} from "../../src/libraries/GameConstants.sol";
import {GameTypes} from "../../src/libraries/GameTypes.sol";

contract PremiumShopTest is ChainMMOBase {
    address internal playerC = address(0xC0FFEE);

    function test_DailyPricingCurveAndReset() public {
        uint256 characterId = _createCharacter(playerA, "BuyerOne");

        (uint256 startEthCost, uint256 startMmoCost) =
            feeVault.quotePremiumPurchase(characterId, GameTypes.Difficulty.EASY, 1);
        assertEq(startEthCost, GameConstants.LOOTBOX_BASE_PRICE);
        assertEq(startMmoCost, 0);

        _buyUntilFlatPricingCap(characterId);

        (uint256 postCapCost,) = feeVault.quotePremiumPurchase(characterId, GameTypes.Difficulty.EASY, 1);
        uint256 expectedPostCap =
            FixedPointMathLib.mulWadUp(GameConstants.LOOTBOX_BASE_PRICE, GameConstants.PRICE_GROWTH_WAD);
        assertEq(postCapCost, expectedPostCap);

        vm.warp(block.timestamp + 1 days);
        (uint256 resetCost,) = feeVault.quotePremiumPurchase(characterId, GameTypes.Difficulty.EASY, 1);
        assertEq(resetCost, GameConstants.LOOTBOX_BASE_PRICE);
    }

    function test_DailyPricingExponentiatesAfterFlatCap() public {
        uint256 characterId = _createCharacter(playerA, "PriceCurve");
        _buyUntilFlatPricingCap(characterId);

        (uint256 cost1001,) = feeVault.quotePremiumPurchase(characterId, GameTypes.Difficulty.EASY, 1);
        vm.prank(playerA);
        feeVault.buyPremiumLootboxes{value: cost1001}(characterId, GameTypes.Difficulty.EASY, 1);

        (uint256 cost1002,) = feeVault.quotePremiumPurchase(characterId, GameTypes.Difficulty.EASY, 1);
        vm.prank(playerA);
        feeVault.buyPremiumLootboxes{value: cost1002}(characterId, GameTypes.Difficulty.EASY, 1);

        (uint256 cost1003,) = feeVault.quotePremiumPurchase(characterId, GameTypes.Difficulty.EASY, 1);

        uint256 growth2 = FixedPointMathLib.rpow(GameConstants.PRICE_GROWTH_WAD, 2, GameConstants.WAD);
        uint256 growth3 = FixedPointMathLib.rpow(GameConstants.PRICE_GROWTH_WAD, 3, GameConstants.WAD);
        uint256 expected1002 = FixedPointMathLib.mulWadUp(GameConstants.LOOTBOX_BASE_PRICE, growth2);
        uint256 expected1003 = FixedPointMathLib.mulWadUp(GameConstants.LOOTBOX_BASE_PRICE, growth3);

        assertEq(cost1002, expected1002);
        assertEq(cost1003, expected1003);
    }

    function test_LevelAboveTenRequiresMmoInShop() public {
        uint256 characterId = _createCharacter(playerA, "HighLevelShopper");
        _forceLevel(characterId, 11);

        (uint256 ethCost, uint256 mmoCost) = feeVault.quotePremiumPurchase(characterId, GameTypes.Difficulty.EASY, 1);
        assertEq(ethCost, GameConstants.LOOTBOX_BASE_PRICE);
        assertGt(mmoCost, 0);

        vm.prank(playerA);
        vm.expectRevert();
        feeVault.buyPremiumLootboxes{value: ethCost}(characterId, GameTypes.Difficulty.EASY, 1);

        vm.startPrank(playerA);
        uint256 sinkBefore = token.balanceOf(GameConstants.MMO_SINK_ADDRESS);
        token.approve(address(feeVault), type(uint256).max);
        feeVault.buyPremiumLootboxes{value: ethCost}(characterId, GameTypes.Difficulty.EASY, 1);
        vm.stopPrank();
        assertEq(token.balanceOf(GameConstants.MMO_SINK_ADDRESS), sinkBefore + mmoCost);
    }

    function test_PremiumPurchaseRequiresExternalMmoFundingAndThenSucceeds() public {
        vm.deal(playerC, 10 ether);
        vm.prank(playerC);
        uint256 characterId = world.createCharacter(GameTypes.Race.HUMAN, GameTypes.Class.WARRIOR, "UnfundedBuyer");
        _forceLevel(characterId, 11);

        (uint256 ethCost, uint256 mmoCost) = feeVault.quotePremiumPurchase(characterId, GameTypes.Difficulty.EASY, 1);

        vm.startPrank(playerC);
        token.approve(address(feeVault), type(uint256).max);
        vm.expectRevert();
        feeVault.buyPremiumLootboxes{value: ethCost}(characterId, GameTypes.Difficulty.EASY, 1);
        vm.stopPrank();

        token.transfer(playerC, mmoCost);
        uint256 sinkBefore = token.balanceOf(GameConstants.MMO_SINK_ADDRESS);

        vm.prank(playerC);
        feeVault.buyPremiumLootboxes{value: ethCost}(characterId, GameTypes.Difficulty.EASY, 1);

        assertEq(token.balanceOf(GameConstants.MMO_SINK_ADDRESS), sinkBefore + mmoCost);
    }

    function test_MmoSinkCostIsCappedAtVeryHighLevel() public {
        uint256 characterId = _createCharacter(playerA, "SinkCap");
        _forceLevel(characterId, 2000);

        (, uint256 mmoCost) = feeVault.quotePremiumPurchase(characterId, GameTypes.Difficulty.EASY, 2);
        assertEq(mmoCost, GameConstants.MMO_SINK_MAX_PER_LOOTBOX * 2);
    }

    function test_MassBuyAndMassOpen() public {
        uint256 characterId = _createCharacter(playerA, "MassOpen");
        vm.startPrank(playerA);
        token.approve(address(feeVault), type(uint256).max);
        (uint256 cost,) = feeVault.quotePremiumPurchase(characterId, GameTypes.Difficulty.EASY, 3);
        feeVault.buyPremiumLootboxes{value: cost}(characterId, GameTypes.Difficulty.EASY, 3);
        vm.stopPrank();

        assertEq(world.lootboxCredits(characterId, 2), 3);

        vm.startPrank(playerA);
        uint64 nonce = 3;
        bytes32 secret = keccak256("mass-open");
        bytes32 hash = keccak256(
            abi.encode(secret, playerA, GameTypes.ActionType.LOOTBOX_OPEN, characterId, nonce, uint32(2), uint16(3))
        );
        uint256 commitId =
            world.commitAction{value: world.commitFee()}(characterId, GameTypes.ActionType.LOOTBOX_OPEN, hash, nonce);
        _rollToReveal(commitId);
        world.revealOpenLootboxes(commitId, secret, 2, 3);
        vm.stopPrank();

        assertEq(items.balanceOf(playerA), 3);
        assertEq(world.lootboxCredits(characterId, 2), 0);
    }

    function test_ShopDifficultyTierMapping() public {
        uint256 easyCharacter = _createCharacter(playerA, "TierEasy");
        uint256 normalCharacter = _createCharacter(playerA, "TierNormal");
        uint256 hardCharacter = _createCharacter(playerA, "TierHard");
        uint256 extremeCharacter = _createCharacter(playerA, "TierExtreme");
        uint256 challengerCharacter = _createCharacter(playerA, "TierChallenger");

        vm.startPrank(playerA);
        token.approve(address(feeVault), type(uint256).max);

        (uint256 easyCost,) = feeVault.quotePremiumPurchase(easyCharacter, GameTypes.Difficulty.EASY, 1);
        feeVault.buyPremiumLootboxes{value: easyCost}(easyCharacter, GameTypes.Difficulty.EASY, 1);
        assertEq(world.lootboxCredits(easyCharacter, 2), 1);

        (uint256 normalCost,) = feeVault.quotePremiumPurchase(normalCharacter, GameTypes.Difficulty.NORMAL, 1);
        feeVault.buyPremiumLootboxes{value: normalCost}(normalCharacter, GameTypes.Difficulty.NORMAL, 1);
        assertEq(world.lootboxCredits(normalCharacter, 2), 1);

        (uint256 hardCost,) = feeVault.quotePremiumPurchase(hardCharacter, GameTypes.Difficulty.HARD, 1);
        feeVault.buyPremiumLootboxes{value: hardCost}(hardCharacter, GameTypes.Difficulty.HARD, 1);
        assertEq(world.lootboxCredits(hardCharacter, 5), 1);

        (uint256 extremeCost,) = feeVault.quotePremiumPurchase(extremeCharacter, GameTypes.Difficulty.EXTREME, 1);
        feeVault.buyPremiumLootboxes{value: extremeCost}(extremeCharacter, GameTypes.Difficulty.EXTREME, 1);
        assertEq(world.lootboxCredits(extremeCharacter, 8), 1);

        (uint256 challengerCost,) =
            feeVault.quotePremiumPurchase(challengerCharacter, GameTypes.Difficulty.CHALLENGER, 1);
        feeVault.buyPremiumLootboxes{value: challengerCost}(challengerCharacter, GameTypes.Difficulty.CHALLENGER, 1);
        assertEq(world.lootboxCredits(challengerCharacter, 11), 1);
        vm.stopPrank();
    }

    function _buyUntilFlatPricingCap(uint256 characterId) internal {
        uint256 remaining = GameConstants.FIRST_DAILY_LOOTBOXES;
        while (remaining > 0) {
            uint16 amount = remaining > GameConstants.MAX_BUY_PER_TX ? GameConstants.MAX_BUY_PER_TX : uint16(remaining);
            (uint256 cost,) = feeVault.quotePremiumPurchase(characterId, GameTypes.Difficulty.EASY, amount);
            vm.prank(playerA);
            feeVault.buyPremiumLootboxes{value: cost}(characterId, GameTypes.Difficulty.EASY, amount);
            remaining -= amount;
        }
    }
}
