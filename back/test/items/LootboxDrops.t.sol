// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ChainMMOBase} from "../helpers/ChainMMOBase.t.sol";
import {Vm} from "forge-std/Vm.sol";
import {GameTypes} from "../../src/libraries/GameTypes.sol";

contract LootboxDropsTest is ChainMMOBase {
    function test_LootboxOpenEmitsPerItemDropEvents() public {
        uint256 characterId = _createCharacter(playerA, "DropsEvent");
        vm.startPrank(playerA);
        token.approve(address(feeVault), type(uint256).max);
        (uint256 cost,) = feeVault.quotePremiumPurchase(characterId, GameTypes.Difficulty.EASY, 6);
        feeVault.buyPremiumLootboxes{value: cost}(characterId, GameTypes.Difficulty.EASY, 6);

        bytes32 secret = keccak256("drops-event-open");
        uint64 nonce = 60_001;
        bytes32 hash = keccak256(
            abi.encode(secret, playerA, GameTypes.ActionType.LOOTBOX_OPEN, characterId, nonce, uint32(2), uint16(6))
        );
        uint256 commitId =
            world.commitAction{value: world.commitFee()}(characterId, GameTypes.ActionType.LOOTBOX_OPEN, hash, nonce);
        _rollToReveal(commitId);

        vm.recordLogs();
        world.revealOpenLootboxes(commitId, secret, 2, 6);
        vm.stopPrank();

        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 itemDropSig = keccak256("LootboxItemDropped(uint256,uint256,uint256,uint8,uint32,uint64,uint8)");
        uint256 itemDrops;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics.length > 0 && logs[i].topics[0] == itemDropSig) {
                itemDrops++;
            }
        }
        assertEq(itemDrops, 6);
    }

    function test_LootboxOpenCreditsTieredPotions() public {
        uint256 characterId = _createCharacter(playerA, "PotionDropper");
        vm.startPrank(playerA);
        token.approve(address(feeVault), type(uint256).max);
        (uint256 cost,) = feeVault.quotePremiumPurchase(characterId, GameTypes.Difficulty.EASY, 120);
        feeVault.buyPremiumLootboxes{value: cost}(characterId, GameTypes.Difficulty.EASY, 120);

        bytes32 secret = keccak256("potion-drop-open");
        uint64 nonce = 60_100;
        bytes32 hash = keccak256(
            abi.encode(secret, playerA, GameTypes.ActionType.LOOTBOX_OPEN, characterId, nonce, uint32(2), uint16(120))
        );
        uint256 commitId =
            world.commitAction{value: world.commitFee()}(characterId, GameTypes.ActionType.LOOTBOX_OPEN, hash, nonce);
        _rollToReveal(commitId);
        world.revealOpenLootboxes(commitId, secret, 2, 120);
        vm.stopPrank();

        uint256 totalPotions;
        bool hasHp;
        bool hasMana;
        bool hasPower;
        for (uint8 potionType = 0; potionType < 3; potionType++) {
            uint256 subtotal;
            for (uint8 potionTier = 0; potionTier < 3; potionTier++) {
                subtotal += world.potionBalance(
                    characterId, GameTypes.PotionType(potionType), GameTypes.PotionTier(potionTier)
                );
            }
            if (potionType == uint8(GameTypes.PotionType.HP_REGEN) && subtotal > 0) hasHp = true;
            if (potionType == uint8(GameTypes.PotionType.MANA_REGEN) && subtotal > 0) hasMana = true;
            if (potionType == uint8(GameTypes.PotionType.POWER) && subtotal > 0) hasPower = true;
            totalPotions += subtotal;
        }

        assertGt(totalPotions, 0);
        assertTrue(hasHp || hasMana || hasPower);
    }
}
