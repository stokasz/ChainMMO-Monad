// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ChainMMOBase} from "../helpers/ChainMMOBase.t.sol";
import {GameTypes} from "../../src/libraries/GameTypes.sol";

contract ExternalTokenModeTest is ChainMMOBase {
    function test_DungeonSuccessDoesNotGrantMmoFaucetRewards() public {
        uint256 characterId = _createCharacter(playerA, "NoFaucet");
        _openFreeLootbox(characterId, playerA, 701);

        vm.startPrank(playerA);
        world.equipItem(characterId, items.tokenOfOwnerByIndex(playerA, 0));

        uint256 mmoBefore = token.balanceOf(playerA);
        uint64 nonce = 702;
        bytes32 secret = keccak256("no-faucet-run");
        bytes32 hash = world.hashDungeonRun(
            secret, playerA, characterId, nonce, GameTypes.Difficulty.EASY, 2, GameTypes.VarianceMode.NEUTRAL
        );

        uint256 commitId = world.commitActionWithVariance{value: world.commitFee()}(
            characterId, GameTypes.ActionType.DUNGEON_RUN, hash, nonce, GameTypes.VarianceMode.NEUTRAL
        );
        _rollToReveal(commitId);
        world.revealStartDungeon(commitId, secret, GameTypes.Difficulty.EASY, 2, GameTypes.VarianceMode.NEUTRAL);
        _drainRun(characterId);
        vm.stopPrank();

        assertEq(world.characterBestLevel(characterId), 2);
        assertEq(token.balanceOf(playerA), mmoBefore);
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
