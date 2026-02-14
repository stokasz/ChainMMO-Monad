// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ChainMMOBase} from "../helpers/ChainMMOBase.t.sol";
import {GameTypes} from "../../src/libraries/GameTypes.sol";

contract VarianceModeTest is ChainMMOBase {
    function test_VarianceModeMomentsMeanAndVarianceOrdering() public {
        uint256 samples = 320;
        uint256 stableSum;
        uint256 neutralSum;
        uint256 swingySum;
        uint256 stableSumSq;
        uint256 neutralSumSq;
        uint256 swingySumSq;

        for (uint256 i = 0; i < samples; i++) {
            uint64 seed = uint64(uint256(keccak256(abi.encode("variance", i))));
            uint256 stableId =
                _forceMintItemWithVariance(playerA, GameTypes.Slot.MAIN_HAND, 35, seed, GameTypes.VarianceMode.STABLE);
            uint256 neutralId =
                _forceMintItemWithVariance(playerA, GameTypes.Slot.MAIN_HAND, 35, seed, GameTypes.VarianceMode.NEUTRAL);
            uint256 swingyId =
                _forceMintItemWithVariance(playerA, GameTypes.Slot.MAIN_HAND, 35, seed, GameTypes.VarianceMode.SWINGY);

            uint32 stableRoll = items.previewRoll(stableId);
            uint32 neutralRoll = items.previewRoll(neutralId);
            uint32 swingyRoll = items.previewRoll(swingyId);

            stableSum += stableRoll;
            neutralSum += neutralRoll;
            swingySum += swingyRoll;

            stableSumSq += uint256(stableRoll) * stableRoll;
            neutralSumSq += uint256(neutralRoll) * neutralRoll;
            swingySumSq += uint256(swingyRoll) * swingyRoll;
        }

        uint256 stableMean = stableSum / samples;
        uint256 neutralMean = neutralSum / samples;
        uint256 swingyMean = swingySum / samples;

        uint256 stableVar = stableSumSq / samples - stableMean * stableMean;
        uint256 neutralVar = neutralSumSq / samples - neutralMean * neutralMean;
        uint256 swingyVar = swingySumSq / samples - swingyMean * swingyMean;

        assertApproxEqRel(stableMean, neutralMean, 0.05e18);
        assertApproxEqRel(neutralMean, swingyMean, 0.05e18);

        assertLe(stableVar, (neutralVar * 105) / 100);
        assertGt(swingyVar, (neutralVar * 105) / 100);
    }

    function test_LootboxRevealWithVarianceTagsMintedItems() public {
        uint256 characterId = _createCharacter(playerA, "VarianceOpen");

        vm.startPrank(playerA);
        world.claimFreeLootbox(characterId);

        uint64 nonce = 84_001;
        bytes32 secret = keccak256("variance-open");
        bytes32 commitHash = keccak256(
            abi.encode(
                secret,
                playerA,
                GameTypes.ActionType.LOOTBOX_OPEN,
                characterId,
                nonce,
                uint32(2),
                uint16(1),
                uint8(GameTypes.VarianceMode.SWINGY)
            )
        );

        uint256 commitId = world.commitActionWithVariance{value: world.commitFee()}(
            characterId, GameTypes.ActionType.LOOTBOX_OPEN, commitHash, nonce, GameTypes.VarianceMode.SWINGY
        );
        _rollToReveal(commitId);

        uint256 before = items.nextTokenId();
        world.revealOpenLootboxes(commitId, secret, 2, 1, GameTypes.VarianceMode.SWINGY);
        vm.stopPrank();

        uint256 tokenId = before;
        assertEq(uint8(items.varianceModeOf(tokenId)), uint8(GameTypes.VarianceMode.SWINGY));
    }

    function test_LegacyRevealDefaultsToNeutralVariance() public {
        uint256 characterId = _createCharacter(playerA, "NeutralLegacy");

        vm.startPrank(playerA);
        world.claimFreeLootbox(characterId);

        uint64 nonce = 84_101;
        bytes32 secret = keccak256("neutral-open");
        bytes32 commitHash = keccak256(
            abi.encode(secret, playerA, GameTypes.ActionType.LOOTBOX_OPEN, characterId, nonce, uint32(2), uint16(1))
        );

        uint256 commitId = world.commitAction{value: world.commitFee()}(
            characterId, GameTypes.ActionType.LOOTBOX_OPEN, commitHash, nonce
        );
        _rollToReveal(commitId);

        uint256 before = items.nextTokenId();
        world.revealOpenLootboxes(commitId, secret, 2, 1);
        vm.stopPrank();

        uint256 tokenId = before;
        assertEq(uint8(items.varianceModeOf(tokenId)), uint8(GameTypes.VarianceMode.NEUTRAL));
    }

    function test_LegacyDungeonRevealDefaultsToNeutralVariance() public {
        uint256 characterId = _createCharacter(playerA, "NeutralDungeon");
        _equipFullKit(characterId, playerA, 2, 95_000);

        vm.startPrank(playerA);
        uint64 nonce = 84_201;
        bytes32 secret = keccak256("neutral-dungeon");
        bytes32 commitHash = keccak256(
            abi.encode(
                secret,
                playerA,
                GameTypes.ActionType.DUNGEON_RUN,
                characterId,
                nonce,
                uint8(GameTypes.Difficulty.EASY),
                uint32(2)
            )
        );

        uint256 commitId = world.commitAction{value: world.commitFee()}(
            characterId, GameTypes.ActionType.DUNGEON_RUN, commitHash, nonce
        );
        _rollToReveal(commitId);
        world.revealStartDungeon(commitId, secret, GameTypes.Difficulty.EASY, 2);
        vm.stopPrank();

        assertEq(uint8(world.runVarianceMode(characterId)), uint8(GameTypes.VarianceMode.NEUTRAL));

        vm.startPrank(playerA);
        _drainRun(characterId);
        vm.stopPrank();

        assertEq(world.lootboxBoundCredits(characterId, 3, GameTypes.VarianceMode.NEUTRAL), 1);
        assertEq(world.lootboxBoundCredits(characterId, 3, GameTypes.VarianceMode.STABLE), 0);
        assertEq(world.lootboxBoundCredits(characterId, 3, GameTypes.VarianceMode.SWINGY), 0);
    }

    function _equipFullKit(uint256 characterId, address who, uint32 tier, uint64 seedBase) internal {
        for (uint8 slot = 0; slot < 8; slot++) {
            uint256 itemId = _forceMintItem(who, GameTypes.Slot(slot), tier, seedBase + slot);
            vm.prank(who);
            world.equipItem(characterId, itemId);
        }
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
