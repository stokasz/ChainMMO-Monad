// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ChainMMOBase} from "../helpers/ChainMMOBase.t.sol";
import {GameConstants} from "../../src/libraries/GameConstants.sol";
import {GameTypes} from "../../src/libraries/GameTypes.sol";

contract BugHuntEdgeCasesTest is ChainMMOBase {
    uint256 internal decayScenarioCounter;

    function testFuzz_FeeAndForgeCurvesStayBounded(uint32 dungeonLevel, uint32 tier) public view {
        uint256 repairFee = world.repairFee(dungeonLevel);
        uint256 runEntryFee = world.runEntryFee(dungeonLevel);
        uint256 forgeMmo = world.forgeSetPieceMmoCost(tier);
        uint8 forgeStones = world.forgeSetPieceStoneCost(tier);

        assertLe(repairFee, GameConstants.REPAIR_MAX);
        assertLe(runEntryFee, GameConstants.RUN_ENTRY_MAX);
        assertLe(forgeMmo, GameConstants.FORGE_SET_MAX_MMO);
        assertLe(forgeStones, GameConstants.FORGE_SET_MAX_STONES);

        if (dungeonLevel <= 10) {
            assertEq(repairFee, 0);
        }
        if (dungeonLevel <= 20) {
            assertEq(runEntryFee, 0);
        }
    }

    function testFuzz_PremiumTierQuoteSaturatesAndNeverOverflows(uint32 level, uint8 difficultyRaw) public {
        uint256 characterId = _createCharacter(playerA, "TierSaturation");
        _forceLevel(characterId, level);

        GameTypes.Difficulty difficulty = GameTypes.Difficulty(uint8(difficultyRaw % 5));
        uint32 tier = world.premiumLootboxTier(characterId, difficulty);

        assertGe(tier, level);
        if (level == type(uint32).max) {
            assertEq(tier, type(uint32).max);
        }
    }

    function test_FailureProgressDecayFloorsAtZeroAcrossBands() public {
        token.transfer(playerA, 1_000_000 ether);

        _assertFailureDecay(21, 1, 0);
        _assertFailureDecay(21, 2, 1);

        _assertFailureDecay(35, 2, 0);
        _assertFailureDecay(35, 3, 1);

        _assertFailureDecay(61, 3, 0);
        _assertFailureDecay(61, 4, 1);
    }

    function test_QuoteOpenLootboxesSupportsMaxRequestedAmountWithoutOverflow() public {
        uint256 characterId = _createCharacter(playerA, "QuoteMax");

        vm.prank(playerA);
        world.claimFreeLootbox(characterId);

        (uint32 total, uint32 bound, uint32 generic, uint16 openable) =
            world.quoteOpenLootboxes(characterId, 2, type(uint16).max, GameTypes.VarianceMode.NEUTRAL);

        assertEq(total, 1);
        assertEq(bound, 0);
        assertEq(generic, 1);
        assertEq(openable, 1);
    }

    function _assertFailureDecay(uint32 dungeonLevel, uint8 startProgress, uint8 expectedProgress) internal {
        decayScenarioCounter++;
        address owner = address(uint160(0xD000 + decayScenarioCounter));
        vm.deal(owner, 10 ether);
        token.transfer(owner, 200_000 ether);

        vm.prank(owner);
        uint256 characterId = world.createCharacter(
            GameTypes.Race.HUMAN,
            GameTypes.Class.WARRIOR,
            string.concat("Decay", vm.toString(dungeonLevel), vm.toString(startProgress))
        );
        _forceLevel(characterId, dungeonLevel - 1);
        _forceSetLevelClearProgress(characterId, dungeonLevel, startProgress);

        vm.startPrank(owner);
        _equipTierOneKit(characterId, owner, uint64(230_000 + dungeonLevel + startProgress));
        token.approve(address(world), type(uint256).max);

        bytes32 secret = keccak256(abi.encode("decay", characterId, dungeonLevel, startProgress));
        uint64 nonce = uint64(230_500 + dungeonLevel + startProgress);
        bytes32 hash = world.hashDungeonRun(
            secret,
            owner,
            characterId,
            nonce,
            GameTypes.Difficulty.CHALLENGER,
            dungeonLevel,
            GameTypes.VarianceMode.NEUTRAL
        );

        uint256 commitId = world.commitActionWithVariance{value: world.commitFee()}(
            characterId, GameTypes.ActionType.DUNGEON_RUN, hash, nonce, GameTypes.VarianceMode.NEUTRAL
        );

        _rollToReveal(commitId);
        world.revealStartDungeon(
            commitId, secret, GameTypes.Difficulty.CHALLENGER, dungeonLevel, GameTypes.VarianceMode.NEUTRAL
        );

        while (true) {
            (bool active,,,,,,,,,) = world.getRunState(characterId);
            if (!active) break;
            world.resolveNextRoom(characterId, GameTypes.PotionChoice.NONE, GameTypes.AbilityChoice.NONE);
        }
        vm.stopPrank();

        assertEq(world.levelClearProgress(characterId, dungeonLevel), expectedProgress);
    }

    function _equipTierOneKit(uint256 characterId, address who, uint64 seedBase) internal {
        for (uint8 slot = 0; slot < 8; slot++) {
            uint256 itemId = _forceMintItem(who, GameTypes.Slot(slot), 1, seedBase + slot);
            world.equipItem(characterId, itemId);
        }
    }
}
