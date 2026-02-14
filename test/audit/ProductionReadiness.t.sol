// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Vm} from "forge-std/Vm.sol";
import {ChainMMOBase} from "../helpers/ChainMMOBase.t.sol";
import {GameConstants} from "../../src/libraries/GameConstants.sol";
import {GameErrors} from "../../src/libraries/GameErrors.sol";
import {GameTypes} from "../../src/libraries/GameTypes.sol";

contract ProductionReadinessTest is ChainMMOBase {
    bytes32 internal constant ROOM_RESOLVED_SIG =
        keccak256("DungeonRoomResolved(uint256,uint8,bool,bool,uint32,uint32)");
    bytes32 internal constant DUNGEON_FINISHED_SIG = keccak256("DungeonFinished(uint256,uint32,bool,uint8,uint8)");

    struct RunOutcome {
        bool success;
        bool sawBoss;
        uint8 roomsCleared;
        uint8 roomCount;
    }

    function test_Audit_DungeonProgression_Level2Then3_FightsBosses_NoBreaks() public {
        uint256 characterId = _createCharacter(playerA, "AuditProgression");
        _equipStarterKit(characterId, playerA, 2, 70_000);

        uint64 nonce = 800_000;
        for (uint32 targetLevel = 2; targetLevel <= 3; targetLevel++) {
            bool reached;
            bool bossSeenOnWinningRun;

            for (uint256 attempt = 0; attempt < 8; attempt++) {
                bytes32 secret = keccak256(abi.encode("audit-progress", targetLevel, attempt));
                RunOutcome memory outcome = _runDungeon(
                    characterId,
                    playerA,
                    GameTypes.Difficulty.EASY,
                    targetLevel,
                    GameTypes.VarianceMode.NEUTRAL,
                    nonce,
                    secret
                );
                nonce++;

                if (outcome.success && world.characterBestLevel(characterId) >= targetLevel) {
                    reached = true;
                    bossSeenOnWinningRun = outcome.sawBoss;
                    break;
                }
            }

            assertTrue(reached);
            assertTrue(bossSeenOnWinningRun);
        }

        assertEq(world.characterBestLevel(characterId), 3);
    }

    function test_Audit_RarityBucketsAndDerivedStatsAlign() public {
        uint256 samples = 2000;
        uint256[5] memory buckets;

        for (uint256 i = 0; i < samples; i++) {
            uint64 seed = uint64(uint256(keccak256(abi.encode("rarity-audit", i))));
            uint256 itemId = _forceMintItem(playerA, GameTypes.Slot.MAIN_HAND, 30, seed);

            uint32 roll = items.previewRoll(itemId);
            (, uint16 rarityBps) =
                _rollAndRarityForAudit(GameTypes.Slot.MAIN_HAND, 30, seed, 0, GameTypes.VarianceMode.NEUTRAL);
            (,,, uint32 atkM, uint32 atkR) = items.deriveBonuses(itemId);

            uint32 expectedAtkM = uint32((uint256(roll) * 3 * rarityBps) / GameConstants.BPS);
            uint32 expectedAtkR = uint32((uint256(roll) * 4 * rarityBps) / GameConstants.BPS);
            assertEq(atkM, expectedAtkM);
            assertEq(atkR, expectedAtkR);

            buckets[_rarityBucket(rarityBps)]++;
        }

        assertApproxEqAbs(buckets[0], 1000, 140);
        assertApproxEqAbs(buckets[1], 600, 130);
        assertApproxEqAbs(buckets[2], 280, 100);
        assertApproxEqAbs(buckets[3], 100, 65);
        assertApproxEqAbs(buckets[4], 20, 25);

        assertGt(buckets[4], 0);
    }

    function test_Audit_ItemDropsAmountSlotTierAndSetRules() public {
        uint256 characterId = _createCharacter(playerA, "AuditDrops");

        vm.startPrank(playerA);
        token.approve(address(feeVault), type(uint256).max);
        (uint256 cost,) = feeVault.quotePremiumPurchase(characterId, GameTypes.Difficulty.EASY, 40);
        feeVault.buyPremiumLootboxes{value: cost}(characterId, GameTypes.Difficulty.EASY, 40);

        uint64 nonce = 810_001;
        bytes32 secret = keccak256("audit-drop-open");
        bytes32 commitHash = keccak256(
            abi.encode(
                secret,
                playerA,
                GameTypes.ActionType.LOOTBOX_OPEN,
                characterId,
                nonce,
                uint32(2),
                uint16(40),
                uint8(GameTypes.VarianceMode.STABLE)
            )
        );

        uint256 commitId = world.commitActionWithVariance{value: world.commitFee()}(
            characterId, GameTypes.ActionType.LOOTBOX_OPEN, commitHash, nonce, GameTypes.VarianceMode.STABLE
        );

        _rollToReveal(commitId);

        uint256 startId = items.nextTokenId();
        world.revealOpenLootboxes(commitId, secret, 2, 40, GameTypes.VarianceMode.STABLE);
        uint256 endId = items.nextTokenId();
        vm.stopPrank();

        assertEq(endId - startId, 40);
        for (uint256 tokenId = startId; tokenId < endId; tokenId++) {
            (GameTypes.Slot slot, uint32 tier,) = items.decode(tokenId);
            assertLe(uint8(slot), uint8(GameTypes.Slot.TRINKET));
            assertEq(tier, 2);
            assertEq(uint8(items.varianceModeOf(tokenId)), uint8(GameTypes.VarianceMode.STABLE));

            (bool isSet,) = items.itemSetInfo(tokenId);
            assertFalse(isSet);
        }
    }

    function test_Audit_RFQ_SetMaskHappyPath_ExpiryAndCancel() public {
        uint32 tier = 20;
        uint8 targetSetId = 8;
        uint64 seed = _findSeedForSet(tier, targetSetId, 901_001);
        uint256 setItem = _forceMintItem(playerB, GameTypes.Slot.MAIN_HAND, tier, seed);

        vm.startPrank(playerA);
        token.approve(address(rfqMarket), type(uint256).max);
        uint256 rfqId = rfqMarket.createRFQ{value: rfqMarket.createFee()}(
            GameTypes.Slot.MAIN_HAND, 20, uint256(1) << targetSetId, uint96(150 ether), uint40(block.timestamp + 1 days)
        );
        vm.stopPrank();

        vm.startPrank(playerB);
        items.approve(address(rfqMarket), setItem);
        uint256 bBefore = token.balanceOf(playerB);
        rfqMarket.fillRFQ(rfqId, setItem);
        vm.stopPrank();

        assertEq(items.ownerOf(setItem), playerA);
        assertEq(token.balanceOf(playerB), bBefore + 150 ether);

        vm.startPrank(playerA);
        uint256 expiringRfq = rfqMarket.createRFQ{value: rfqMarket.createFee()}(
            GameTypes.Slot.MAIN_HAND, 1, 0, uint96(50 ether), uint40(block.timestamp + 1)
        );
        vm.stopPrank();

        vm.warp(block.timestamp + 2);

        uint256 otherItem = _forceMintItem(playerB, GameTypes.Slot.MAIN_HAND, 5, 902_001);
        vm.startPrank(playerB);
        items.approve(address(rfqMarket), otherItem);
        vm.expectRevert(GameErrors.RFQExpired.selector);
        rfqMarket.fillRFQ(expiringRfq, otherItem);
        vm.stopPrank();

        uint256 makerBefore = token.balanceOf(playerA);
        vm.prank(playerA);
        rfqMarket.cancelRFQ(expiringRfq);
        assertEq(token.balanceOf(playerA), makerBefore + 50 ether);
    }

    function test_Audit_VarianceBoundLootboxCreditsEnforceOpenMode() public {
        uint256 characterId = _createCharacter(playerA, "AuditVarianceBound");
        _equipStarterKit(characterId, playerA, 2, 75_000);

        uint64 runNonce = 820_001;
        bytes32 runSecret = keccak256("audit-run-stable");

        bool succeeded;
        for (uint256 i = 0; i < 8; i++) {
            RunOutcome memory outcome = _runDungeon(
                characterId,
                playerA,
                GameTypes.Difficulty.EASY,
                2,
                GameTypes.VarianceMode.STABLE,
                runNonce + uint64(i),
                keccak256(abi.encode(runSecret, i))
            );
            if (outcome.success && world.characterBestLevel(characterId) >= 2) {
                succeeded = true;
                break;
            }
        }
        assertTrue(succeeded);

        assertEq(world.lootboxCredits(characterId, 3), 1);
        assertEq(world.lootboxBoundCredits(characterId, 3, GameTypes.VarianceMode.STABLE), 1);
        assertEq(world.lootboxBoundCredits(characterId, 3, GameTypes.VarianceMode.SWINGY), 0);

        vm.startPrank(playerA);

        uint64 badNonce = 830_001;
        bytes32 badSecret = keccak256("audit-open-swingy");
        bytes32 badHash = keccak256(
            abi.encode(
                badSecret,
                playerA,
                GameTypes.ActionType.LOOTBOX_OPEN,
                characterId,
                badNonce,
                uint32(3),
                uint16(1),
                uint8(GameTypes.VarianceMode.SWINGY)
            )
        );
        uint256 badCommitId = world.commitActionWithVariance{value: world.commitFee()}(
            characterId, GameTypes.ActionType.LOOTBOX_OPEN, badHash, badNonce, GameTypes.VarianceMode.SWINGY
        );
        _rollToReveal(badCommitId);

        vm.expectRevert(GameErrors.InsufficientLootboxCredits.selector);
        world.revealOpenLootboxes(badCommitId, badSecret, 3, 1, GameTypes.VarianceMode.SWINGY);

        uint64 okNonce = 830_002;
        bytes32 okSecret = keccak256("audit-open-stable");
        bytes32 okHash = keccak256(
            abi.encode(
                okSecret,
                playerA,
                GameTypes.ActionType.LOOTBOX_OPEN,
                characterId,
                okNonce,
                uint32(3),
                uint16(1),
                uint8(GameTypes.VarianceMode.STABLE)
            )
        );
        uint256 okCommitId = world.commitActionWithVariance{value: world.commitFee()}(
            characterId, GameTypes.ActionType.LOOTBOX_OPEN, okHash, okNonce, GameTypes.VarianceMode.STABLE
        );
        _rollToReveal(okCommitId);

        world.revealOpenLootboxes(okCommitId, okSecret, 3, 1, GameTypes.VarianceMode.STABLE);
        vm.stopPrank();

        assertEq(world.lootboxCredits(characterId, 3), 0);
        assertEq(world.lootboxBoundCredits(characterId, 3, GameTypes.VarianceMode.STABLE), 0);
    }

    function _runDungeon(
        uint256 characterId,
        address who,
        GameTypes.Difficulty difficulty,
        uint32 dungeonLevel,
        GameTypes.VarianceMode varianceMode,
        uint64 nonce,
        bytes32 secret
    ) internal returns (RunOutcome memory outcome) {
        vm.startPrank(who);

        if (dungeonLevel > 10) {
            token.approve(address(world), type(uint256).max);
        }

        bytes32 commitHash = keccak256(
            abi.encode(
                secret,
                who,
                GameTypes.ActionType.DUNGEON_RUN,
                characterId,
                nonce,
                uint8(difficulty),
                dungeonLevel,
                uint8(varianceMode)
            )
        );

        uint256 commitId = world.commitActionWithVariance{value: world.commitFee()}(
            characterId, GameTypes.ActionType.DUNGEON_RUN, commitHash, nonce, varianceMode
        );

        _rollToReveal(commitId);
        world.revealStartDungeon(commitId, secret, difficulty, dungeonLevel, varianceMode);

        vm.recordLogs();
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
                uint32 activeDungeonLevel,
                GameTypes.Difficulty activeDifficulty
            ) = world.getRunState(characterId);

            roomCount;
            roomsCleared;
            hp;
            mana;
            hpPotionCharges;
            manaPotionCharges;
            powerPotionCharges;
            activeDungeonLevel;
            activeDifficulty;

            if (!active) break;
            world.resolveNextRoom(characterId, GameTypes.PotionChoice.NONE, GameTypes.AbilityChoice.NONE);
        }

        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics.length == 0) continue;

            if (logs[i].topics[0] == ROOM_RESOLVED_SIG) {
                (bool boss, bool successRoom, uint32 hpAfter, uint32 manaAfter) =
                    abi.decode(logs[i].data, (bool, bool, uint32, uint32));
                successRoom;
                hpAfter;
                manaAfter;
                if (boss) outcome.sawBoss = true;
            }

            if (logs[i].topics[0] == DUNGEON_FINISHED_SIG) {
                (bool success, uint8 roomsCleared, uint8 roomCount) = abi.decode(logs[i].data, (bool, uint8, uint8));
                outcome.success = success;
                outcome.roomsCleared = roomsCleared;
                outcome.roomCount = roomCount;
            }
        }

        vm.stopPrank();
    }

    function _equipStarterKit(uint256 characterId, address who, uint32 tier, uint64 seedBase) internal {
        _forceLevel(characterId, tier - 1);
        for (uint8 slot = 0; slot < 8; slot++) {
            uint256 itemId = _forceMintItem(who, GameTypes.Slot(slot), tier, seedBase + slot);
            vm.prank(who);
            world.equipItem(characterId, itemId);
        }
    }

    function _findSeedForSet(uint32 tier, uint8 targetSetId, uint64 salt) internal pure returns (uint64 seed) {
        for (uint256 i = 0; i < 40_000; i++) {
            seed = uint64(uint256(keccak256(abi.encode(salt, i))));
            (bool isSet, uint8 setId) = _deriveSetInfo(seed, tier);
            if (isSet && setId == targetSetId) return seed;
        }
        revert();
    }

    function _deriveSetInfo(uint64 seed, uint32 tier) internal pure returns (bool isSet, uint8 setId) {
        uint8 dropChance = GameConstants.setDropChancePct(tier);
        if (dropChance == 0) return (false, 0);

        uint256 dropRoll = uint256(keccak256(abi.encode(seed, "set"))) % 100;
        if (dropRoll >= dropChance) return (false, 0);

        uint8 band = GameConstants.setBandForTier(tier);
        uint8 localSetId = uint8(uint256(keccak256(abi.encode(seed, uint256(tier / 10)))) % GameConstants.SETS_PER_BAND);

        return (true, band * GameConstants.SETS_PER_BAND + localSetId);
    }

    function _rollAndRarityForAudit(
        GameTypes.Slot slot,
        uint32 tier,
        uint64 seed,
        uint32 nonce,
        GameTypes.VarianceMode varianceMode
    ) internal pure returns (uint32 roll, uint16 rarityBps) {
        uint256 range = uint256(tier) * 5 + 10;
        uint256 entropy = uint256(keccak256(abi.encode(seed, uint256(nonce), slot, tier)));
        uint256 u = entropy % range;
        uint256 u2 = uint256(keccak256(abi.encode(entropy, "u2"))) % range;

        if (varianceMode == GameTypes.VarianceMode.STABLE) {
            roll = uint32((u + u2) / 2) + tier * 6;
        } else if (varianceMode == GameTypes.VarianceMode.SWINGY) {
            uint256 low = u < u2 ? u : u2;
            uint256 high = u > u2 ? u : u2;
            uint256 raw = ((uint256(keccak256(abi.encode(entropy, "swing"))) & 1) == 1) ? high : low;
            uint256 maxValue = range - 1;
            int256 centered = int256(raw * 2) - int256(maxValue);
            centered = (centered * 3) / 2;
            int256 stretched = (centered + int256(maxValue)) / 2;
            if (stretched <= 0) roll = tier * 6;
            else if (stretched >= int256(maxValue)) roll = uint32(maxValue) + tier * 6;
            else roll = uint32(uint256(stretched)) + tier * 6;
        } else {
            roll = uint32(u) + tier * 6;
        }

        uint16 rarity = uint16(uint256(keccak256(abi.encode(seed, uint256(nonce), "rarity"))) % 10_000);
        if (rarity < 5_000) rarityBps = 10_000;
        else if (rarity < 8_000) rarityBps = 10_800;
        else if (rarity < 9_400) rarityBps = 11_800;
        else if (rarity < 9_900) rarityBps = 13_000;
        else rarityBps = 14_500;
    }

    function _rarityBucket(uint16 rarityBps) internal pure returns (uint8) {
        if (rarityBps == 10_000) return 0;
        if (rarityBps == 10_800) return 1;
        if (rarityBps == 11_800) return 2;
        if (rarityBps == 13_000) return 3;
        return 4;
    }
}
