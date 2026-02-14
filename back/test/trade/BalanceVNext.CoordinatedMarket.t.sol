// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ChainMMOBase} from "../helpers/ChainMMOBase.t.sol";
import {GameWorld} from "../../src/GameWorld.sol";
import {GameConstants} from "../../src/libraries/GameConstants.sol";
import {GameTypes} from "../../src/libraries/GameTypes.sol";

contract BalanceVNextCoordinatedMarketTest is ChainMMOBase {
    function test_RecommendedDeficitsAndRfqSetMaskImproveBuildPressure() public {
        uint256 makerCharacter = _createCharacter(playerA, "Maker");
        uint256 takerCharacter = _createCharacter(playerB, "Taker");
        takerCharacter;

        _forceLevel(makerCharacter, 39);
        _equipWeakNonSetKit(makerCharacter, playerA, 500_000);

        GameWorld.BuildDeficits memory deficitsBefore = world.recommendedBuildDeficits(makerCharacter, 40);
        uint8 suggestedSetIdMin = deficitsBefore.suggestedSetIdMin;
        uint8 suggestedSetIdMax = deficitsBefore.suggestedSetIdMax;
        uint256 penaltyBefore = deficitsBefore.estimatedPenaltyBps;
        assertGt(penaltyBefore, 0);
        assertGe(suggestedSetIdMax, suggestedSetIdMin);

        uint8 targetSetId = suggestedSetIdMin;
        uint64 setSeed = _findSeedForSet(40, targetSetId, 900_000);
        uint256 setItem = _forceMintItem(playerB, GameTypes.Slot.MAIN_HAND, 40, setSeed);

        (uint16 utilityBefore,,,) = world.scoreItemForTargetLevel(makerCharacter, setItem, 40);
        assertGt(utilityBefore, 0);

        vm.startPrank(playerA);
        token.approve(address(rfqMarket), type(uint256).max);
        uint256 setMask = uint256(1) << targetSetId;
        uint256 rfqId = rfqMarket.createRFQ{value: rfqMarket.createFee()}(
            GameTypes.Slot.MAIN_HAND, 30, setMask, 100 ether, uint40(block.timestamp + 1 days)
        );
        vm.stopPrank();

        vm.startPrank(playerB);
        items.approve(address(rfqMarket), setItem);
        rfqMarket.fillRFQ(rfqId, setItem);
        vm.stopPrank();

        assertEq(items.ownerOf(setItem), playerA);

        vm.prank(playerA);
        world.equipItem(makerCharacter, setItem);

        uint256 penaltyAfter = world.recommendedBuildDeficits(makerCharacter, 40).estimatedPenaltyBps;
        assertLt(penaltyAfter, penaltyBefore);
    }

    function _equipWeakNonSetKit(uint256 characterId, address owner, uint64 seedBase) internal {
        for (uint8 slot = 0; slot < 8; slot++) {
            uint64 seed = _findNonSetSeed(10, seedBase + slot * 10);
            uint256 itemId = _forceMintItem(owner, GameTypes.Slot(slot), 10, seed);
            vm.prank(owner);
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

    function _findNonSetSeed(uint32 tier, uint64 salt) internal pure returns (uint64 seed) {
        for (uint256 i = 0; i < 40_000; i++) {
            seed = uint64(uint256(keccak256(abi.encode(salt, i))));
            (bool isSet,) = _deriveSetInfo(seed, tier);
            if (!isSet) return seed;
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
}
