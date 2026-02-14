// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ChainMMOBase} from "../helpers/ChainMMOBase.t.sol";
import {GameErrors} from "../../src/libraries/GameErrors.sol";
import {GameTypes} from "../../src/libraries/GameTypes.sol";
import {RFQMarket} from "../../src/RFQMarket.sol";

contract ReentrantRFQMaker {
    RFQMarket internal immutable market;
    address internal immutable mmo;

    uint256 public targetRfq;
    bool public attempted;
    bool public reentrySucceeded;

    constructor(RFQMarket market_, address mmo_) {
        market = market_;
        mmo = mmo_;
    }

    function approveMmo(uint256 amount) external {
        (bool ok,) = mmo.call(abi.encodeWithSignature("approve(address,uint256)", address(market), amount));
        if (!ok) revert();
    }

    function create(GameTypes.Slot slot, uint32 minTier, uint256 setMask, uint96 mmoOffered, uint40 expiry)
        external
        payable
        returns (uint256 rfqId)
    {
        rfqId = market.createRFQ{value: msg.value}(slot, minTier, setMask, mmoOffered, expiry);
    }

    function setTarget(uint256 rfqId) external {
        targetRfq = rfqId;
    }

    function onERC721Received(address, address, uint256, bytes calldata) external returns (bytes4) {
        if (!attempted) {
            attempted = true;
            (bool ok,) = address(market).call(abi.encodeWithSelector(RFQMarket.cancelRFQ.selector, targetRfq));
            reentrySucceeded = ok;
        }
        return this.onERC721Received.selector;
    }
}

