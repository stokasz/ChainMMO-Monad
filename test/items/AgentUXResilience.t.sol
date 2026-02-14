// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ChainMMOBase} from "../helpers/ChainMMOBase.t.sol";
import {GameWorld} from "../../src/GameWorld.sol";
import {GameConstants} from "../../src/libraries/GameConstants.sol";
import {GameTypes} from "../../src/libraries/GameTypes.sol";

contract AgentUXResilienceTest is ChainMMOBase {
    function test_RevealWindowLifecycleSignalsForSchedulers() public {
        uint256 characterId = _createCharacter(playerA, "WindowLifecycle");

        bytes32 secret = keccak256("window-life");
        uint64 nonce = 210_001;
        bytes32 hash =
            world.hashLootboxOpen(secret, playerA, characterId, nonce, 2, 1, GameTypes.VarianceMode.NEUTRAL, true);

        vm.startPrank(playerA);
        uint256 commitId = world.commitActionWithVariance{value: world.commitFee()}(
            characterId, GameTypes.ActionType.LOOTBOX_OPEN, hash, nonce, GameTypes.VarianceMode.NEUTRAL
        );

        (,, bool canRevealEarly, bool expiredEarly, bool resolvedEarly) = world.revealWindow(commitId);
        assertFalse(canRevealEarly);
        assertFalse(expiredEarly);
        assertFalse(resolvedEarly);

        _rollToReveal(commitId);
        (,, bool canRevealAtWindow, bool expiredAtWindow, bool resolvedAtWindow) = world.revealWindow(commitId);
        assertTrue(canRevealAtWindow);
        assertFalse(expiredAtWindow);
        assertFalse(resolvedAtWindow);

        (,,,,, uint64 commitBlock,,) = world.commits(commitId);
        vm.roll(uint256(commitBlock) + 257);

        (,, bool canRevealExpired, bool expiredExpired, bool resolvedExpired) = world.revealWindow(commitId);
        assertFalse(canRevealExpired);
        assertTrue(expiredExpired);
        assertFalse(resolvedExpired);

        world.cancelExpired(commitId);
        vm.stopPrank();

        (,, bool canRevealResolved, bool expiredResolved, bool resolvedResolved) = world.revealWindow(commitId);
        assertFalse(canRevealResolved);
        assertFalse(expiredResolved);
        assertTrue(resolvedResolved);
    }

    function test_ClassMismatchedAbilityIsFailSoftAndDoesNotSpendMana() public {
        uint256 characterId = _createCharacter(playerA, "FailSoftMismatch");
        _forceLevel(characterId, 200);

        vm.startPrank(playerA);
        _equipFullKit(characterId, playerA, 201, 220_000);
        _startEasyRun(characterId, playerA, 220_500, bytes32("mismatch-run"));

        (, uint32 manaBefore) = _currentHpMana(characterId);
        world.resolveNextRoom(characterId, GameTypes.PotionChoice.NONE, GameTypes.AbilityChoice.ARCANE_FOCUS);
        (bool active,,,,,,,,,) = world.getRunState(characterId);
        (, uint32 manaAfter) = _currentHpMana(characterId);
        vm.stopPrank();

        assertTrue(active);
        assertEq(manaAfter, manaBefore);
    }

    function test_LowManaAbilitySelectionIsNoopAndNeverUnderflowsMana() public {
        uint256 characterId = _createClassCharacter(playerA, GameTypes.Class.PALADIN, "LowManaNoop");
        _forceLevel(characterId, 200);

        vm.startPrank(playerA);
        _equipFullKit(characterId, playerA, 201, 221_000);
        _startEasyRun(characterId, playerA, 221_500, bytes32("low-mana-run"));

        (, uint32 initialMana) = _currentHpMana(characterId);
        uint32 manaCost =
            uint32((uint256(initialMana) * GameConstants.PALADIN_ABILITY_MANA_COST_BPS) / GameConstants.BPS);

        for (uint256 i = 0; i < 4; i++) {
            (bool active,,,,,,,,,) = world.getRunState(characterId);
            assertTrue(active);
            world.resolveNextRoom(characterId, GameTypes.PotionChoice.NONE, GameTypes.AbilityChoice.DIVINE_SHIELD);
        }

        (bool stillActive,,,,,,,,,) = world.getRunState(characterId);
        assertTrue(stillActive);

        (, uint32 manaBefore) = _currentHpMana(characterId);
        assertLt(manaBefore, manaCost);

        world.resolveNextRoom(characterId, GameTypes.PotionChoice.NONE, GameTypes.AbilityChoice.DIVINE_SHIELD);
        (, uint32 manaAfter) = _currentHpMana(characterId);
        vm.stopPrank();

        assertEq(manaAfter, manaBefore);
    }

    function test_MaxLevelHelpersSaturateAndAvoidOverflowPaths() public {
        uint256 characterId = _createCharacter(playerA, "MaxLevel");
        _forceLevel(characterId, type(uint32).max);

        GameWorld.ProgressionSnapshot memory snapshot = world.getProgressionSnapshot(characterId);
        assertEq(snapshot.bestLevel, type(uint32).max);
        assertEq(snapshot.targetLevel, type(uint32).max);

        uint32 quotedTier = world.premiumLootboxTier(characterId, GameTypes.Difficulty.CHALLENGER);
        assertEq(quotedTier, type(uint32).max);

        uint256 maxTierItem = _forceMintItem(playerA, GameTypes.Slot.HEAD, type(uint32).max, 222_900);
        vm.prank(playerA);
        world.equipItem(characterId, maxTierItem);

        assertEq(world.equippedItemBySlot(characterId, uint8(GameTypes.Slot.HEAD)), maxTierItem);
    }

    function _createClassCharacter(address who, GameTypes.Class classType, string memory name)
        internal
        returns (uint256 characterId)
    {
        vm.prank(who);
        characterId = world.createCharacter(GameTypes.Race.HUMAN, classType, name);
    }

    function _startEasyRun(uint256 characterId, address who, uint64 nonce, bytes32 secret) internal {
        bytes32 hash = world.hashDungeonRun(
            secret, who, characterId, nonce, GameTypes.Difficulty.EASY, 2, GameTypes.VarianceMode.NEUTRAL
        );

        uint256 commitId = world.commitActionWithVariance{value: world.commitFee()}(
            characterId, GameTypes.ActionType.DUNGEON_RUN, hash, nonce, GameTypes.VarianceMode.NEUTRAL
        );

        _rollToReveal(commitId);
        world.revealStartDungeon(commitId, secret, GameTypes.Difficulty.EASY, 2, GameTypes.VarianceMode.NEUTRAL);
    }

    function _equipFullKit(uint256 characterId, address who, uint32 tier, uint64 seedBase) internal {
        for (uint8 slot = 0; slot < 8; slot++) {
            uint256 itemId = _forceMintItem(who, GameTypes.Slot(slot), tier, seedBase + slot);
            world.equipItem(characterId, itemId);
        }
    }

    function _currentHpMana(uint256 characterId) internal view returns (uint32 hp, uint32 mana) {
        (,,, hp, mana,,,,,) = world.getRunState(characterId);
    }
}
