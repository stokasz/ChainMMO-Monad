// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ChainMMOBase} from "../helpers/ChainMMOBase.t.sol";
import {TestGameWorld} from "../helpers/TestGameWorld.sol";
import {GameWorld} from "../../src/GameWorld.sol";
import {GameConstants} from "../../src/libraries/GameConstants.sol";
import {GameTypes} from "../../src/libraries/GameTypes.sol";

contract BalanceVNextPressureFloorTest is ChainMMOBase {
    function test_PressureFloorPreventsZeroEffectivePower() public view {
        uint256 floorAtCap = TestGameWorld(address(world)).exposedEffectivePowerBpsAfterPenalty(GameConstants.BPS);
        uint256 floorAboveCap =
            TestGameWorld(address(world)).exposedEffectivePowerBpsAfterPenalty(GameConstants.BPS + 50_000);

        assertEq(floorAtCap, GameConstants.MIN_EFFECTIVE_POWER_BPS);
        assertEq(floorAboveCap, GameConstants.MIN_EFFECTIVE_POWER_BPS);
    }

    function test_PressureEstimatorMatchesConfiguredDeficits() public view {
        (
            uint256 penaltyBps,
            uint8 missingSet,
            uint8 missingMatching,
            uint8 missingAffix,
            uint8 recommendedSet,
            uint8 recommendedMatching,
            uint8 recommendedAffix
        ) = TestGameWorld(address(world)).exposedEstimatePressurePenaltyFromContext(0, 0, 0, 80);

        assertEq(missingSet, recommendedSet);
        assertEq(missingMatching, recommendedMatching);
        assertEq(missingAffix, recommendedAffix);

        uint256 expected = uint256(missingSet) * GameConstants.MISSING_SET_PENALTY_BPS + uint256(missingMatching)
            * GameConstants.MISSING_MATCHED_SET_PENALTY_BPS + uint256(missingAffix)
            * GameConstants.MISSING_AFFIX_PENALTY_BPS;
        assertEq(penaltyBps, expected);
        assertGt(penaltyBps, GameConstants.BPS);
    }

    function test_EstimatePressurePenaltyMatchesLiveContext() public {
        uint256 characterId = _createCharacter(playerA, "PenaltyContext");
        _forceLevel(characterId, 39);

        for (uint8 slot = 0; slot < 8; slot++) {
            uint256 itemId = _forceMintItem(playerA, GameTypes.Slot(slot), 10, uint64(700_000 + slot));
            vm.prank(playerA);
            world.equipItem(characterId, itemId);
        }

        uint256 estimated = world.estimatePressurePenaltyBps(characterId, 40);
        assertGt(estimated, 0);

        GameWorld.BuildDeficits memory deficits = world.recommendedBuildDeficits(characterId, 40);
        assertEq(estimated, deficits.estimatedPenaltyBps);

        GameWorld.ProgressionSnapshot memory snapshot = world.getProgressionSnapshot(characterId);
        assertEq(snapshot.bestLevel, 39);
        assertEq(snapshot.targetLevel, 40);
        assertEq(snapshot.equippedSlots, 8);
    }
}
