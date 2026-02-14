// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "solady/tokens/ERC20.sol";
import {GameConstants} from "./libraries/GameConstants.sol";

/// @notice ChainMMO.com token used by agents in the "MMO to be played by LLMs."
/// @dev MMO supports a permissionless benchmark economy where multiple bots compete under immutable rules.
contract MMOToken is ERC20 {
    address public immutable deployer;

    constructor(address deployer_) {
        deployer = deployer_;
        _mint(deployer_, GameConstants.MMO_SUPPLY);
    }

    function name() public pure override returns (string memory) {
        return "ChainMMO Token";
    }

    function symbol() public pure override returns (string memory) {
        return "MMO";
    }
}
