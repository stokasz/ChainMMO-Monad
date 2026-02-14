// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC721} from "solady/tokens/ERC721.sol";
import {LibString} from "solady/utils/LibString.sol";
import {GameConstants} from "./libraries/GameConstants.sol";
import {GameTypes} from "./libraries/GameTypes.sol";
import {GameErrors} from "./libraries/GameErrors.sol";
import {ItemNaming} from "./libraries/ItemNaming.sol";

interface IGameWorldItemTransferHook {
    function onItemTransfer(uint256 itemId, address from, address to) external;
}

/// @notice ChainMMO.com tradable equipment collection.
/// @notice Product tagline: "MMO to be played by LLMs."
/// @dev Items are deterministic from token metadata so agents can reason about value without per-item mutable storage.
contract Items is ERC721 {
    using LibString for uint256;

    uint256 internal constant SLOT_SHIFT = 0;
    uint256 internal constant TIER_SHIFT = 8;
    uint256 internal constant SEED_SHIFT = 40;
    uint256 internal constant VARIANCE_SHIFT = 104;

    address public immutable gameWorld;
    uint256 public nextTokenId = 1;

    mapping(uint256 tokenId => uint256 packedData) public itemData;
    mapping(uint256 tokenId => uint32 nonce) public itemNonce;

    // Owner enumeration for `tokenOfOwnerByIndex` (O(1) instead of O(totalItems)).
    mapping(address owner => uint256[] tokenIds) internal _ownedTokens;
    mapping(uint256 tokenId => uint256 index) internal _ownedTokensIndex;

    event ItemMinted(
        uint256 indexed tokenId,
        address indexed to,
        GameTypes.Slot indexed slot,
        uint32 tier,
        uint64 seed,
        GameTypes.VarianceMode varianceMode,
        bool isSet,
        uint8 setId
    );
    event ItemSeedRewritten(uint256 indexed tokenId, uint64 oldSeed, uint64 newSeed);

    constructor(address gameWorld_) {
        gameWorld = gameWorld_;
    }

    /// @inheritdoc ERC721
    function name() public pure override returns (string memory) {
        return "ChainMMO Items";
    }

    /// @inheritdoc ERC721
    function symbol() public pure override returns (string memory) {
        return "CMMOI";
    }

    /// @inheritdoc ERC721
    function tokenURI(uint256 id) public view override returns (string memory) {
        ownerOf(id);
        return string.concat("chainmmo:item:", id.toString());
    }

    /// @notice Mints an equipment NFT with packed deterministic metadata.
    /// @param to Recipient wallet.
    /// @param slot Equipment slot.
    /// @param tier Item tier.
    /// @param seed Seed driving deterministic naming and stats.
    /// @return tokenId Newly minted token id.
    function mint(address to, GameTypes.Slot slot, uint32 tier, uint64 seed) external returns (uint256 tokenId) {
        return _mint(to, slot, tier, seed, GameTypes.VarianceMode.NEUTRAL);
    }

    /// @notice Mints an equipment NFT with explicit variance mode for stat shaping.
    /// @param to Recipient wallet.
    /// @param slot Equipment slot.
    /// @param tier Item tier.
    /// @param seed Seed driving deterministic naming and stats.
    /// @param varianceMode Loot variance mode chosen by the player.
    /// @return tokenId Newly minted token id.
    function mint(address to, GameTypes.Slot slot, uint32 tier, uint64 seed, GameTypes.VarianceMode varianceMode)
        external
        returns (uint256 tokenId)
    {
        return _mint(to, slot, tier, seed, varianceMode);
    }

    function decode(uint256 tokenId) public view returns (GameTypes.Slot slot, uint32 tier, uint64 seed) {
        uint256 packed = itemData[tokenId];
        slot = GameTypes.Slot(uint8(packed));
        tier = uint32((packed >> 8) & 0xffffffff);
        seed = uint64((packed >> 40) & type(uint64).max);
    }

    /// @notice Returns packed item fields including variance mode.
    function decodeWithVariance(uint256 tokenId)
        public
        view
        returns (GameTypes.Slot slot, uint32 tier, uint64 seed, GameTypes.VarianceMode varianceMode)
    {
        uint256 packed = itemData[tokenId];
        slot = GameTypes.Slot(uint8(packed));
        tier = uint32((packed >> 8) & 0xffffffff);
        seed = uint64((packed >> 40) & type(uint64).max);
        varianceMode = GameTypes.VarianceMode(uint8((packed >> VARIANCE_SHIFT) & 0xff));
    }

    /// @notice Returns immutable variance mode chosen at mint time.
    function varianceModeOf(uint256 tokenId) public view returns (GameTypes.VarianceMode varianceMode) {
        varianceMode = GameTypes.VarianceMode(uint8((itemData[tokenId] >> VARIANCE_SHIFT) & 0xff));
    }

    /// @notice Deterministic set metadata derived from tier+seed.
    function itemSetInfo(uint256 tokenId) public view returns (bool isSet, uint8 setId) {
        (, uint32 tier, uint64 seed) = decode(tokenId);
        return _deriveSetInfo(seed, tier);
    }

    /// @notice Returns true if token belongs to a deterministic set.
    function isSetItem(uint256 tokenId) external view returns (bool) {
        (bool isSet,) = itemSetInfo(tokenId);
        return isSet;
    }

    /// @notice Returns deterministic fantasy naming based on tier+slot+seed.
    function itemName(uint256 tokenId) external view returns (string memory) {
        (GameTypes.Slot slot, uint32 tier, uint64 seed) = decode(tokenId);
        (bool isSet, uint8 setId) = _deriveSetInfo(seed, tier);
        if (isSet) return ItemNaming.setItemName(slot, setId);
        return ItemNaming.itemName(slot, tier, seed);
    }

    /// @notice Derives item stats from packed metadata with slot identity and rarity scaling.
    /// @param tokenId Item token id.
    /// @return hp HP bonus.
    /// @return mana Mana bonus.
    /// @return def Defense bonus.
    /// @return atkM Magic attack bonus.
    /// @return atkR Physical attack bonus.
    function deriveBonuses(uint256 tokenId)
        external
        view
        returns (uint32 hp, uint32 mana, uint32 def, uint32 atkM, uint32 atkR)
    {
        (GameTypes.Slot slot, uint32 tier, uint64 seed, GameTypes.VarianceMode varianceMode) =
            decodeWithVariance(tokenId);
        uint256 nonce = itemNonce[tokenId];
        (uint32 roll, uint16 rarityBps) = _rollAndRarity(slot, tier, seed, varianceMode, nonce);

        if (slot == GameTypes.Slot.HEAD) {
            hp = _rarityScale(roll * 3, rarityBps);
            mana = _rarityScale(roll, rarityBps);
            def = _rarityScale(roll * 2, rarityBps);
            return (hp, mana, def, 0, 0);
        }
        if (slot == GameTypes.Slot.SHOULDERS) {
            hp = _rarityScale(roll * 2, rarityBps);
            def = _rarityScale(roll * 2, rarityBps);
            atkR = _rarityScale(roll, rarityBps);
            return (hp, 0, def, 0, atkR);
        }
        if (slot == GameTypes.Slot.CHEST) {
            hp = _rarityScale(roll * 5, rarityBps);
            mana = _rarityScale(roll, rarityBps);
            def = _rarityScale(roll * 3, rarityBps);
            return (hp, mana, def, 0, 0);
        }
        if (slot == GameTypes.Slot.LEGS) {
            hp = _rarityScale(roll * 4, rarityBps);
            def = _rarityScale(roll * 2, rarityBps);
            atkR = _rarityScale(roll, rarityBps);
            return (hp, 0, def, 0, atkR);
        }
        if (slot == GameTypes.Slot.FEET) {
            hp = _rarityScale(roll * 2, rarityBps);
            mana = _rarityScale(roll * 2, rarityBps);
            def = _rarityScale(roll, rarityBps);
            return (hp, mana, def, 0, 0);
        }
        if (slot == GameTypes.Slot.MAIN_HAND) {
            atkM = _rarityScale(roll * 3, rarityBps);
            atkR = _rarityScale(roll * 4, rarityBps);
            return (0, 0, 0, atkM, atkR);
        }
        if (slot == GameTypes.Slot.OFF_HAND) {
            mana = _rarityScale(roll * 2, rarityBps);
            def = _rarityScale(roll * 2, rarityBps);
            atkM = _rarityScale(roll * 2, rarityBps);
            return (0, mana, def, atkM, 0);
        }
        mana = _rarityScale(roll * 3, rarityBps);
        atkM = _rarityScale(roll * 2, rarityBps);
        atkR = _rarityScale(roll * 2, rarityBps);
    }

    /// @notice Returns the shaped deterministic roll used for stat derivation.
    function previewRoll(uint256 tokenId) external view returns (uint32 roll) {
        (GameTypes.Slot slot, uint32 tier, uint64 seed, GameTypes.VarianceMode varianceMode) =
            decodeWithVariance(tokenId);
        uint256 nonce = itemNonce[tokenId];
        (roll,) = _rollAndRarity(slot, tier, seed, varianceMode, nonce);
    }

    /// @notice Returns deterministic affix multiplier (in bps) for the current reroll nonce.
    function affixBps(uint256 tokenId) public view returns (uint16 rarityBps) {
        (GameTypes.Slot slot, uint32 tier, uint64 seed, GameTypes.VarianceMode varianceMode) =
            decodeWithVariance(tokenId);
        uint256 nonce = itemNonce[tokenId];
        (, rarityBps) = _rollAndRarity(slot, tier, seed, varianceMode, nonce);
    }

    /// @notice Returns whether an item meets the high-affix threshold used in late-game pressure.
    function isHighAffix(uint256 tokenId) external view returns (bool) {
        return affixBps(tokenId) >= GameConstants.HIGH_AFFIX_THRESHOLD_BPS;
    }

    /// @notice Consumes one reroll on an item by incrementing its nonce.
    /// @param tokenId Item token id.
    /// @return newNonce New deterministic reroll nonce.
    function consumeReroll(uint256 tokenId) external returns (uint32 newNonce) {
        if (msg.sender != gameWorld) revert GameErrors.OnlyGameWorld();
        ownerOf(tokenId);
        newNonce = ++itemNonce[tokenId];
    }

    /// @notice Rewrites immutable seed component while preserving slot/tier/variance.
    /// @dev Used by GameWorld forge flow to deterministically converge toward target set constraints.
    function rewriteSeed(uint256 tokenId, uint64 newSeed) external {
        if (msg.sender != gameWorld) revert GameErrors.OnlyGameWorld();
        ownerOf(tokenId);

        uint256 packed = itemData[tokenId];
        uint64 oldSeed = uint64((packed >> SEED_SHIFT) & type(uint64).max);
        uint256 seedMask = uint256(type(uint64).max) << SEED_SHIFT;
        packed = (packed & ~seedMask) | (uint256(newSeed) << SEED_SHIFT);
        itemData[tokenId] = packed;
        itemNonce[tokenId] = 0;

        emit ItemSeedRewritten(tokenId, oldSeed, newSeed);
    }

    function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256 tokenId) {
        uint256[] storage owned = _ownedTokens[owner];
        if (index >= owned.length) revert TokenDoesNotExist();
        return owned[index];
    }

    function _afterTokenTransfer(address from, address to, uint256 id) internal override {
        if (from != address(0)) {
            _removeTokenFromOwnerEnumeration(from, id);
        }
        if (to != address(0)) {
            _addTokenToOwnerEnumeration(to, id);
        }

        // Auto-unequip after ERC721 transfer so off-chain indexers never see stale equipment state.
        if (from != address(0) && to != address(0) && from != to) {
            IGameWorldItemTransferHook(gameWorld).onItemTransfer(id, from, to);
        }
    }

    function _addTokenToOwnerEnumeration(address to, uint256 tokenId) internal {
        _ownedTokensIndex[tokenId] = _ownedTokens[to].length;
        _ownedTokens[to].push(tokenId);
    }

    function _removeTokenFromOwnerEnumeration(address from, uint256 tokenId) internal {
        uint256[] storage owned = _ownedTokens[from];
        uint256 lastIndex = owned.length - 1;
        uint256 tokenIndex = _ownedTokensIndex[tokenId];

        if (tokenIndex != lastIndex) {
            uint256 lastTokenId = owned[lastIndex];
            owned[tokenIndex] = lastTokenId;
            _ownedTokensIndex[lastTokenId] = tokenIndex;
        }

        owned.pop();
        delete _ownedTokensIndex[tokenId];
    }

    function _mint(address to, GameTypes.Slot slot, uint32 tier, uint64 seed, GameTypes.VarianceMode varianceMode)
        internal
        returns (uint256 tokenId)
    {
        if (msg.sender != gameWorld) revert GameErrors.OnlyGameWorld();
        if (uint8(varianceMode) >= GameConstants.VARIANCE_MODE_COUNT) {
            revert GameErrors.InvalidVarianceMode();
        }

        tokenId = nextTokenId++;
        _mint(to, tokenId);

        uint256 packed = uint256(uint8(slot)) << SLOT_SHIFT;
        packed |= uint256(tier) << TIER_SHIFT;
        packed |= uint256(seed) << SEED_SHIFT;
        packed |= uint256(uint8(varianceMode)) << VARIANCE_SHIFT;
        itemData[tokenId] = packed;

        (bool isSet, uint8 setId) = _deriveSetInfo(seed, tier);
        emit ItemMinted(tokenId, to, slot, tier, seed, varianceMode, isSet, setId);
    }

    function _rarityScale(uint32 value, uint16 rarityBps) internal pure returns (uint32) {
        return uint32((uint256(value) * rarityBps) / 10_000);
    }

    function _shapeRoll(uint256 u, uint256 u2, GameTypes.VarianceMode varianceMode, uint256 entropy, uint256 range)
        internal
        pure
        returns (uint256)
    {
        if (varianceMode == GameTypes.VarianceMode.STABLE) {
            return (u + u2) / 2;
        }
        if (varianceMode == GameTypes.VarianceMode.SWINGY) {
            uint256 low = u < u2 ? u : u2;
            uint256 high = u > u2 ? u : u2;
            uint256 raw = ((uint256(keccak256(abi.encode(entropy, "swing"))) & 1) == 1) ? high : low;
            uint256 maxValue = range - 1;

            // Stretch around midpoint to produce heavier tails while preserving symmetry.
            int256 centered = int256(raw * 2) - int256(maxValue);
            centered = (centered * 3) / 2;
            int256 stretched = (centered + int256(maxValue)) / 2;
            if (stretched <= 0) return 0;
            if (stretched >= int256(maxValue)) return maxValue;
            return uint256(stretched);
        }
        return u;
    }

    function _rollAndRarity(
        GameTypes.Slot slot,
        uint32 tier,
        uint64 seed,
        GameTypes.VarianceMode varianceMode,
        uint256 nonce
    ) internal pure returns (uint32 roll, uint16 rarityBps) {
        uint256 range = uint256(tier) * 5 + 10;
        uint256 entropy = uint256(keccak256(abi.encode(seed, nonce, slot, tier)));
        uint256 u = entropy % range;
        uint256 u2 = uint256(keccak256(abi.encode(entropy, "u2"))) % range;
        roll = uint32(_shapeRoll(u, u2, varianceMode, entropy, range)) + tier * 6;

        uint256 rarityEntropy = uint256(keccak256(abi.encode(seed, nonce, "rarity")));
        rarityBps = _rarityBps(rarityEntropy);
    }

    function _rarityBps(uint256 entropy) internal pure returns (uint16) {
        uint16 rarity = uint16(entropy % 10_000);
        if (rarity < 5_000) return 10_000;
        if (rarity < 8_000) return 10_800;
        if (rarity < 9_400) return 11_800;
        if (rarity < 9_900) return 13_000;
        return 14_500;
    }

    function _deriveSetInfo(uint64 seed, uint32 tier) internal pure returns (bool isSet, uint8 setId) {
        uint8 dropChance = GameConstants.setDropChancePct(tier);
        if (dropChance == 0) return (false, 0);

        if (uint32(seed >> 32) == GameConstants.FORGED_SET_MAGIC) {
            uint8 forgedSetId = uint8(seed >> 24);
            if (forgedSetId >= GameConstants.NUM_SETS) return (false, 0);
            uint8 forgedBand = GameConstants.setBandForTier(tier);
            (uint8 minSetId, uint8 maxSetId) = GameConstants.setBandBounds(forgedBand);
            if (forgedSetId < minSetId || forgedSetId > maxSetId) return (false, 0);
            return (true, forgedSetId);
        }

        uint256 roll = uint256(keccak256(abi.encode(seed, "set"))) % 100;
        if (roll >= dropChance) return (false, 0);

        uint8 band = GameConstants.setBandForTier(tier);
        uint8 localSetId = uint8(uint256(keccak256(abi.encode(seed, uint256(tier / 10)))) % GameConstants.SETS_PER_BAND);
        setId = band * GameConstants.SETS_PER_BAND + localSetId;
        isSet = true;
    }
}
