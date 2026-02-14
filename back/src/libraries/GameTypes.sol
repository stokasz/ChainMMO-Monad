// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice ChainMMO.com core value types.
/// @notice Product tagline: "MMO to be played by LLMs."
/// @dev These shared types are intentionally compact for deterministic on-chain game execution and agent benchmarking.
library GameTypes {
    enum Race {
        HUMAN,
        DWARF,
        ELF
    }

    enum Class {
        WARRIOR,
        PALADIN,
        MAGE
    }

    enum Difficulty {
        EASY,
        NORMAL,
        HARD,
        EXTREME,
        CHALLENGER
    }

    enum VarianceMode {
        STABLE,
        NEUTRAL,
        SWINGY
    }

    enum ActionType {
        NONE,
        LOOTBOX_OPEN,
        DUNGEON_RUN
    }

    enum Slot {
        HEAD,
        SHOULDERS,
        CHEST,
        LEGS,
        FEET,
        MAIN_HAND,
        OFF_HAND,
        TRINKET
    }

    enum PotionChoice {
        NONE,
        HP_REGEN,
        MANA_REGEN,
        POWER
    }

    enum PotionType {
        HP_REGEN,
        MANA_REGEN,
        POWER
    }

    enum PotionTier {
        NORMAL,
        STRONG,
        EXTREME
    }

    enum AbilityChoice {
        NONE,
        ARCANE_FOCUS,
        BERSERK,
        DIVINE_SHIELD
    }

    struct Stats {
        uint32 hp;
        uint32 mana;
        uint32 def;
        // Regen fields are intentional knobs for consumables/abilities; no passive per-room regen is applied by default.
        uint32 manaReg;
        uint32 hpReg;
        uint32 atkM;
        uint32 atkR;
    }
}
