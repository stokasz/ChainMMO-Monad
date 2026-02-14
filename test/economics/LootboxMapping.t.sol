// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {GameConstants} from "../../src/libraries/GameConstants.sol";
import {GameTypes} from "../../src/libraries/GameTypes.sol";

contract LootboxMappingTest is Test {
    function test_DifficultyLootTierBonusMapping() public pure {
        assertEq(GameConstants.lootTierBonus(GameTypes.Difficulty.EASY), 0);
        assertEq(GameConstants.lootTierBonus(GameTypes.Difficulty.NORMAL), 0);
        assertEq(GameConstants.lootTierBonus(GameTypes.Difficulty.HARD), 3);
        assertEq(GameConstants.lootTierBonus(GameTypes.Difficulty.EXTREME), 6);
        assertEq(GameConstants.lootTierBonus(GameTypes.Difficulty.CHALLENGER), 9);
    }

    function test_DifficultyLootCountMapping() public pure {
        assertEq(GameConstants.lootCount(GameTypes.Difficulty.EASY), 1);
        assertEq(GameConstants.lootCount(GameTypes.Difficulty.NORMAL), 1);
        assertEq(GameConstants.lootCount(GameTypes.Difficulty.HARD), 4);
        assertEq(GameConstants.lootCount(GameTypes.Difficulty.EXTREME), 7);
        assertEq(GameConstants.lootCount(GameTypes.Difficulty.CHALLENGER), 10);
    }

    function test_MinEquippedSlotRequirementByDungeonBand() public pure {
        assertEq(GameConstants.minEquippedSlotsForDungeonLevel(1), 1);
        assertEq(GameConstants.minEquippedSlotsForDungeonLevel(2), 1);
        assertEq(GameConstants.minEquippedSlotsForDungeonLevel(5), 1);
        assertEq(GameConstants.minEquippedSlotsForDungeonLevel(6), 4);
        assertEq(GameConstants.minEquippedSlotsForDungeonLevel(10), 4);
        assertEq(GameConstants.minEquippedSlotsForDungeonLevel(11), 8);
    }

    function test_ProgressionClearAndSetRecommendationBands() public pure {
        assertEq(GameConstants.requiredClearsForDungeonLevel(1), 1);
        assertEq(GameConstants.requiredClearsForDungeonLevel(20), 1);
        assertEq(GameConstants.requiredClearsForDungeonLevel(21), 3);
        assertEq(GameConstants.requiredClearsForDungeonLevel(30), 3);
        assertEq(GameConstants.requiredClearsForDungeonLevel(31), 6);
        assertEq(GameConstants.requiredClearsForDungeonLevel(41), 8);

        assertEq(GameConstants.recommendedSetPiecesForDungeonLevel(19), 1);
        assertEq(GameConstants.recommendedSetPiecesForDungeonLevel(20), 1);
        assertEq(GameConstants.recommendedSetPiecesForDungeonLevel(30), 3);
        assertEq(GameConstants.recommendedSetPiecesForDungeonLevel(40), 5);

        assertEq(GameConstants.recommendedMatchingSetPiecesForDungeonLevel(29), 1);
        assertEq(GameConstants.recommendedMatchingSetPiecesForDungeonLevel(30), 1);
        assertEq(GameConstants.recommendedMatchingSetPiecesForDungeonLevel(40), 3);

        assertEq(GameConstants.recommendedHighAffixPiecesForDungeonLevel(24), 1);
        assertEq(GameConstants.recommendedHighAffixPiecesForDungeonLevel(25), 1);
        assertEq(GameConstants.recommendedHighAffixPiecesForDungeonLevel(50), 3);
    }

    function test_ProgressionUnitsFavorHigherDifficulty() public pure {
        assertEq(GameConstants.progressionUnits(GameTypes.Difficulty.EASY), 1);
        assertEq(GameConstants.progressionUnits(GameTypes.Difficulty.NORMAL), 1);
        assertEq(GameConstants.progressionUnits(GameTypes.Difficulty.HARD), 2);
        assertEq(GameConstants.progressionUnits(GameTypes.Difficulty.EXTREME), 4);
        assertEq(GameConstants.progressionUnits(GameTypes.Difficulty.CHALLENGER), 6);
    }
}
