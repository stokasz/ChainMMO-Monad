// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ChainMMOBase} from "../helpers/ChainMMOBase.t.sol";
import {GameErrors} from "../../src/libraries/GameErrors.sol";

contract TradeEscrowTest is ChainMMOBase {
    function test_CreateOfferRevertsWithoutCreateFee() public {
        uint256 aCharacter = _createCharacter(playerA, "OfferFee");
        _openFreeLootbox(aCharacter, playerA, 2020);
        uint256 itemA = items.tokenOfOwnerByIndex(playerA, 0);

        uint256[] memory offered = new uint256[](1);
        uint256[] memory requested = new uint256[](1);
        offered[0] = itemA;
        requested[0] = itemA;

        vm.startPrank(playerA);
        items.approve(address(escrow), itemA);
        vm.expectRevert(GameErrors.InsufficientCreateFee.selector);
        escrow.createOffer(offered, requested, 0);
        vm.stopPrank();
    }

    function test_TradeEscrowAtomicSwapAndOptionalMmo() public {
        uint256 aCharacter = _createCharacter(playerA, "TraderA");
        uint256 bCharacter = _createCharacter(playerB, "TraderB");

        _openFreeLootbox(aCharacter, playerA, 2000);
        _openFreeLootbox(bCharacter, playerB, 2001);

        uint256 itemA = items.tokenOfOwnerByIndex(playerA, 0);
        uint256 itemB = items.tokenOfOwnerByIndex(playerB, 0);

        vm.startPrank(playerA);
        items.approve(address(escrow), itemA);
        uint256[] memory offered = new uint256[](1);
        uint256[] memory requested = new uint256[](1);
        offered[0] = itemA;
        requested[0] = itemB;
        uint256 deployerBefore = feeDeployer.balance;
        uint256 createFee = escrow.createFee();
        uint256 offerId = escrow.createOffer{value: createFee}(offered, requested, 25 ether);
        vm.stopPrank();

        assertEq(feeDeployer.balance, deployerBefore + createFee);

        uint256 aMmoBefore = token.balanceOf(playerA);
        uint256 bMmoBefore = token.balanceOf(playerB);
        vm.startPrank(playerB);
        items.approve(address(escrow), itemB);
        token.approve(address(escrow), type(uint256).max);
        escrow.fulfillOffer(offerId);
        vm.stopPrank();

        assertEq(items.ownerOf(itemA), playerB);
        assertEq(items.ownerOf(itemB), playerA);
        assertEq(token.balanceOf(playerA), aMmoBefore + 25 ether);
        assertEq(token.balanceOf(playerB), bMmoBefore - 25 ether);
    }

    function test_OnlyMakerCanCancelOffer() public {
        uint256 aCharacter = _createCharacter(playerA, "CancelMaker");
        uint256 bCharacter = _createCharacter(playerB, "CancelOther");
        _openFreeLootbox(aCharacter, playerA, 3030);
        _openFreeLootbox(bCharacter, playerB, 3031);

        uint256 itemA = items.tokenOfOwnerByIndex(playerA, 0);
        uint256 itemB = items.tokenOfOwnerByIndex(playerB, 0);
        vm.startPrank(playerA);
        items.approve(address(escrow), itemA);
        uint256[] memory offered = new uint256[](1);
        uint256[] memory requested = new uint256[](1);
        offered[0] = itemA;
        requested[0] = itemB;
        uint256 offerId = escrow.createOffer{value: escrow.createFee()}(offered, requested, 0);
        vm.stopPrank();

        vm.prank(playerB);
        vm.expectRevert(GameErrors.NotOfferMaker.selector);
        escrow.cancelOffer(offerId);

        vm.prank(playerA);
        escrow.cancelOffer(offerId);
        assertEq(items.ownerOf(itemA), playerA);

        vm.prank(playerB);
        vm.expectRevert(GameErrors.OfferInactive.selector);
        escrow.fulfillOffer(offerId);
    }

    function test_InvalidOffersRejectEmptyAndDuplicateArrays() public {
        uint256 aCharacter = _createCharacter(playerA, "InvalidOffer");
        _openFreeLootbox(aCharacter, playerA, 4040);
        uint256 itemA = items.tokenOfOwnerByIndex(playerA, 0);

        uint256[] memory empty = new uint256[](0);
        uint256[] memory one = new uint256[](1);
        one[0] = itemA;
        vm.startPrank(playerA);
        vm.expectRevert(GameErrors.InvalidOffer.selector);
        escrow.createOffer(empty, one, 0);

        vm.expectRevert(GameErrors.InvalidOffer.selector);
        escrow.createOffer(one, empty, 0);

        uint256[] memory dup = new uint256[](2);
        dup[0] = itemA;
        dup[1] = itemA;
        items.approve(address(escrow), itemA);
        vm.expectRevert(GameErrors.InvalidOffer.selector);
        escrow.createOffer(dup, one, 0);

        uint256[] memory dupRequested = new uint256[](2);
        dupRequested[0] = itemA;
        dupRequested[1] = itemA;
        vm.expectRevert(GameErrors.InvalidOffer.selector);
        escrow.createOffer(one, dupRequested, 0);
        vm.stopPrank();
    }

    function test_CannotOfferItemsYouDoNotOwn() public {
        uint256 aCharacter = _createCharacter(playerA, "OfferOwner");
        uint256 bCharacter = _createCharacter(playerB, "OfferIntruder");
        _openFreeLootbox(aCharacter, playerA, 5050);
        _openFreeLootbox(bCharacter, playerB, 5051);
        uint256 itemA = items.tokenOfOwnerByIndex(playerA, 0);
        uint256 itemB = items.tokenOfOwnerByIndex(playerB, 0);

        vm.startPrank(playerA);
        uint256[] memory offered = new uint256[](1);
        uint256[] memory requested = new uint256[](1);
        offered[0] = itemB;
        requested[0] = itemA;
        uint256 createFee = escrow.createFee();
        vm.expectRevert(GameErrors.NotItemOwner.selector);
        escrow.createOffer{value: createFee}(offered, requested, 0);
        vm.stopPrank();
    }

    function test_OfferSizeIsBounded() public {
        uint256 aCharacter = _createCharacter(playerA, "Bounded");
        _openFreeLootbox(aCharacter, playerA, 6060);
        uint256 itemA = items.tokenOfOwnerByIndex(playerA, 0);

        uint256[] memory offered = new uint256[](17);
        uint256[] memory requested = new uint256[](1);
        for (uint256 i = 0; i < 17; i++) {
            offered[i] = itemA + i;
        }
        requested[0] = itemA;

        vm.startPrank(playerA);
        items.approve(address(escrow), itemA);
        vm.expectRevert(GameErrors.BatchTooLarge.selector);
        escrow.createOffer(offered, requested, 0);
        vm.stopPrank();
    }
}