contract RFQMarketTest is ChainMMOBase {
    function test_CreateRevertsWithoutCreateFee() public {
        vm.startPrank(playerA);
        token.approve(address(rfqMarket), type(uint256).max);
        vm.expectRevert(GameErrors.InsufficientCreateFee.selector);
        rfqMarket.createRFQ(GameTypes.Slot.MAIN_HAND, 5, 0, 1 ether, uint40(block.timestamp + 1 days));
        vm.stopPrank();
    }

    function test_CreateRevertsWithoutExpiry() public {
        vm.startPrank(playerA);
        token.approve(address(rfqMarket), type(uint256).max);
        uint256 createFee = rfqMarket.createFee();
        vm.expectRevert(GameErrors.InvalidExpiry.selector);
        rfqMarket.createRFQ{value: createFee}(GameTypes.Slot.MAIN_HAND, 5, 0, 1 ether, 0);
        vm.stopPrank();
    }

    function test_CreateEscrowsMmo() public {
        vm.startPrank(playerA);
        token.approve(address(rfqMarket), type(uint256).max);

        uint256 deployerBefore = feeDeployer.balance;
        uint256 createFee = rfqMarket.createFee();
        uint256 marketBefore = token.balanceOf(address(rfqMarket));
        uint256 rfqId = rfqMarket.createRFQ{value: createFee}(
            GameTypes.Slot.MAIN_HAND, 5, 0, 250 ether, uint40(block.timestamp + 1 days)
        );
        vm.stopPrank();

        assertEq(feeDeployer.balance, deployerBefore + createFee);
        assertEq(token.balanceOf(address(rfqMarket)), marketBefore + 250 ether);
        (address maker, uint96 offered,,,, bool active,,) = rfqMarket.rfqs(rfqId);
        assertEq(maker, playerA);
        assertEq(offered, 250 ether);
        assertTrue(active);
    }

    function test_FillTransfersItemAndMmo() public {
        uint256 makerCharacter = _createCharacter(playerA, "Maker");
        uint256 takerCharacter = _createCharacter(playerB, "Taker");
        makerCharacter;
        takerCharacter;

        uint256 itemId = _forceMintItem(playerB, GameTypes.Slot.MAIN_HAND, 10, 1_111);

        vm.startPrank(playerA);
        token.approve(address(rfqMarket), type(uint256).max);
        uint256 rfqId = rfqMarket.createRFQ{value: rfqMarket.createFee()}(
            GameTypes.Slot.MAIN_HAND, 8, 0, 100 ether, uint40(block.timestamp + 1 days)
        );
        vm.stopPrank();

        uint256 makerBefore = token.balanceOf(playerA);
        uint256 takerBefore = token.balanceOf(playerB);

        vm.startPrank(playerB);
        items.approve(address(rfqMarket), itemId);
        rfqMarket.fillRFQ(rfqId, itemId);
        vm.stopPrank();

        assertEq(items.ownerOf(itemId), playerA);
        assertEq(token.balanceOf(playerA), makerBefore);
        assertEq(token.balanceOf(playerB), takerBefore + 100 ether);
    }

    function test_FillRevertsOnSlotTierOrSetMismatch() public {
        uint256 offHandItem = _forceMintItem(playerB, GameTypes.Slot.OFF_HAND, 12, 2_001);
        uint256 lowTierMainHand = _forceMintItem(playerB, GameTypes.Slot.MAIN_HAND, 2, 2_002);

        vm.startPrank(playerA);
        token.approve(address(rfqMarket), type(uint256).max);
        uint256 slotRfq = rfqMarket.createRFQ{value: rfqMarket.createFee()}(
            GameTypes.Slot.MAIN_HAND, 8, 0, 50 ether, uint40(block.timestamp + 1 days)
        );
        uint256 setRfq = rfqMarket.createRFQ{value: rfqMarket.createFee()}(
            GameTypes.Slot.MAIN_HAND, 1, uint256(1) << 8, 60 ether, uint40(block.timestamp + 1 days)
        );
        vm.stopPrank();

        vm.startPrank(playerB);
        items.approve(address(rfqMarket), offHandItem);
        vm.expectRevert(GameErrors.RFQItemMismatch.selector);
        rfqMarket.fillRFQ(slotRfq, offHandItem);

        items.approve(address(rfqMarket), lowTierMainHand);
        vm.expectRevert(GameErrors.RFQItemMismatch.selector);
        rfqMarket.fillRFQ(slotRfq, lowTierMainHand);

        vm.expectRevert(GameErrors.RFQItemMismatch.selector);
        rfqMarket.fillRFQ(setRfq, lowTierMainHand);
        vm.stopPrank();
    }

    function test_CancelRefundsMakerAndBlocksFill() public {
        uint256 itemId = _forceMintItem(playerB, GameTypes.Slot.MAIN_HAND, 10, 3_001);

        vm.startPrank(playerA);
        token.approve(address(rfqMarket), type(uint256).max);
        uint256 makerBefore = token.balanceOf(playerA);
        uint256 rfqId = rfqMarket.createRFQ{value: rfqMarket.createFee()}(
            GameTypes.Slot.MAIN_HAND, 8, 0, 70 ether, uint40(block.timestamp + 1 days)
        );
        rfqMarket.cancelRFQ(rfqId);
        vm.stopPrank();

        assertEq(token.balanceOf(playerA), makerBefore);

        vm.startPrank(playerB);
        items.approve(address(rfqMarket), itemId);
        vm.expectRevert(GameErrors.RFQInactive.selector);
        rfqMarket.fillRFQ(rfqId, itemId);
        vm.stopPrank();
    }

    function test_InvalidSetMaskReverts() public {
        vm.startPrank(playerA);
        token.approve(address(rfqMarket), type(uint256).max);
        uint256 createFee = rfqMarket.createFee();
        vm.expectRevert(GameErrors.InvalidSetMask.selector);
        rfqMarket.createRFQ{value: createFee}(
            GameTypes.Slot.MAIN_HAND, 1, uint256(1) << 250, 10 ether, uint40(block.timestamp + 1 days)
        );
        vm.stopPrank();
    }

    function test_CreateRevertsOnZeroAmountOrInvalidSlot() public {
        vm.startPrank(playerA);
        token.approve(address(rfqMarket), type(uint256).max);

        vm.expectRevert(GameErrors.AmountZero.selector);
        rfqMarket.createRFQ(GameTypes.Slot.MAIN_HAND, 1, 0, 0, 0);

        (bool ok, bytes memory data) = address(rfqMarket)
            .call(
                abi.encodeWithSelector(
                    rfqMarket.createRFQ.selector, uint8(99), uint32(1), uint256(0), uint96(1), uint40(0)
                )
            );
        assertFalse(ok);
        data;
        vm.stopPrank();
    }

    function test_CannotFillTwice() public {
        uint256 itemA = _forceMintItem(playerB, GameTypes.Slot.MAIN_HAND, 10, 4_001);
        uint256 itemB = _forceMintItem(playerB, GameTypes.Slot.MAIN_HAND, 10, 4_002);

        vm.startPrank(playerA);
        token.approve(address(rfqMarket), type(uint256).max);
        uint256 rfqId = rfqMarket.createRFQ{value: rfqMarket.createFee()}(
            GameTypes.Slot.MAIN_HAND, 5, 0, 40 ether, uint40(block.timestamp + 1 days)
        );
        vm.stopPrank();

        vm.startPrank(playerB);
        items.approve(address(rfqMarket), itemA);
        rfqMarket.fillRFQ(rfqId, itemA);

        items.approve(address(rfqMarket), itemB);
        vm.expectRevert(GameErrors.RFQInactive.selector);
        rfqMarket.fillRFQ(rfqId, itemB);
        vm.stopPrank();
    }

    function test_CancelGuardsForNonMakerAndFilledQuotes() public {
        uint256 itemId = _forceMintItem(playerB, GameTypes.Slot.MAIN_HAND, 12, 4_100);

        vm.startPrank(playerA);
        token.approve(address(rfqMarket), type(uint256).max);
        uint256 rfqId = rfqMarket.createRFQ{value: rfqMarket.createFee()}(
            GameTypes.Slot.MAIN_HAND, 8, 0, 55 ether, uint40(block.timestamp + 1 days)
        );
        vm.stopPrank();

        vm.prank(playerB);
        vm.expectRevert(GameErrors.NotRFQMaker.selector);
        rfqMarket.cancelRFQ(rfqId);

        vm.startPrank(playerB);
        items.approve(address(rfqMarket), itemId);
        rfqMarket.fillRFQ(rfqId, itemId);
        vm.stopPrank();

        vm.prank(playerA);
        vm.expectRevert(GameErrors.RFQInactive.selector);
        rfqMarket.cancelRFQ(rfqId);
    }

    function test_ReentrancyDuringFillFails() public {
        uint256 itemId = _forceMintItem(playerB, GameTypes.Slot.MAIN_HAND, 20, 5_001);

        ReentrantRFQMaker maker = new ReentrantRFQMaker(rfqMarket, address(token));
        token.transfer(address(maker), 500 ether);
        vm.deal(address(maker), 1 ether);
        maker.approveMmo(type(uint256).max);

        uint256 rfqId = maker.create{value: rfqMarket.createFee()}(
            GameTypes.Slot.MAIN_HAND, 1, 0, 100 ether, uint40(block.timestamp + 1 days)
        );
        maker.setTarget(rfqId);

        vm.startPrank(playerB);
        items.approve(address(rfqMarket), itemId);
        rfqMarket.fillRFQ(rfqId, itemId);
        vm.stopPrank();

        assertTrue(maker.attempted());
        assertFalse(maker.reentrySucceeded());
        assertEq(items.ownerOf(itemId), address(maker));
    }
}
