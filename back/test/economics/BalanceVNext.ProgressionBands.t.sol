// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ChainMMOBase} from "../helpers/ChainMMOBase.t.sol";
import {GameTypes} from "../../src/libraries/GameTypes.sol";

contract BalanceVNextProgressionBandsTest is ChainMMOBase {
    function test_RecommendationRampsAreMonotonicAndSmooth() public view {
        uint8 prevSet;
        uint8 prevMatch;
        uint8 prevAffix;

        for (uint32 level = 1; level <= 100; level++) {
            uint8 setPieces = world.recommendedSetPieces(level);
            uint8 matchPieces = world.recommendedMatchingSetPieces(level);
            uint8 affixPieces = world.recommendedHighAffixPieces(level);

            assertGe(setPieces, prevSet);
            assertGe(matchPieces, prevMatch);
            assertGe(affixPieces, prevAffix);

            assertLe(setPieces - prevSet, 1);
            assertLe(matchPieces - prevMatch, 1);
            assertLe(affixPieces - prevAffix, 1);

            prevSet = setPieces;
            prevMatch = matchPieces;
            prevAffix = affixPieces;
        }
    }

    function test_FailureDecayBandsApplyMinusOneMinusTwoMinusThree() public {
        token.transfer(playerA, 5_000_000 ether);

        uint256 l21Character = _createCharacter(playerA, "Decay21");
        _forceLevel(l21Character, 20);
        _equipWeakFullKit(l21Character, 100_000);
        _forceSetLevelClearProgress(l21Character, 21, 2);
        _forceFailedPush(l21Character, 21, 200_000);
        assertEq(world.levelClearProgress(l21Character, 21), 1);

        uint256 l31Character = _createCharacter(playerA, "Decay31");
        _forceLevel(l31Character, 30);
        _equipWeakFullKit(l31Character, 110_000);
        _forceSetLevelClearProgress(l31Character, 31, 4);
        _forceFailedPush(l31Character, 31, 210_000);
        assertEq(world.levelClearProgress(l31Character, 31), 2);

        uint256 l61Character = _createCharacter(playerA, "Decay61");
        _forceLevel(l61Character, 60);
        _equipWeakFullKit(l61Character, 120_000);
        _forceSetLevelClearProgress(l61Character, 61, 5);
        _forceFailedPush(l61Character, 61, 220_000);
        assertEq(world.levelClearProgress(l61Character, 61), 2);
    }

    function _forceFailedPush(uint256 characterId, uint32 targetLevel, uint64 nonceBase) internal {
        vm.startPrank(playerA);
        token.approve(address(world), type(uint256).max);

        for (uint64 i = 0; i < 8; i++) {
            bytes32 secret = keccak256(abi.encode("force-fail", characterId, targetLevel, nonceBase + i));
            uint64 nonce = nonceBase + i;
            bytes32 hash = keccak256(
                abi.encode(
                    secret,
                    playerA,
                    GameTypes.ActionType.DUNGEON_RUN,
                    characterId,
                    nonce,
                    uint8(GameTypes.Difficulty.CHALLENGER),
                    targetLevel
                )
            );

            uint256 commitId = world.commitAction{value: world.commitFee()}(
                characterId, GameTypes.ActionType.DUNGEON_RUN, hash, nonce
            );
            _rollToReveal(commitId);
            world.revealStartDungeon(commitId, secret, GameTypes.Difficulty.CHALLENGER, targetLevel);

            uint32 levelBefore = world.characterBestLevel(characterId);
            _drainRun(characterId);
            uint32 levelAfter = world.characterBestLevel(characterId);
            if (levelAfter == levelBefore) {
                vm.stopPrank();
                return;
            }
        }

        vm.stopPrank();
        fail();
    }

    function _equipWeakFullKit(uint256 characterId, uint64 seedBase) internal {
        for (uint8 slot = 0; slot < 8; slot++) {
            uint256 itemId = _forceMintItem(playerA, GameTypes.Slot(slot), 1, seedBase + slot);
            vm.prank(playerA);
            world.equipItem(characterId, itemId);
        }
    }

    function _drainRun(uint256 characterId) internal {
        while (true) {
            (bool active,,,,,,,,,) = world.getRunState(characterId);
            if (!active) return;
            world.resolveNextRoom(characterId, GameTypes.PotionChoice.NONE, GameTypes.AbilityChoice.NONE);
        }
    }
}
