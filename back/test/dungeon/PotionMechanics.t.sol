// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ChainMMOBase} from "../helpers/ChainMMOBase.t.sol";
import {Vm} from "forge-std/Vm.sol";
import {GameTypes} from "../../src/libraries/GameTypes.sol";

contract PotionMechanicsTest is ChainMMOBase {
    function test_PotionTierPriorityExtremeStrongNormalThenBaseline() public {
        uint256 characterId = _createCharacter(playerA, "PotionPriority");
        _openFreeLootbox(characterId, playerA, 70_001);
        uint256 itemId = items.tokenOfOwnerByIndex(playerA, 0);
        vm.prank(playerA);
        world.equipItem(characterId, itemId);

        _forceCreditPotion(characterId, GameTypes.PotionType.HP_REGEN, GameTypes.PotionTier.NORMAL, 1);
        _forceCreditPotion(characterId, GameTypes.PotionType.HP_REGEN, GameTypes.PotionTier.STRONG, 1);
        _forceCreditPotion(characterId, GameTypes.PotionType.HP_REGEN, GameTypes.PotionTier.EXTREME, 1);

        vm.startPrank(playerA);
        _startRun(characterId, 70_100, bytes32("prio-1"));
        world.resolveNextRoom(characterId, GameTypes.PotionChoice.HP_REGEN, GameTypes.AbilityChoice.NONE);
        assertEq(world.potionBalance(characterId, GameTypes.PotionType.HP_REGEN, GameTypes.PotionTier.EXTREME), 0);
        assertEq(world.potionBalance(characterId, GameTypes.PotionType.HP_REGEN, GameTypes.PotionTier.STRONG), 1);
        assertEq(world.potionBalance(characterId, GameTypes.PotionType.HP_REGEN, GameTypes.PotionTier.NORMAL), 1);
        _drainRun(characterId);

        _startRun(characterId, 70_101, bytes32("prio-2"));
        world.resolveNextRoom(characterId, GameTypes.PotionChoice.HP_REGEN, GameTypes.AbilityChoice.NONE);
        assertEq(world.potionBalance(characterId, GameTypes.PotionType.HP_REGEN, GameTypes.PotionTier.STRONG), 0);
        assertEq(world.potionBalance(characterId, GameTypes.PotionType.HP_REGEN, GameTypes.PotionTier.NORMAL), 1);
        _drainRun(characterId);

        _startRun(characterId, 70_102, bytes32("prio-3"));
        world.resolveNextRoom(characterId, GameTypes.PotionChoice.HP_REGEN, GameTypes.AbilityChoice.NONE);
        assertEq(world.potionBalance(characterId, GameTypes.PotionType.HP_REGEN, GameTypes.PotionTier.NORMAL), 0);
        _drainRun(characterId);

        _startRun(characterId, 70_103, bytes32("prio-4"));
        world.resolveNextRoom(characterId, GameTypes.PotionChoice.HP_REGEN, GameTypes.AbilityChoice.NONE);
        assertEq(world.potionBalance(characterId, GameTypes.PotionType.HP_REGEN, GameTypes.PotionTier.EXTREME), 0);
        assertEq(world.potionBalance(characterId, GameTypes.PotionType.HP_REGEN, GameTypes.PotionTier.STRONG), 0);
        assertEq(world.potionBalance(characterId, GameTypes.PotionType.HP_REGEN, GameTypes.PotionTier.NORMAL), 0);
        vm.stopPrank();
    }

    function test_PotionConsumedEventReportsSelectedTier() public {
        uint256 characterId = _createCharacter(playerA, "PotionEvent");
        _openFreeLootbox(characterId, playerA, 71_001);
        uint256 itemId = items.tokenOfOwnerByIndex(playerA, 0);
        vm.prank(playerA);
        world.equipItem(characterId, itemId);
        _forceCreditPotion(characterId, GameTypes.PotionType.POWER, GameTypes.PotionTier.EXTREME, 1);

        vm.startPrank(playerA);
        _startRun(characterId, 71_100, bytes32("event-run-1"));
        vm.recordLogs();
        world.resolveNextRoom(characterId, GameTypes.PotionChoice.POWER, GameTypes.AbilityChoice.BERSERK);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 potionSig = keccak256("PotionConsumed(uint256,uint8,uint8,uint8)");
        bool sawExtreme;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics.length > 0 && logs[i].topics[0] == potionSig) {
                uint256 tier = abi.decode(logs[i].data, (uint256));
                if (tier == uint8(GameTypes.PotionTier.EXTREME)) {
                    sawExtreme = true;
                }
            }
        }
        assertTrue(sawExtreme);
        _drainRun(characterId);

        _startRun(characterId, 71_101, bytes32("event-run-2"));
        vm.recordLogs();
        world.resolveNextRoom(characterId, GameTypes.PotionChoice.POWER, GameTypes.AbilityChoice.BERSERK);
        logs = vm.getRecordedLogs();
        bool sawNormal;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics.length > 0 && logs[i].topics[0] == potionSig) {
                uint256 tier = abi.decode(logs[i].data, (uint256));
                if (tier == uint8(GameTypes.PotionTier.NORMAL)) {
                    sawNormal = true;
                }
            }
        }
        assertTrue(sawNormal);
        vm.stopPrank();
    }

    function _startRun(uint256 characterId, uint64 nonce, bytes32 secret) internal {
        bytes32 runHash = keccak256(
            abi.encode(
                secret,
                playerA,
                GameTypes.ActionType.DUNGEON_RUN,
                characterId,
                nonce,
                uint8(GameTypes.Difficulty.EASY),
                uint32(1)
            )
        );
        uint256 commitId =
            world.commitAction{value: world.commitFee()}(characterId, GameTypes.ActionType.DUNGEON_RUN, runHash, nonce);
        _rollToReveal(commitId);
        world.revealStartDungeon(commitId, secret, GameTypes.Difficulty.EASY, 1);
    }

    function _drainRun(uint256 characterId) internal {
        while (true) {
            (
                bool active,
                uint8 roomCount,
                uint8 roomsCleared,
                uint32 hp,
                uint32 mana,
                uint8 hpPotionCharges,
                uint8 manaPotionCharges,
                uint8 powerPotionCharges,
                uint32 dungeonLevel,
                GameTypes.Difficulty difficulty
            ) = world.getRunState(characterId);
            roomCount;
            roomsCleared;
            hp;
            mana;
            hpPotionCharges;
            manaPotionCharges;
            powerPotionCharges;
            dungeonLevel;
            difficulty;
            if (!active) return;
            world.resolveNextRoom(characterId, GameTypes.PotionChoice.NONE, GameTypes.AbilityChoice.NONE);
        }
    }
}
