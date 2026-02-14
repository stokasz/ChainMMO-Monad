// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ChainMMOBase} from "../helpers/ChainMMOBase.t.sol";
import {TestGameWorld} from "../helpers/TestGameWorld.sol";
import {GameConstants} from "../../src/libraries/GameConstants.sol";
import {GameTypes} from "../../src/libraries/GameTypes.sol";

contract BalanceVNextDifficultyIncentivesTest is ChainMMOBase {
    function test_HigherDifficultiesOfferHigherProgressUnits() public pure {
        assertEq(GameConstants.progressionUnits(GameTypes.Difficulty.EASY), 1);
        assertEq(GameConstants.progressionUnits(GameTypes.Difficulty.NORMAL), 1);
        assertEq(GameConstants.progressionUnits(GameTypes.Difficulty.HARD), 2);
        assertEq(GameConstants.progressionUnits(GameTypes.Difficulty.EXTREME), 4);
        assertEq(GameConstants.progressionUnits(GameTypes.Difficulty.CHALLENGER), 6);
    }

    function test_HigherDifficultiesOfferHigherLootSignal() public pure {
        assertEq(GameConstants.lootTierBonus(GameTypes.Difficulty.EASY), 0);
        assertEq(GameConstants.lootTierBonus(GameTypes.Difficulty.NORMAL), 0);
        assertEq(GameConstants.lootTierBonus(GameTypes.Difficulty.HARD), 3);
        assertEq(GameConstants.lootTierBonus(GameTypes.Difficulty.EXTREME), 6);
        assertEq(GameConstants.lootTierBonus(GameTypes.Difficulty.CHALLENGER), 9);

        assertEq(GameConstants.lootCount(GameTypes.Difficulty.EASY), 1);
        assertEq(GameConstants.lootCount(GameTypes.Difficulty.NORMAL), 1);
        assertEq(GameConstants.lootCount(GameTypes.Difficulty.HARD), 4);
        assertEq(GameConstants.lootCount(GameTypes.Difficulty.EXTREME), 7);
        assertEq(GameConstants.lootCount(GameTypes.Difficulty.CHALLENGER), 10);
    }

    function test_HardPlusGuaranteedStoneAtThirtyPlus() public {
        uint256 characterId = _createCharacter(playerA, "GuaranteedStone");
        _forceLevel(characterId, 30);

        uint32 before = world.upgradeStoneBalance(characterId);

        uint256 easySeed = _findNoDropSeed(characterId, GameTypes.Difficulty.EASY, 30);
        TestGameWorld(address(world))
            .exposedGrantUpgradeStoneOnSuccess(characterId, GameTypes.Difficulty.EASY, easySeed, 30);
        assertEq(world.upgradeStoneBalance(characterId), before);

        uint256 hardSeed = _findNoDropSeed(characterId, GameTypes.Difficulty.HARD, 30);
        TestGameWorld(address(world))
            .exposedGrantUpgradeStoneOnSuccess(characterId, GameTypes.Difficulty.HARD, hardSeed, 30);
        assertEq(world.upgradeStoneBalance(characterId), before + 1);

        uint256 extremeSeed = _findNoDropSeed(characterId, GameTypes.Difficulty.EXTREME, 30);
        TestGameWorld(address(world))
            .exposedGrantUpgradeStoneOnSuccess(characterId, GameTypes.Difficulty.EXTREME, extremeSeed, 30);
        assertEq(world.upgradeStoneBalance(characterId), before + 2);

        uint256 challengerSeed = _findNoDropSeed(characterId, GameTypes.Difficulty.CHALLENGER, 30);
        TestGameWorld(address(world))
            .exposedGrantUpgradeStoneOnSuccess(characterId, GameTypes.Difficulty.CHALLENGER, challengerSeed, 30);
        assertEq(world.upgradeStoneBalance(characterId), before + 3);
    }

    function test_OptimizedExpectedProgressCanBeatEasyMeta() public pure {
        uint256 easyExpected = uint256(GameConstants.progressionUnits(GameTypes.Difficulty.EASY)) * 7_000;
        uint256 hardExpected = uint256(GameConstants.progressionUnits(GameTypes.Difficulty.HARD)) * 4_000;
        uint256 extremeExpected = uint256(GameConstants.progressionUnits(GameTypes.Difficulty.EXTREME)) * 2_100;
        uint256 challengerExpected = uint256(GameConstants.progressionUnits(GameTypes.Difficulty.CHALLENGER)) * 1_450;

        assertGt(hardExpected, easyExpected);
        assertGt(extremeExpected, easyExpected);
        assertGt(challengerExpected, easyExpected);
    }

    function _findNoDropSeed(uint256 characterId, GameTypes.Difficulty difficulty, uint32 dungeonLevel)
        internal
        pure
        returns (uint256 runSeed)
    {
        uint16 chanceBps = GameConstants.upgradeStoneDropChanceBps(difficulty);
        for (uint256 i = 0; i < 10_000; i++) {
            uint256 roll =
                uint256(keccak256(abi.encode(i, dungeonLevel, characterId, uint8(difficulty), "stone"))) % 10_000;
            if (roll >= chanceBps) return i;
        }
        revert();
    }
}
