// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ChainMMOBase} from "../helpers/ChainMMOBase.t.sol";
import {GameTypes} from "../../src/libraries/GameTypes.sol";

contract WowClassicRebalanceTest is ChainMMOBase {
    function test_Rebalance_CheckpointCurvesAtLevelThirty() public {
        uint256 characterId = _createCharacter(playerA, "CurveL30");
        _forceLevel(characterId, 30);

        assertApproxEqAbs(world.repairFee(30), 310 ether, 1 ether);
        assertApproxEqAbs(world.runEntryFee(30), 25 ether, 1 ether);

        (, uint256 mmoCost) = feeVault.quotePremiumPurchase(characterId, GameTypes.Difficulty.EASY, 1);
        assertApproxEqAbs(mmoCost, 181 ether, 1 ether);
    }

    function test_Rebalance_FlatEthPricingThroughOneThousandDailyPremiumBoxes() public {
        uint256 characterId = _createCharacter(playerA, "EthFlat1000");

        for (uint256 i = 0; i < 5; i++) {
            (uint256 cost,) = feeVault.quotePremiumPurchase(characterId, GameTypes.Difficulty.EASY, 200);
            vm.prank(playerA);
            feeVault.buyPremiumLootboxes{value: cost}(characterId, GameTypes.Difficulty.EASY, 200);
        }

        (uint256 cost1001,) = feeVault.quotePremiumPurchase(characterId, GameTypes.Difficulty.EASY, 1);
        assertApproxEqAbs(cost1001, 0.00115 ether, 0.0000001 ether);
    }

    function test_Rebalance_ForgeTierThirtyCost() public view {
        assertEq(world.forgeSetPieceMmoCost(30), 1_400 ether);
    }
}
