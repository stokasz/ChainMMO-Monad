// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ChainMMOBase} from "../helpers/ChainMMOBase.t.sol";
import {GameConstants} from "../../src/libraries/GameConstants.sol";
import {GameErrors} from "../../src/libraries/GameErrors.sol";
import {GameTypes} from "../../src/libraries/GameTypes.sol";

contract BalanceVNextSetForgeTest is ChainMMOBase {
    address internal playerC = address(0xC0FFEE);

    function test_ForgeSetPieceRewritesSetAndConsumesCosts() public {
        uint256 characterId = _createCharacter(playerA, "ForgeMain");
        _forceLevel(characterId, 39);

        uint32 tier = 40;
        uint64 nonSetSeed = _findNonSetSeed(tier, 900_001);
        uint256 itemId = _forceMintItem(playerA, GameTypes.Slot.MAIN_HAND, tier, nonSetSeed);

        _forceGrantUpgradeStones(characterId, 10);

        vm.prank(playerA);
        world.equipItem(characterId, itemId);

        (bool beforeIsSet,) = items.itemSetInfo(itemId);
        assertFalse(beforeIsSet);

        uint8 targetSetId = 24;
        uint8 expectedStoneCost = world.forgeSetPieceStoneCost(tier);
        uint256 expectedMmoCost = world.forgeSetPieceMmoCost(tier);
        uint32 stonesBefore = world.upgradeStoneBalance(characterId);
        uint256 sinkBefore = token.balanceOf(GameConstants.MMO_SINK_ADDRESS);

        vm.startPrank(playerA);
        token.approve(address(world), type(uint256).max);
        uint64 newSeed = world.forgeSetPiece(characterId, itemId, targetSetId);
        vm.stopPrank();

        (GameTypes.Slot slotAfter, uint32 tierAfter, uint64 seedAfter) = items.decode(itemId);
        (bool isSetAfter, uint8 setIdAfter) = items.itemSetInfo(itemId);

        assertEq(uint8(slotAfter), uint8(GameTypes.Slot.MAIN_HAND));
        assertEq(tierAfter, tier);
        assertEq(seedAfter, newSeed);
        assertTrue(isSetAfter);
        assertEq(setIdAfter, targetSetId);

        assertEq(world.upgradeStoneBalance(characterId), stonesBefore - expectedStoneCost);
        assertEq(token.balanceOf(GameConstants.MMO_SINK_ADDRESS), sinkBefore + expectedMmoCost);
    }

    function test_ForgeSetPieceRevertsForInvalidBandOrGuards() public {
        uint256 characterId = _createCharacter(playerA, "ForgeGuards");
        _forceLevel(characterId, 39);

        uint32 tier = 40;
        uint64 nonSetSeed = _findNonSetSeed(tier, 901_001);
        uint256 itemId = _forceMintItem(playerA, GameTypes.Slot.OFF_HAND, tier, nonSetSeed);

        _forceGrantUpgradeStones(characterId, 2);

        vm.prank(playerA);
        vm.expectRevert(GameErrors.ItemNotEquipped.selector);
        world.forgeSetPiece(characterId, itemId, 24);

        vm.prank(playerA);
        world.equipItem(characterId, itemId);

        vm.prank(playerA);
        vm.expectRevert(GameErrors.InvalidTargetSet.selector);
        world.forgeSetPiece(characterId, itemId, 8);

        uint256 otherCharacter = _createCharacter(playerB, "ForgeOther");
        otherCharacter;

        vm.prank(playerB);
        vm.expectRevert(GameErrors.OnlyCharacterOwner.selector);
        world.forgeSetPiece(characterId, itemId, 24);

        vm.prank(playerA);
        world.rerollItemStats(characterId, itemId);

        vm.prank(playerA);
        vm.expectRevert(GameErrors.InsufficientUpgradeStones.selector);
        world.forgeSetPiece(characterId, itemId, 24);
    }

    function test_ForgeUnavailableForTierWithoutSetDomain() public {
        uint256 characterId = _createCharacter(playerA, "ForgeTierGate");
        _forceLevel(characterId, 9);

        uint256 itemId = _forceMintItem(playerA, GameTypes.Slot.CHEST, 10, 777_777);
        _forceGrantUpgradeStones(characterId, 5);

        vm.prank(playerA);
        world.equipItem(characterId, itemId);

        vm.startPrank(playerA);
        token.approve(address(world), type(uint256).max);
        vm.expectRevert(GameErrors.ForgeUnavailableForTier.selector);
        world.forgeSetPiece(characterId, itemId, 0);
        vm.stopPrank();
    }

    function test_ForgeRequiresExternalMmoFundingAndSucceedsAfterFunding() public {
        vm.deal(playerC, 1 ether);
        vm.prank(playerC);
        uint256 characterId = world.createCharacter(GameTypes.Race.HUMAN, GameTypes.Class.WARRIOR, "ForgeNoMmo");
        _forceLevel(characterId, 39);

        uint32 tier = 40;
        uint64 nonSetSeed = _findNonSetSeed(tier, 902_001);
        uint256 itemId = _forceMintItem(playerC, GameTypes.Slot.MAIN_HAND, tier, nonSetSeed);
        _forceGrantUpgradeStones(characterId, 10);

        vm.prank(playerC);
        world.equipItem(characterId, itemId);

        uint8 targetSetId = 24;
        uint256 mmoCost = world.forgeSetPieceMmoCost(tier);

        vm.startPrank(playerC);
        vm.expectRevert();
        world.forgeSetPiece(characterId, itemId, targetSetId);
        vm.stopPrank();

        token.transfer(playerC, mmoCost);

        vm.startPrank(playerC);
        token.approve(address(world), type(uint256).max);
        world.forgeSetPiece(characterId, itemId, targetSetId);
        vm.stopPrank();
    }

    function _findNonSetSeed(uint32 tier, uint64 salt) internal pure returns (uint64 seed) {
        for (uint256 i = 0; i < 30_000; i++) {
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
