// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ChainMMOBase} from "../helpers/ChainMMOBase.t.sol";
import {GameTypes} from "../../src/libraries/GameTypes.sol";

contract ItemGenerationTest is ChainMMOBase {
    function test_ItemNamesFollowTierFormulaAcrossRanges() public {
        uint64 seed = 0;

        uint256 tier2 = _forceMintItem(playerA, GameTypes.Slot.HEAD, 2, seed);
        uint256 tier7 = _forceMintItem(playerA, GameTypes.Slot.MAIN_HAND, 7, seed);
        uint256 tier12 = _forceMintItem(playerA, GameTypes.Slot.OFF_HAND, 12, seed);
        uint256 tier120 = _forceMintItem(playerA, GameTypes.Slot.MAIN_HAND, 120, seed);

        assertEq(items.itemName(tier2), "Worn Helm");
        assertEq(items.itemName(tier7), "Enchanted Blade of the Forgotten King");
        assertEq(items.itemName(tier12), "Nightslayer Bulwark");
        assertEq(items.itemName(tier120), "Eternity Runeblade");
    }

    function test_DerivedStatsReflectSlotIdentity() public {
        uint256 characterId = _createCharacter(playerA, "SlotIdentity");
        vm.startPrank(playerA);
        token.approve(address(feeVault), type(uint256).max);
        (uint256 cost,) = feeVault.quotePremiumPurchase(characterId, GameTypes.Difficulty.EASY, 40);
        feeVault.buyPremiumLootboxes{value: cost}(characterId, GameTypes.Difficulty.EASY, 40);

        bytes32 secret = keccak256("slot-identity-open");
        uint64 nonce = 15_002;
        bytes32 hash = keccak256(
            abi.encode(secret, playerA, GameTypes.ActionType.LOOTBOX_OPEN, characterId, nonce, uint32(2), uint16(40))
        );
        uint256 commitId =
            world.commitAction{value: world.commitFee()}(characterId, GameTypes.ActionType.LOOTBOX_OPEN, hash, nonce);
        _rollToReveal(commitId);
        world.revealOpenLootboxes(commitId, secret, 2, 40);
        vm.stopPrank();

        bool foundChest;
        bool foundMainHand;
        bool foundTrinket;
        uint256 balance = items.balanceOf(playerA);
        for (uint256 i = 0; i < balance; i++) {
            uint256 tokenId = items.tokenOfOwnerByIndex(playerA, i);
            (GameTypes.Slot slot,,) = items.decode(tokenId);
            (uint32 hp, uint32 mana, uint32 def, uint32 atkM, uint32 atkR) = items.deriveBonuses(tokenId);

            if (!foundChest && slot == GameTypes.Slot.CHEST) {
                foundChest = true;
                assertGt(hp, 0);
                assertGt(def, 0);
                assertEq(atkM, 0);
                assertEq(atkR, 0);
            }
            if (!foundMainHand && slot == GameTypes.Slot.MAIN_HAND) {
                foundMainHand = true;
                assertEq(hp, 0);
                assertEq(mana, 0);
                assertGt(atkM, 0);
                assertGt(atkR, atkM);
            }
            if (!foundTrinket && slot == GameTypes.Slot.TRINKET) {
                foundTrinket = true;
                assertEq(hp, 0);
                assertGt(mana, 0);
                assertGt(atkM, 0);
                assertGt(atkR, 0);
            }
            if (foundChest && foundMainHand && foundTrinket) break;
        }

        assertTrue(foundChest);
        assertTrue(foundMainHand);
        assertTrue(foundTrinket);
    }

    function test_ItemGenerationHasSlotAndNameGenerativity() public {
        uint256 characterId = _createCharacter(playerA, "Generativity");
        vm.startPrank(playerA);
        token.approve(address(feeVault), type(uint256).max);
        (uint256 cost,) = feeVault.quotePremiumPurchase(characterId, GameTypes.Difficulty.EASY, 80);
        feeVault.buyPremiumLootboxes{value: cost}(characterId, GameTypes.Difficulty.EASY, 80);

        bytes32 secret = keccak256("generativity-open");
        uint64 nonce = 15_100;
        bytes32 hash = keccak256(
            abi.encode(secret, playerA, GameTypes.ActionType.LOOTBOX_OPEN, characterId, nonce, uint32(2), uint16(80))
        );
        uint256 commitId =
            world.commitAction{value: world.commitFee()}(characterId, GameTypes.ActionType.LOOTBOX_OPEN, hash, nonce);
        _rollToReveal(commitId);
        world.revealOpenLootboxes(commitId, secret, 2, 80);
        vm.stopPrank();

        bool[8] memory seenSlot;
        uint256 seenSlotCount;
        uint256 balance = items.balanceOf(playerA);
        bytes32[] memory seenHashes = new bytes32[](balance);
        uint256 uniqueNames;
        for (uint256 i = 0; i < balance; i++) {
            uint256 tokenId = items.tokenOfOwnerByIndex(playerA, i);
            (GameTypes.Slot slot,,) = items.decode(tokenId);
            if (!seenSlot[uint8(slot)]) {
                seenSlot[uint8(slot)] = true;
                seenSlotCount++;
            }
            string memory name = items.itemName(tokenId);
            bytes32 nameHash = keccak256(bytes(name));
            bool known;
            for (uint256 h = 0; h < uniqueNames; h++) {
                if (seenHashes[h] == nameHash) {
                    known = true;
                    break;
                }
            }
            if (!known) seenHashes[uniqueNames++] = nameHash;
        }

        assertGe(seenSlotCount, 6);
        assertGe(uniqueNames, 20);
    }
}
