// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {GameTypes} from "./GameTypes.sol";
import {GameConstants} from "./GameConstants.sol";

/// @notice ChainMMO.com deterministic fantasy naming system for equipment.
/// @notice Product tagline: "MMO to be played by LLMs."
/// @dev Names are generated from seed bits so agents can reconstruct exact outputs without extra storage.
library ItemNaming {
    string private constant PREFIX_BAND_0 = "Worn|Rusty|Cracked|Tattered|Crude|Bent|Dull|Frayed";
    string private constant PREFIX_BAND_1 = "Iron|Steel|Sturdy|Hardened|Tempered|Polished|Honed|Reinforced";
    string private constant PREFIX_BAND_2 = "Enchanted|Runic|Blessed|Mystic|Imbued|Hallowed|Warded|Consecrated";
    string private constant PREFIX_BAND_3 = "Ancient|Mythic|Arcane|Eternal|Spectral|Cursed|Eldritch|Abyssal";
    string private constant PREFIX_BAND_4 =
        "Bloodforged|Stormforged|Soulwrought|Doomhewn|Voidtouched|Shadowbound|Dragonscale|Celestial";
    string private constant PREFIX_BAND_5 =
        "Cataclysmic|Transcendent|Primordial|Empyrean|Sanctified|Netherbane|Starforged|Apocalyptic";
    string private constant PREFIX_BAND_6 =
        "Worldbreaker|Godsplinter|Etherborn|Cosmosforged|Voidborn|Aeonwrought|Realmsunder|Infinitum";
    string private constant PREFIX_BAND_7 = "Omega|Eschaton|Oblivion|Epochal|Quintessent|Axiom|Singularity|Terminus";

    string private constant MATERIAL_LOW =
        "Leather|Bronze|Iron|Steel|Mithril|Adamantine|Cobalt|Thorium|Runite|Orichalcum|Chainweave|Platebone";
    string private constant MATERIAL_MID =
        "Obsidian|Dragonbone|Moonstone|Elementium|Saronite|Felsteel|Arcanite|Titanium|Bloodiron|Froststeel|Demonhide|Nethersteel";
    string private constant MATERIAL_HIGH =
        "Aetherium|Voidsteel|Soulfire|Starweave|Shadowglass|Crystalweave|Infernium|Celestium|Chronoweave|Dreamstone|Primordium|Spiritforge";
    string private constant MATERIAL_ULTRA =
        "Cosmium|Nullstone|Worldshard|Etherweave|Aeonite|Infinitium|Voidheart|Godspark|Realmshard|Epochstone|Astralweave|Quintessium";

    string private constant SLOT_HEAD =
        "Helm|Crown|Warhelm|Circlet|Coif|Visage|Diadem|Casque|Hood|Faceguard|Greathelm|Skullcap|Cover|Cowl|Headpiece|Crest";
    string private constant SLOT_SHOULDERS =
        "Pauldrons|Shoulderguards|Mantle|Spaulders|Epaulettes|Shoulderplates|Wingguards|Yoke|Amice|Mantleguard|Burden|Carapace|Shawl|Drape|Spines|Pinions";
    string private constant SLOT_CHEST =
        "Chestplate|Breastplate|Hauberk|Cuirass|Vestments|Chainmail|Brigandine|Warplate|Robes|Chestguard|Tunic|Raiment|Platebody|Harness|Aegis|Regalia";
    string private constant SLOT_LEGS =
        "Legplates|Greaves|Leggings|Cuisses|Tassets|Legguards|Chausses|Breeches|Platelegs|Kilt|Chainskirt|Trousers|Waistguard|Legwraps|Splints|Faulds";
    string private constant SLOT_FEET =
        "Boots|Sabatons|Treads|Stompguards|Striders|Footwraps|Sollerets|Warboots|Stompers|Footguards|Sandals|Walkers|Slippers|Ironshod|Trackworn|Pathfinders";
    string private constant SLOT_PRIMARY =
        "Blade|Greatsword|Warhammer|Battleaxe|Claymore|Maul|Glaive|Runeblade|Longsword|Rapier|Scythe|Warstaff|Halberd|Mace|Flail|Executioner";
    string private constant SLOT_SECONDARY =
        "Shield|Buckler|Tome|Orb|Ward|Focus|Bulwark|Talisman|Grimoire|Scepter|Defender|Aegis|Codex|Lantern|Totem|Effigy";
    string private constant SLOT_TRINKET =
        "Amulet|Ring|Charm|Pendant|Relic|Sigil|Totem|Phylactery|Medallion|Brooch|Scarab|Idol|Fetish|Locket|Seal|Insignia";

    string private constant SUFFIXES =
        "the Forgotten King|the Shattered Throne|the Lost Crusade|the Fallen Empire|the Broken Crown|the Ruined Dynasty|the Exiled Court|the Sunken Realm|the Crumbled Citadel|the Banished Prince|the Dethroned Monarch|the Forsaken Keep|the Endless Night|the Deep Dark|the Hollow Saint|the Ashen Veil|the Obsidian Eye|the Black Gate|the Void Seeker|the Shadow Weaver|the Blind Eternity|the Umbral Depths|the Whispering Dark|the Silent Abyss|the Iron Wolf|the War Prophet|the Blood Moon|the Crimson Oath|the Deathbringer|the Last Stand|the Battle Hymn|the Siege Breaker|the Conqueror|the Warlord|the Bloodied Fang|the Relentless Vanguard|the Silent Flame|the Storm Herald|the Frost Warden|the Burning Sands|the Undying Flame|the Thunder God|the Frozen Wastes|the Molten Core|the Howling Tempest|the Living Lightning|the Ember Throne|the Glacial Abyss|the Wild Hunt|the Bone Harvest|the World Tree|the Primal Beast|the Ancient Grove|the Feral Moon|the Verdant Wrath|the Serpent King|the Alpha Predator|the Feywild|the Thornwarden|the Beast Lord|the Fallen Star|the World Ender|the Old Gods|the Twin Serpents|the Celestial Dawn|the Astral Warden|the Infinite Spiral|the Cosmic Forge|the First Light|the Dying Sun|the Eternal Vigil|the Gilded Seraph|the Pit Walker|the Ghost Council|the Runed Path|the Lich King|the Grave Warden|the Soul Reaper|the Crypt Keeper|the Plague Herald|the Bone Collector|the Restless Dead|the Carrion Crown|the Nameless Lich|the Arcane Tide|the Last Dawn|the Holy Juggernaut|the Sacred Flame|the Divine Arbiter|the Radiant Throne|the Spellweaver|the Runekeeper|the Magi|the Unbound Mind|the Eldritch Truth|the Astral Rift";

    string private constant COMPOUND_FIRST =
        "Blood|Soul|Storm|Doom|Void|Shadow|Dragon|Star|Death|World|God|Aeon|Rift|Chaos|Dream|Night|Wrath|Bone|Plague|Rune|Frost|Flame|Iron|War|Dread|Fell|Nether|Moon|Sun|Ash|Crypt|Blight|Titan|Serpent|Grimm|Throne";
    string private constant COMPOUND_SECOND =
        "forged|bound|bane|wrought|hewn|born|touched|singer|warden|breaker|render|weaver|caller|sworn|walker|seeker|keeper|reaper|splinter|heart|brand|fall|fire|fury|guard|shard|storm|maw|crown|fang|song|grip|wound|mark|shade|veil";

    string private constant SET_BAND_0 =
        "Bloodfang|Nightslayer|Wildheart|Felheart|Lawbringer|Prophecy|Arcanist|Giantstalker";
    string private constant SET_BAND_1 =
        "Judgement|Netherwind|Stormrage|Dragonstalker|Nemesis|Dreadnaught|Earthshatter|Bonescythe";
    string private constant SET_BAND_2 =
        "Cryptstalker|Dreamwalker|Redemption|Frostfire|Plagueheart|Lightbringer|Thunderheart|Absolution";
    string private constant SET_BAND_3 =
        "Onslaught|Malorne|Corruptor|Desolation|Rift Stalker|Demonbane|Worldbreaker|Conqueror";
    string private constant SET_BAND_4 =
        "Sanctified|Wrathful|Cataclysm|Dreadflame|Titanguard|Soulkeeper|Starweaver|Voidwalker";
    string private constant SET_BAND_5 =
        "Eternity|Oblivion|Eschaton|Primordial|Cosmosbound|Infinitum|Apotheosis|Genesis";

    /// @notice Builds a deterministic item name from slot+tier+seed.
    /// @dev Formula:
    /// Tier 1-2: Prefix + Slot
    /// Tier 3-5: Prefix + Slot
    /// Tier 6-10: Prefix + Slot + "of Suffix"
    /// Tier 11-100: Prefix + Material + Slot + "of Suffix"
    /// Tier 101+: Compound or Band7 Prefix + Material + Slot + "of Suffix"
    function itemName(GameTypes.Slot slot, uint32 tier, uint64 seed) internal pure returns (string memory) {
        uint256 bits = uint256(seed);
        uint256 prefixIndex = bits & 0x3f;
        uint256 firstHalfIndex = bits & 0x3f;
        uint256 secondHalfIndex = (bits >> 6) & 0x3f;
        uint256 materialIndex = (bits >> 12) & 0x3f;
        uint256 slotNounIndex = (bits >> 18) & 0x0f;
        uint256 suffixIndex = (bits >> 22) & 0x7f;

        string memory slotNoun = _slotNoun(slot, slotNounIndex);
        if (tier <= 2) return string.concat(_prefixForBand(0, prefixIndex), " ", slotNoun);
        if (tier <= 5) return string.concat(_prefixForBand(1, prefixIndex), " ", slotNoun);

        string memory suffix = _suffix(suffixIndex);
        if (tier <= 10) {
            return string.concat(_prefixForBand(2, prefixIndex), " ", slotNoun, " of ", suffix);
        }

        string memory material = _materialForTier(tier, materialIndex);
        if (tier <= 20) {
            return string.concat(_prefixForBand(3, prefixIndex), " ", material, " ", slotNoun, " of ", suffix);
        }
        if (tier <= 40) {
            return string.concat(_prefixForBand(4, prefixIndex), " ", material, " ", slotNoun, " of ", suffix);
        }
        if (tier <= 60) {
            return string.concat(_prefixForBand(5, prefixIndex), " ", material, " ", slotNoun, " of ", suffix);
        }
        if (tier <= 100) {
            return string.concat(_prefixForBand(6, prefixIndex), " ", material, " ", slotNoun, " of ", suffix);
        }

        string memory highPrefix;
        if (((bits >> 63) & 1) == 1) {
            highPrefix = _pick(PREFIX_BAND_7, prefixIndex, 8);
        } else {
            highPrefix =
                string.concat(_pick(COMPOUND_FIRST, firstHalfIndex, 36), _pick(COMPOUND_SECOND, secondHalfIndex, 36));
        }
        return string.concat(highPrefix, " ", material, " ", slotNoun, " of ", suffix);
    }

    /// @notice Builds set-piece names with short highly-recognizable structure.
    /// @param slot Equipment slot.
    /// @param setId Deterministic global set id in [0, 47].
    function setItemName(GameTypes.Slot slot, uint8 setId) internal pure returns (string memory) {
        return string.concat(setName(setId), " ", _setSlotNoun(slot));
    }

    /// @notice Returns display name for a deterministic set id.
    /// @param setId Deterministic global set id in [0, 47].
    function setName(uint8 setId) internal pure returns (string memory) {
        uint8 normalized = uint8(setId % GameConstants.NUM_SETS);
        uint8 band = normalized / GameConstants.SETS_PER_BAND;
        uint8 idx = normalized % GameConstants.SETS_PER_BAND;
        if (band == 0) return _pick(SET_BAND_0, idx, GameConstants.SETS_PER_BAND);
        if (band == 1) return _pick(SET_BAND_1, idx, GameConstants.SETS_PER_BAND);
        if (band == 2) return _pick(SET_BAND_2, idx, GameConstants.SETS_PER_BAND);
        if (band == 3) return _pick(SET_BAND_3, idx, GameConstants.SETS_PER_BAND);
        if (band == 4) return _pick(SET_BAND_4, idx, GameConstants.SETS_PER_BAND);
        return _pick(SET_BAND_5, idx, GameConstants.SETS_PER_BAND);
    }

    function _prefixForBand(uint8 band, uint256 index) private pure returns (string memory) {
        if (band == 0) return _pick(PREFIX_BAND_0, index, 8);
        if (band == 1) return _pick(PREFIX_BAND_1, index, 8);
        if (band == 2) return _pick(PREFIX_BAND_2, index, 8);
        if (band == 3) return _pick(PREFIX_BAND_3, index, 8);
        if (band == 4) return _pick(PREFIX_BAND_4, index, 8);
        if (band == 5) return _pick(PREFIX_BAND_5, index, 8);
        return _pick(PREFIX_BAND_6, index, 8);
    }

    function _materialForTier(uint32 tier, uint256 index) private pure returns (string memory) {
        if (tier <= 15) return _pick(MATERIAL_LOW, index, 12);
        if (tier <= 35) return _pick(MATERIAL_MID, index, 12);
        if (tier <= 60) return _pick(MATERIAL_HIGH, index, 12);
        return _pick(MATERIAL_ULTRA, index, 12);
    }

    function _slotNoun(GameTypes.Slot slot, uint256 index) private pure returns (string memory) {
        if (slot == GameTypes.Slot.HEAD) return _pick(SLOT_HEAD, index, 16);
        if (slot == GameTypes.Slot.SHOULDERS) return _pick(SLOT_SHOULDERS, index, 16);
        if (slot == GameTypes.Slot.CHEST) return _pick(SLOT_CHEST, index, 16);
        if (slot == GameTypes.Slot.LEGS) return _pick(SLOT_LEGS, index, 16);
        if (slot == GameTypes.Slot.FEET) return _pick(SLOT_FEET, index, 16);
        if (slot == GameTypes.Slot.MAIN_HAND) return _pick(SLOT_PRIMARY, index, 16);
        if (slot == GameTypes.Slot.OFF_HAND) return _pick(SLOT_SECONDARY, index, 16);
        return _pick(SLOT_TRINKET, index, 16);
    }

    function _setSlotNoun(GameTypes.Slot slot) private pure returns (string memory) {
        if (slot == GameTypes.Slot.HEAD) return "Warhelm";
        if (slot == GameTypes.Slot.SHOULDERS) return "Pauldrons";
        if (slot == GameTypes.Slot.CHEST) return "Chestplate";
        if (slot == GameTypes.Slot.LEGS) return "Legplates";
        if (slot == GameTypes.Slot.FEET) return "Sabatons";
        if (slot == GameTypes.Slot.MAIN_HAND) return "Runeblade";
        if (slot == GameTypes.Slot.OFF_HAND) return "Bulwark";
        return "Sigil";
    }

    function _suffix(uint256 index) private pure returns (string memory) {
        return _pick(SUFFIXES, index, 96);
    }

    function _pick(string memory packed, uint256 index, uint256 count) private pure returns (string memory) {
        bytes memory data = bytes(packed);
        uint256 target = index % count;
        uint256 entry;
        uint256 start;
        for (uint256 i; i <= data.length; i++) {
            if (i == data.length || data[i] == bytes1("|")) {
                if (entry == target) {
                    return _slice(data, start, i - start);
                }
                entry++;
                start = i + 1;
            }
        }
        return "";
    }

    function _slice(bytes memory data, uint256 start, uint256 length) private pure returns (string memory) {
        bytes memory out = new bytes(length);
        for (uint256 i; i < length; i++) {
            out[i] = data[start + i];
        }
        return string(out);
    }
}
