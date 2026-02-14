// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ChainMMOBase} from "../helpers/ChainMMOBase.t.sol";
import {GameErrors} from "../../src/libraries/GameErrors.sol";
import {GameTypes} from "../../src/libraries/GameTypes.sol";

contract ItemEquipTest is ChainMMOBase {
    function test_EquipConstraintAndNoGearChangeMidRun() public {
        uint256 characterId = _createCharacter(playerA, "GearLock");
        vm.startPrank(playerA);

        token.approve(address(feeVault), type(uint256).max);
        uint32 challengerTier = world.premiumLootboxTier(characterId, GameTypes.Difficulty.CHALLENGER);
        (uint256 challengerCost,) = feeVault.quotePremiumPurchase(characterId, GameTypes.Difficulty.CHALLENGER, 1);
        feeVault.buyPremiumLootboxes{value: challengerCost}(characterId, GameTypes.Difficulty.CHALLENGER, 1);

        uint64 nonceA = 9;
        bytes32 secretA = keccak256("tier3-open");
        bytes32 hashA = keccak256(
            abi.encode(
                secretA, playerA, GameTypes.ActionType.LOOTBOX_OPEN, characterId, nonceA, challengerTier, uint16(1)
            )
        );
        uint256 commitA =
            world.commitAction{value: world.commitFee()}(characterId, GameTypes.ActionType.LOOTBOX_OPEN, hashA, nonceA);
        _rollToReveal(commitA);
        world.revealOpenLootboxes(commitA, secretA, challengerTier, 1);

        uint256 tier3Item = items.tokenOfOwnerByIndex(playerA, 0);
        vm.expectRevert(GameErrors.EquipTierTooHigh.selector);
        world.equipItem(characterId, tier3Item);

        (uint256 easyCost,) = feeVault.quotePremiumPurchase(characterId, GameTypes.Difficulty.EASY, 1);
        feeVault.buyPremiumLootboxes{value: easyCost}(characterId, GameTypes.Difficulty.EASY, 1);
        uint32 easyTier = world.premiumLootboxTier(characterId, GameTypes.Difficulty.EASY);
        uint64 nonceB = 10;
        bytes32 secretB = keccak256("tier2-open");
        bytes32 hashB = keccak256(
            abi.encode(secretB, playerA, GameTypes.ActionType.LOOTBOX_OPEN, characterId, nonceB, easyTier, uint16(1))
        );
        uint256 commitB =
            world.commitAction{value: world.commitFee()}(characterId, GameTypes.ActionType.LOOTBOX_OPEN, hashB, nonceB);
        _rollToReveal(commitB);
        world.revealOpenLootboxes(commitB, secretB, easyTier, 1);

        uint256 tier2Item = items.tokenOfOwnerByIndex(playerA, 1);
        world.equipItem(characterId, tier2Item);

        uint64 nonceRun = 11;
        bytes32 secretRun = keccak256("run-lock");
        bytes32 runHash = keccak256(
            abi.encode(
                secretRun,
                playerA,
                GameTypes.ActionType.DUNGEON_RUN,
                characterId,
                nonceRun,
                uint8(GameTypes.Difficulty.EASY),
                uint32(2)
            )
        );
        uint256 runCommit = world.commitAction{value: world.commitFee()}(
            characterId, GameTypes.ActionType.DUNGEON_RUN, runHash, nonceRun
        );
        _rollToReveal(runCommit);
        world.revealStartDungeon(runCommit, secretRun, GameTypes.Difficulty.EASY, 2);

        vm.expectRevert(GameErrors.GearLockedDuringRun.selector);
        world.equipItem(characterId, tier2Item);
        vm.stopPrank();
    }
}
