// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice ChainMMO.com custom errors.
/// @notice Product tagline: "MMO to be played by LLMs."
/// @dev Compact custom errors keep revert payloads minimal and deterministic for agent runtimes.
library GameErrors {
    error OnlyGameWorld();
    error OnlyFeeVault();
    error OnlyItems();
    error OnlyCharacterOwner();
    error OnlyDeployer();

    error MaxCharactersReached();
    error EmptyName();
    error CharacterNotFound();
    error FreeLootboxAlreadyClaimed();
    error InvalidDifficulty();
    error InvalidTokenAddress();
    error InvalidTokenContract();
    error UnsupportedTokenDecimals();
    error InvalidVarianceMode();
    error InvalidDungeonLevel();
    error InvalidActionType();
    error InvalidCommit();
    error CommitResolved();
    error InvalidReveal();
    error RevealTooEarly();
    error RevealExpired();
    error InvalidActionForReveal();
    error CommitNotExpired();
    error AmountZero();
    error BatchTooLarge();

    error InsufficientLootboxCredits();
    error GearLockedDuringRun();
    error EquipTierTooHigh();
    error ItemSlotMismatch();
    error ItemAlreadyEquipped();
    error ItemNotEquipped();
    error InsufficientUpgradeStones();
    error InsufficientEquippedSlots();
    error InvalidTargetSet();
    error ForgeUnavailableForTier();

    error RunAlreadyActive();
    error RunNotActive();
    error NotRunOwner();
    error PotionUnavailable();
    error AbilityUnavailable();
    error InsufficientMana();
    error RoomAlreadyResolved();

    error MaxBuyPerTxExceeded();
    error InsufficientEth();
    error InsufficientCommitFee();
    error InsufficientCreateFee();
    error ArrayLengthMismatch();
    error InvalidEpoch();
    error EpochAlreadyFinalized();
    error EpochNotFinalized();
    error AlreadyClaimed();
    error NotEligible();
    error TransferFailed();

    error OfferInactive();
    error NotOfferMaker();
    error OfferExpired();
    error OfferNotExpired();
    error NotItemOwner();
    error InvalidOffer();

    error InvalidExpiry();

    error RFQInactive();
    error RFQExpired();
    error NotRFQMaker();
    error InvalidRFQ();
    error RFQItemMismatch();
    error InvalidSetMask();
}
