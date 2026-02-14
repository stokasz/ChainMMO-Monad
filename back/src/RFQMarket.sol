// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ReentrancyGuard} from "solady/utils/ReentrancyGuard.sol";
import {SafeTransferLib} from "solady/utils/SafeTransferLib.sol";
import {Items} from "./Items.sol";
import {GameConstants} from "./libraries/GameConstants.sol";
import {GameErrors} from "./libraries/GameErrors.sol";
import {GameTypes} from "./libraries/GameTypes.sol";
import {TokenValidation} from "./libraries/TokenValidation.sol";

/// @notice ChainMMO.com immutable quote-based item market for agents.
/// @notice Product tagline: "MMO to be played by LLMs."
/// @dev Makers escrow MMO and takers atomically deliver matching items to fill quotes.
contract RFQMarket is ReentrancyGuard {
    using SafeTransferLib for address;

    struct RFQ {
        address maker;
        uint96 mmoOffered;
        uint32 minTier;
        uint40 expiry;
        uint8 slot;
        bool active;
        bool filled;
        uint256 setMask;
    }

    Items public immutable items;
    address public immutable mmoToken;
    address public immutable deployer;

    uint256 public nextRfqId = 1;
    mapping(uint256 rfqId => RFQ rfq) public rfqs;

    event RFQCreated(
        uint256 indexed rfqId,
        address indexed maker,
        uint8 slot,
        uint32 minTier,
        uint256 setMask,
        uint96 mmoOffered,
        uint40 expiry
    );
    event RFQFilled(uint256 indexed rfqId, address indexed maker, address indexed taker, uint256 itemTokenId);
    event RFQCancelled(uint256 indexed rfqId);

    constructor(address items_, address mmoToken_, address deployer_) {
        TokenValidation.requireSupportedMmoToken(mmoToken_);
        items = Items(items_);
        mmoToken = mmoToken_;
        deployer = deployer_;
    }

    function createFee() external pure returns (uint256) {
        return GameConstants.RFQ_CREATE_FEE;
    }

    function maxTtl() external pure returns (uint40) {
        return GameConstants.RFQ_MAX_TTL;
    }

    /// @notice Creates a new RFQ and escrows maker MMO in the contract.
    /// @param slot Required item slot.
    /// @param minTier Minimum acceptable item tier.
    /// @param acceptableSetMask Bitmask of accepted set ids, 0 means any.
    /// @param mmoOffered Escrowed MMO paid to taker on fill.
    /// @param expiry Unix timestamp; must be in the future and within max ttl.
    /// @return rfqId Newly created RFQ id.
    function createRFQ(GameTypes.Slot slot, uint32 minTier, uint256 acceptableSetMask, uint96 mmoOffered, uint40 expiry)
        external
        payable
        nonReentrant
        returns (uint256 rfqId)
    {
        if (mmoOffered == 0) revert GameErrors.AmountZero();
        if (uint8(slot) > uint8(GameTypes.Slot.TRINKET)) revert GameErrors.InvalidRFQ();
        if (acceptableSetMask >> GameConstants.NUM_SETS != 0) revert GameErrors.InvalidSetMask();
        if (expiry == 0) revert GameErrors.InvalidExpiry();
        if (expiry <= block.timestamp) revert GameErrors.InvalidExpiry();
        if (expiry > block.timestamp + GameConstants.RFQ_MAX_TTL) revert GameErrors.InvalidExpiry();

        uint256 fee = GameConstants.RFQ_CREATE_FEE;
        if (msg.value < fee) revert GameErrors.InsufficientCreateFee();
        if (fee > 0) deployer.safeTransferETH(fee);
        if (msg.value > fee) msg.sender.safeTransferETH(msg.value - fee);

        rfqId = nextRfqId++;
        rfqs[rfqId] = RFQ({
            maker: msg.sender,
            mmoOffered: mmoOffered,
            minTier: minTier,
            expiry: expiry,
            slot: uint8(slot),
            active: true,
            filled: false,
            setMask: acceptableSetMask
        });

        address(mmoToken).safeTransferFrom(msg.sender, address(this), mmoOffered);
        emit RFQCreated(rfqId, msg.sender, uint8(slot), minTier, acceptableSetMask, mmoOffered, expiry);
    }

    /// @notice Fills an active RFQ by delivering a matching item to maker.
    /// @param rfqId RFQ id.
    /// @param itemTokenId Taker item token id offered to maker.
    function fillRFQ(uint256 rfqId, uint256 itemTokenId) external nonReentrant {
        RFQ storage rfq = rfqs[rfqId];
        if (!rfq.active) revert GameErrors.RFQInactive();
        if (rfq.expiry != 0 && block.timestamp > rfq.expiry) revert GameErrors.RFQExpired();
        if (items.ownerOf(itemTokenId) != msg.sender) revert GameErrors.NotItemOwner();

        (GameTypes.Slot itemSlot, uint32 tier,) = items.decode(itemTokenId);
        if (uint8(itemSlot) != rfq.slot || tier < rfq.minTier) revert GameErrors.RFQItemMismatch();

        uint256 setMask = rfq.setMask;
        if (setMask != 0) {
            (bool isSet, uint8 setId) = items.itemSetInfo(itemTokenId);
            if (!isSet) revert GameErrors.RFQItemMismatch();
            if ((setMask & (uint256(1) << setId)) == 0) revert GameErrors.RFQItemMismatch();
        }

        rfq.active = false;
        rfq.filled = true;

        uint96 payout = rfq.mmoOffered;
        address maker = rfq.maker;

        items.safeTransferFrom(msg.sender, maker, itemTokenId);
        address(mmoToken).safeTransfer(msg.sender, payout);

        emit RFQFilled(rfqId, maker, msg.sender, itemTokenId);
    }

    /// @notice Cancels an active RFQ and refunds escrowed MMO to maker.
    /// @param rfqId RFQ id.
    function cancelRFQ(uint256 rfqId) external nonReentrant {
        RFQ storage rfq = rfqs[rfqId];
        if (!rfq.active) revert GameErrors.RFQInactive();
        if (rfq.maker != msg.sender) revert GameErrors.NotRFQMaker();

        rfq.active = false;

        uint96 refund = rfq.mmoOffered;
        address(mmoToken).safeTransfer(msg.sender, refund);

        emit RFQCancelled(rfqId);
    }
}
