// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ChainMMOBase} from "../helpers/ChainMMOBase.t.sol";
import {GameConstants} from "../../src/libraries/GameConstants.sol";
import {GameErrors} from "../../src/libraries/GameErrors.sol";
import {GameTypes} from "../../src/libraries/GameTypes.sol";

contract ProgressionBalanceTest is ChainMMOBase {
    function test_StarterFlowCanReachLevelTwoWithinBoundedAttempts() public {
        uint256 characterId = _createCharacter(playerA, "StarterFlow");
        _openFreeLootbox(characterId, playerA, 400_000);

        uint256 starterItem = items.tokenOfOwnerByIndex(playerA, 0);
        vm.prank(playerA);
        world.equipItem(characterId, starterItem);

        bool reachedLevelTwo;
        for (uint64 i = 0; i < 40; i++) {
            vm.startPrank(playerA);
            bytes32 secret = keccak256(abi.encode("starter-l2", i));
            uint64 nonce = uint64(400_100 + i);
            uint256 commitId = _commitRun(characterId, playerA, GameTypes.Difficulty.EASY, 2, nonce, secret);
            _rollToReveal(commitId);
            world.revealStartDungeon(commitId, secret, GameTypes.Difficulty.EASY, 2);
            _drainRun(characterId);
            vm.stopPrank();

            if (world.characterBestLevel(characterId) >= 2) {
                reachedLevelTwo = true;
                break;
            }
        }

        assertTrue(reachedLevelTwo);
    }

    function test_DungeonEntryRequiresMinimumEquippedSlots() public {
        uint256 characterId = _createCharacter(playerA, "SlotGate");
        _forceLevel(characterId, 5);

        uint256 item0 = _forceMintItem(playerA, GameTypes.Slot.HEAD, 6, 400_001);
        vm.prank(playerA);
        world.equipItem(characterId, item0);

        vm.startPrank(playerA);
        uint256 commitId = _commitRun(characterId, playerA, GameTypes.Difficulty.EASY, 6, 400_010, "slot-gate");
        _rollToReveal(commitId);
        vm.expectRevert(GameErrors.InsufficientEquippedSlots.selector);
        world.revealStartDungeon(commitId, bytes32("slot-gate"), GameTypes.Difficulty.EASY, 6);
        vm.stopPrank();

        _buyOpenAndEquipPremium(characterId, playerA, 12, 400_100);
        if (world.equippedSlotCount(characterId) < 4) {
            _buyOpenAndEquipPremium(characterId, playerA, 12, 400_101);
        }
        assertGe(world.equippedSlotCount(characterId), 4);

        vm.startPrank(playerA);
        uint256 okCommit = _commitRun(characterId, playerA, GameTypes.Difficulty.EASY, 6, 400_011, "slot-ok");
        _rollToReveal(okCommit);
        world.revealStartDungeon(okCommit, bytes32("slot-ok"), GameTypes.Difficulty.EASY, 6);
        (bool active,,,,,,,,,) = world.getRunState(characterId);
        vm.stopPrank();
        assertTrue(active);
    }

    function test_ReplayAtCurrentBestLevelYieldsNoLootOrMmo() public {
        uint256 characterId = _createCharacter(playerA, "NoReplayRewards");
        _equipAllSlots(characterId, playerA, 2, 410_000);

        uint32 rewardTier = 2;
        uint256 mmoBefore = token.balanceOf(playerA);
        uint32 lootBefore = world.lootboxCredits(characterId, rewardTier);

        vm.startPrank(playerA);
        uint256 commitId = _commitRun(characterId, playerA, GameTypes.Difficulty.EASY, 1, 410_010, "replay-run");
        _rollToReveal(commitId);
        world.revealStartDungeon(commitId, bytes32("replay-run"), GameTypes.Difficulty.EASY, 1);
        _drainRun(characterId);
        vm.stopPrank();

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
        hp;
        mana;
        hpPotionCharges;
        manaPotionCharges;
        powerPotionCharges;
        dungeonLevel;
        difficulty;
        assertFalse(active);
        assertEq(roomsCleared, roomCount);
        assertEq(world.lootboxCredits(characterId, rewardTier), lootBefore);
        assertEq(token.balanceOf(playerA), mmoBefore);
    }

    function test_ProgressionClearStillGrantsLootWithoutMmoFaucet() public {
        uint256 characterId = _createCharacter(playerA, "ProgressionRewards");
        _equipAllSlots(characterId, playerA, 2, 420_000);

        uint256 mmoBefore = token.balanceOf(playerA);

        bool won;
        for (uint64 i = 0; i < 24; i++) {
            vm.startPrank(playerA);
            bytes32 secret = keccak256(abi.encode("progression-run", i));
            uint64 nonce = uint64(420_100 + i);
            bytes32 hash = keccak256(
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
                characterId, GameTypes.ActionType.DUNGEON_RUN, hash, nonce
            );
            _rollToReveal(commitId);
            world.revealStartDungeon(commitId, secret, GameTypes.Difficulty.EASY, 2);
            _drainRun(characterId);
            vm.stopPrank();

            if (world.characterBestLevel(characterId) == 2) {
                won = true;
                break;
            }
        }

        assertTrue(won);
        assertEq(world.lootboxCredits(characterId, 3), GameConstants.EASY_LOOT_COUNT);
        assertEq(token.balanceOf(playerA), mmoBefore);
    }

    function test_LevelTwentyOneNeedsThreeClearUnitsBeforeLevelUp() public {
        uint256 characterId = _createCharacter(playerA, "ThreeClears");
        _forceLevel(characterId, 20);
        _equipAllSlots(characterId, playerA, 21, 430_000);

        assertEq(world.requiredClearsForLevel(21), 3);

        _runUntilProgressAtLeast(characterId, 21, GameTypes.Difficulty.EASY, 1, 430_100);
        assertEq(world.characterBestLevel(characterId), 20);
        assertEq(world.levelClearProgress(characterId, 21), 1);

        _runUntilProgressAtLeast(characterId, 21, GameTypes.Difficulty.EASY, 2, 430_200);
        assertEq(world.characterBestLevel(characterId), 20);
        assertEq(world.levelClearProgress(characterId, 21), 2);

        _runUntilLevel(characterId, 21, GameTypes.Difficulty.EASY, 430_300);
        assertEq(world.characterBestLevel(characterId), 21);
        assertEq(world.levelClearProgress(characterId, 21), 0);
    }

    function test_HardDifficultyGrantsTwoProgressUnitsPerSuccess() public {
        uint256 characterId = _createCharacter(playerA, "HardProgress");
        _forceLevel(characterId, 20);
        _equipAllSlots(characterId, playerA, 21, 431_000);

        _runUntilProgressAtLeast(characterId, 21, GameTypes.Difficulty.HARD, 2, 431_100);
        assertEq(world.characterBestLevel(characterId), 20);
        assertEq(world.levelClearProgress(characterId, 21), 2);
    }

    function test_FailurePenaltyAdjustsClearProgressByBand() public {
        uint256 earlyCharacter = _createCharacter(playerA, "EarlyPenalty");
        _forceLevel(earlyCharacter, 20);
        _equipAllSlots(earlyCharacter, playerA, 1, 432_000);
        _forceSetLevelClearProgress(earlyCharacter, 21, 2);

        vm.startPrank(playerA);
        token.approve(address(world), type(uint256).max);
        uint256 earlyCommit =
            _commitRun(earlyCharacter, playerA, GameTypes.Difficulty.CHALLENGER, 21, 432_100, "early-fail");
        _rollToReveal(earlyCommit);
        world.revealStartDungeon(earlyCommit, bytes32("early-fail"), GameTypes.Difficulty.CHALLENGER, 21);
        _drainRun(earlyCharacter);
        vm.stopPrank();

        assertEq(world.levelClearProgress(earlyCharacter, 21), 1);

        uint256 lateCharacter = _createCharacter(playerA, "LatePenalty");
        _forceLevel(lateCharacter, 30);
        _equipAllSlots(lateCharacter, playerA, 1, 433_000);
        _forceSetLevelClearProgress(lateCharacter, 31, 4);

        vm.startPrank(playerA);
        token.approve(address(world), type(uint256).max);
        uint256 lateCommit =
            _commitRun(lateCharacter, playerA, GameTypes.Difficulty.CHALLENGER, 31, 433_100, "late-fail");
        _rollToReveal(lateCommit);
        world.revealStartDungeon(lateCommit, bytes32("late-fail"), GameTypes.Difficulty.CHALLENGER, 31);
        _drainRun(lateCharacter);
        vm.stopPrank();

        assertEq(world.levelClearProgress(lateCharacter, 31), 2);
    }

    function _commitRun(
        uint256 characterId,
        address who,
        GameTypes.Difficulty difficulty,
        uint32 dungeonLevel,
        uint64 nonce,
        bytes32 secret
    ) internal returns (uint256 commitId) {
        bytes32 hash = keccak256(
            abi.encode(
                secret, who, GameTypes.ActionType.DUNGEON_RUN, characterId, nonce, uint8(difficulty), dungeonLevel
            )
        );
        commitId =
            world.commitAction{value: world.commitFee()}(characterId, GameTypes.ActionType.DUNGEON_RUN, hash, nonce);
    }

    function _equipAllSlots(uint256 characterId, address who, uint32 tier, uint64 seedBase) internal {
        for (uint8 slot = 0; slot < 8; slot++) {
            uint256 itemId = _forceMintItem(who, GameTypes.Slot(slot), tier, seedBase + slot);
            vm.prank(who);
            world.equipItem(characterId, itemId);
        }
    }

    function _buyOpenAndEquipPremium(uint256 characterId, address who, uint16 amount, uint64 nonce) internal {
        vm.startPrank(who);
        (uint256 cost,) = feeVault.quotePremiumPurchase(characterId, GameTypes.Difficulty.EASY, amount);
        uint32 tier = world.premiumLootboxTier(characterId, GameTypes.Difficulty.EASY);
        feeVault.buyPremiumLootboxes{value: cost}(characterId, GameTypes.Difficulty.EASY, amount);

        bytes32 secret = keccak256(abi.encode("premium-unlock", characterId, nonce, amount));
        bytes32 hash =
            keccak256(abi.encode(secret, who, GameTypes.ActionType.LOOTBOX_OPEN, characterId, nonce, tier, amount));
        uint256 commitId =
            world.commitAction{value: world.commitFee()}(characterId, GameTypes.ActionType.LOOTBOX_OPEN, hash, nonce);
        _rollToReveal(commitId);

        uint256 startId = items.nextTokenId();
        world.revealOpenLootboxes(commitId, secret, tier, amount);
        uint256 endId = items.nextTokenId();

        for (uint256 itemId = startId; itemId < endId; itemId++) {
            try world.equipItem(characterId, itemId) {} catch {}
        }
        vm.stopPrank();
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

    function _runUntilProgressAtLeast(
        uint256 characterId,
        uint32 dungeonLevel,
        GameTypes.Difficulty difficulty,
        uint8 targetProgress,
        uint64 nonceBase
    ) internal {
        for (uint64 i = 0; i < 256; i++) {
            vm.startPrank(playerA);
            if (i == 0) token.approve(address(world), type(uint256).max);
            bytes32 secret = keccak256(abi.encode("progress-run", characterId, dungeonLevel, difficulty, nonceBase + i));
            uint256 commitId = _commitRun(characterId, playerA, difficulty, dungeonLevel, nonceBase + i, secret);
            _rollToReveal(commitId);
            world.revealStartDungeon(commitId, secret, difficulty, dungeonLevel);
            _drainRun(characterId);
            vm.stopPrank();

            if (world.levelClearProgress(characterId, dungeonLevel) >= targetProgress) return;
            if (world.characterBestLevel(characterId) >= dungeonLevel) return;
        }
        fail();
    }

    function _runUntilLevel(uint256 characterId, uint32 targetLevel, GameTypes.Difficulty difficulty, uint64 nonceBase)
        internal
    {
        for (uint64 i = 0; i < 256; i++) {
            vm.startPrank(playerA);
            if (i == 0) token.approve(address(world), type(uint256).max);
            bytes32 secret = keccak256(abi.encode("level-run", characterId, targetLevel, difficulty, nonceBase + i));
            uint256 commitId = _commitRun(characterId, playerA, difficulty, targetLevel, nonceBase + i, secret);
            _rollToReveal(commitId);
            world.revealStartDungeon(commitId, secret, difficulty, targetLevel);
            _drainRun(characterId);
            vm.stopPrank();

            if (world.characterBestLevel(characterId) >= targetLevel) return;
        }
        fail();
    }
}
