// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ChainMMOBase} from "../helpers/ChainMMOBase.t.sol";
import {GameErrors} from "../../src/libraries/GameErrors.sol";
import {GameTypes} from "../../src/libraries/GameTypes.sol";

contract AgentUXTest is ChainMMOBase {
    function test_ProgressionReadHelpersExposeTierAndGearReadiness() public {
        uint256 characterId = _createCharacter(playerA, "ReadHelpers");

        assertEq(world.premiumLootboxTier(characterId, GameTypes.Difficulty.EASY), 2);
        assertEq(world.premiumLootboxTier(characterId, GameTypes.Difficulty.HARD), 5);
        assertEq(world.equippedSlotCount(characterId), 0);

        assertEq(world.requiredEquippedSlots(5), 1);
        assertEq(world.requiredEquippedSlots(10), 4);
        assertEq(world.requiredEquippedSlots(11), 8);

        assertEq(world.recommendedMatchingSetPieces(29), 1);
        assertEq(world.recommendedMatchingSetPieces(30), 1);
        assertEq(world.recommendedHighAffixPieces(25), 1);
        assertEq(world.tacticalMobBonusBps(10, true, GameTypes.PotionChoice.NONE, GameTypes.AbilityChoice.NONE), 1_800);
        assertEq(world.tacticalMobBonusBps(10, true, GameTypes.PotionChoice.POWER, GameTypes.AbilityChoice.NONE), 0);

        uint256 head = _forceMintItem(playerA, GameTypes.Slot.HEAD, 2, 95_001);
        uint256 chest = _forceMintItem(playerA, GameTypes.Slot.CHEST, 2, 95_002);

        vm.startPrank(playerA);
        world.equipItem(characterId, head);
        world.equipItem(characterId, chest);
        vm.stopPrank();

        assertEq(world.equippedSlotCount(characterId), 2);
    }

    function test_QuoteOpenLootboxesReportsBoundAndGenericCredits() public {
        uint256 characterId = _createCharacter(playerA, "QuoteUX");

        vm.startPrank(playerA);
        _equipTierTwoKit(characterId, playerA, 98_000);
        _winStableTierThreeCredit(characterId);
        _buyOnePremiumEasy(characterId);
        vm.stopPrank();

        (uint32 totalStable, uint32 boundStable, uint32 genericStable, uint16 openableStable) =
            world.quoteOpenLootboxes(characterId, 3, 10, GameTypes.VarianceMode.STABLE);
        assertEq(totalStable, 2);
        assertEq(boundStable, 1);
        assertEq(genericStable, 1);
        assertEq(openableStable, 2);

        (uint32 totalSwingy, uint32 boundSwingy, uint32 genericSwingy, uint16 openableSwingy) =
            world.quoteOpenLootboxes(characterId, 3, 10, GameTypes.VarianceMode.SWINGY);
        assertEq(totalSwingy, 2);
        assertEq(boundSwingy, 0);
        assertEq(genericSwingy, 1);
        assertEq(openableSwingy, 1);
    }

    function test_RevealOpenLootboxesMaxOpensAvailableWithoutRevert() public {
        uint256 characterId = _createCharacter(playerA, "MaxOpen");

        vm.startPrank(playerA);
        world.claimFreeLootbox(characterId);

        bytes32 secret = keccak256("max-open");
        uint64 nonce = 97_001;
        bytes32 hash =
            world.hashLootboxOpen(secret, playerA, characterId, nonce, 2, 3, GameTypes.VarianceMode.NEUTRAL, true);
        uint256 commitId = world.commitActionWithVariance{value: world.commitFee()}(
            characterId, GameTypes.ActionType.LOOTBOX_OPEN, hash, nonce, GameTypes.VarianceMode.NEUTRAL
        );
        _rollToReveal(commitId);

        uint256 before = items.nextTokenId();
        uint16 opened = world.revealOpenLootboxesMax(commitId, secret, 2, 3, GameTypes.VarianceMode.NEUTRAL);
        vm.stopPrank();

        assertEq(opened, 1);
        assertEq(items.nextTokenId() - before, 1);
        assertEq(world.lootboxCredits(characterId, 2), 0);
    }

    function test_RevealOpenLootboxesMaxCanResolveToZeroWhenCreditsSpent() public {
        uint256 characterId = _createCharacter(playerA, "MaxZero");

        vm.startPrank(playerA);
        world.claimFreeLootbox(characterId);

        bytes32 spendSecret = keccak256("spend-first");
        uint64 spendNonce = 97_101;
        bytes32 spendHash = world.hashLootboxOpen(
            spendSecret, playerA, characterId, spendNonce, 2, 1, GameTypes.VarianceMode.NEUTRAL, false
        );
        uint256 spendCommitId = world.commitActionWithVariance{value: world.commitFee()}(
            characterId, GameTypes.ActionType.LOOTBOX_OPEN, spendHash, spendNonce, GameTypes.VarianceMode.NEUTRAL
        );
        _rollToReveal(spendCommitId);
        world.revealOpenLootboxes(spendCommitId, spendSecret, 2, 1, GameTypes.VarianceMode.NEUTRAL);

        bytes32 zeroSecret = keccak256("max-zero");
        uint64 zeroNonce = 97_102;
        bytes32 zeroHash = world.hashLootboxOpen(
            zeroSecret, playerA, characterId, zeroNonce, 2, 5, GameTypes.VarianceMode.NEUTRAL, true
        );
        uint256 zeroCommitId = world.commitActionWithVariance{value: world.commitFee()}(
            characterId, GameTypes.ActionType.LOOTBOX_OPEN, zeroHash, zeroNonce, GameTypes.VarianceMode.NEUTRAL
        );
        _rollToReveal(zeroCommitId);

        uint256 before = items.nextTokenId();
        uint16 opened = world.revealOpenLootboxesMax(zeroCommitId, zeroSecret, 2, 5, GameTypes.VarianceMode.NEUTRAL);
        vm.stopPrank();

        assertEq(opened, 0);
        assertEq(items.nextTokenId(), before);
        assertEq(world.lootboxCredits(characterId, 2), 0);
        (address actor,,,,,,,) = world.commits(zeroCommitId);
        assertEq(actor, address(0));
    }

    function test_RevealOpenLootboxesMaxRejectsExactHashDomain() public {
        uint256 characterId = _createCharacter(playerA, "MaxHashDomain");

        vm.startPrank(playerA);
        world.claimFreeLootbox(characterId);

        bytes32 secret = keccak256("wrong-domain");
        uint64 nonce = 97_201;
        bytes32 exactHash =
            world.hashLootboxOpen(secret, playerA, characterId, nonce, 2, 1, GameTypes.VarianceMode.NEUTRAL, false);
        uint256 commitId = world.commitActionWithVariance{value: world.commitFee()}(
            characterId, GameTypes.ActionType.LOOTBOX_OPEN, exactHash, nonce, GameTypes.VarianceMode.NEUTRAL
        );
        _rollToReveal(commitId);

        vm.expectRevert(GameErrors.InvalidReveal.selector);
        world.revealOpenLootboxesMax(commitId, secret, 2, 1, GameTypes.VarianceMode.NEUTRAL);
        vm.stopPrank();
    }

    function _winStableTierThreeCredit(uint256 characterId) internal {
        for (uint256 i = 0; i < 20; i++) {
            bytes32 secret = keccak256(abi.encode("stable-win", i));
            uint64 nonce = uint64(96_000 + i);
            bytes32 hash = world.hashDungeonRun(
                secret, playerA, characterId, nonce, GameTypes.Difficulty.EASY, 2, GameTypes.VarianceMode.STABLE
            );
            uint256 commitId = world.commitActionWithVariance{value: world.commitFee()}(
                characterId, GameTypes.ActionType.DUNGEON_RUN, hash, nonce, GameTypes.VarianceMode.STABLE
            );
            _rollToReveal(commitId);
            world.revealStartDungeon(commitId, secret, GameTypes.Difficulty.EASY, 2, GameTypes.VarianceMode.STABLE);
            _drainRun(characterId);
            if (world.lootboxBoundCredits(characterId, 3, GameTypes.VarianceMode.STABLE) > 0) return;
        }
        revert("stable run did not succeed in bounded attempts");
    }

    function _buyOnePremiumEasy(uint256 characterId) internal {
        (uint256 cost,) = feeVault.quotePremiumPurchase(characterId, GameTypes.Difficulty.EASY, 1);
        feeVault.buyPremiumLootboxes{value: cost}(characterId, GameTypes.Difficulty.EASY, 1);
    }

    function _equipTierTwoKit(uint256 characterId, address who, uint64 seedBase) internal {
        for (uint8 slot = 0; slot < 8; slot++) {
            uint256 itemId = _forceMintItem(who, GameTypes.Slot(slot), 2, seedBase + slot);
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
