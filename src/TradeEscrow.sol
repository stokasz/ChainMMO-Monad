// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ReentrancyGuard} from "solady/utils/ReentrancyGuard.sol";
import {SafeTransferLib} from "solady/utils/SafeTransferLib.sol";
import {GameConstants} from "./libraries/GameConstants.sol";
import {GameErrors} from "./libraries/GameErrors.sol";
import {TokenValidation} from "./libraries/TokenValidation.sol";
import {Items} from "./Items.sol";

/// @notice ChainMMO.com immutable peer-to-peer item trade escrow.
/// @notice Product tagline: "MMO to be played by LLMs."
/// @dev Offers are intentionally direct between agents with optional MMO side payment and no protocol fee.
contract TradeEscrow is ReentrancyGuard {
    using SafeTransferLib for address;

    uint256 internal constant MAX_ITEMS_PER_SIDE = 16;

    struct Offer {
        address maker;
        uint96 requestedMmo;
        uint40 expiry;
        bool active;
    }

    Items public immutable items;
    address public immutable mmoToken;
    address public immutable deployer;

    uint256 public nextOfferId = 1;
    mapping(uint256 offerId => Offer offer) public offers;
    mapping(uint256 offerId => uint256[] offeredItems) internal _offeredItems;
    mapping(uint256 offerId => uint256[] requestedItems) internal _requestedItems;

    event OfferCreated(
        uint256 indexed offerId,
        address indexed maker,
        uint96 requestedMmo,
        uint256[] offeredItemIds,
        uint256[] requestedItemIds
    );
    event OfferCancelled(uint256 indexed offerId, address indexed maker);
    event OfferFulfilled(uint256 indexed offerId, address indexed maker, address indexed taker);

    constructor(address items_, address mmoToken_, address deployer_) {
        TokenValidation.requireSupportedMmoToken(mmoToken_);
        items = Items(items_);
        mmoToken = mmoToken_;
        deployer = deployer_;
    }

    function createFee() external pure returns (uint256) {
        return GameConstants.TRADE_OFFER_CREATE_FEE;
    }

    function offerTtl() external pure returns (uint40) {
        return GameConstants.TRADE_OFFER_TTL;
    }

    /// @notice Creates a new escrow offer.
    /// @param offeredItemIds Items moved into escrow by maker.
    /// @param requestedItemIds Items expected from taker.
    /// @param requestedMmo Optional MMO payment expected from taker.
    /// @return offerId Offer identifier.
    function createOffer(uint256[] calldata offeredItemIds, uint256[] calldata requestedItemIds, uint96 requestedMmo)
        external
        payable
        nonReentrant
        returns (uint256 offerId)
    {
        if (offeredItemIds.length == 0 || requestedItemIds.length == 0) revert GameErrors.InvalidOffer();
        if (offeredItemIds.length > MAX_ITEMS_PER_SIDE || requestedItemIds.length > MAX_ITEMS_PER_SIDE) {
            revert GameErrors.BatchTooLarge();
        }
        _ensureUnique(offeredItemIds);
        _ensureUnique(requestedItemIds);

        uint256 fee = GameConstants.TRADE_OFFER_CREATE_FEE;
        if (msg.value < fee) revert GameErrors.InsufficientCreateFee();
        if (fee > 0) deployer.safeTransferETH(fee);
        if (msg.value > fee) msg.sender.safeTransferETH(msg.value - fee);

        offerId = nextOfferId++;
        offers[offerId] = Offer({
            maker: msg.sender,
            requestedMmo: requestedMmo,
            expiry: uint40(block.timestamp + GameConstants.TRADE_OFFER_TTL),
            active: true
        });

        for (uint256 i = 0; i < offeredItemIds.length; i++) {
            uint256 tokenId = offeredItemIds[i];
            if (items.ownerOf(tokenId) != msg.sender) revert GameErrors.NotItemOwner();
            _offeredItems[offerId].push(tokenId);
            items.transferFrom(msg.sender, address(this), tokenId);
        }

        for (uint256 i = 0; i < requestedItemIds.length; i++) {
            _requestedItems[offerId].push(requestedItemIds[i]);
        }

        emit OfferCreated(offerId, msg.sender, requestedMmo, offeredItemIds, requestedItemIds);
    }

    function cancelOffer(uint256 offerId) external nonReentrant {
        Offer storage offer = offers[offerId];
        if (!offer.active) revert GameErrors.OfferInactive();
        if (offer.maker != msg.sender) revert GameErrors.NotOfferMaker();

        offer.active = false;
        uint256[] storage offered = _offeredItems[offerId];
        for (uint256 i = 0; i < offered.length; i++) {
            items.transferFrom(address(this), msg.sender, offered[i]);
        }
        delete _offeredItems[offerId];
        delete _requestedItems[offerId];

        emit OfferCancelled(offerId, msg.sender);
    }

    function fulfillOffer(uint256 offerId) external nonReentrant {
        Offer storage offer = offers[offerId];
        if (!offer.active) revert GameErrors.OfferInactive();
        if (block.timestamp > offer.expiry) revert GameErrors.OfferExpired();
        offer.active = false;

        uint256[] storage requested = _requestedItems[offerId];
        for (uint256 i = 0; i < requested.length; i++) {
            uint256 tokenId = requested[i];
            if (items.ownerOf(tokenId) != msg.sender) revert GameErrors.NotItemOwner();
            items.transferFrom(msg.sender, offer.maker, tokenId);
        }

        uint256[] storage offered = _offeredItems[offerId];
        for (uint256 i = 0; i < offered.length; i++) {
            items.transferFrom(address(this), msg.sender, offered[i]);
        }
        delete _offeredItems[offerId];
        delete _requestedItems[offerId];

        if (offer.requestedMmo > 0) {
            mmoToken.safeTransferFrom(msg.sender, offer.maker, offer.requestedMmo);
        }

        emit OfferFulfilled(offerId, offer.maker, msg.sender);
    }

    function cancelExpiredOffer(uint256 offerId) external nonReentrant {
        Offer storage offer = offers[offerId];
        if (!offer.active) revert GameErrors.OfferInactive();
        if (block.timestamp <= offer.expiry) revert GameErrors.OfferNotExpired();

        offer.active = false;
        address maker = offer.maker;

        uint256[] storage offered = _offeredItems[offerId];
        for (uint256 i = 0; i < offered.length; i++) {
            items.transferFrom(address(this), maker, offered[i]);
        }
        delete _offeredItems[offerId];
        delete _requestedItems[offerId];

        emit OfferCancelled(offerId, maker);
    }

    function offeredItems(uint256 offerId) external view returns (uint256[] memory) {
        return _offeredItems[offerId];
    }

    function requestedItems(uint256 offerId) external view returns (uint256[] memory) {
        return _requestedItems[offerId];
    }

    function _ensureUnique(uint256[] calldata itemIds) internal pure {
        for (uint256 i = 0; i < itemIds.length; i++) {
            for (uint256 j = i + 1; j < itemIds.length; j++) {
                if (itemIds[i] == itemIds[j]) revert GameErrors.InvalidOffer();
            }
        }
    }
}
