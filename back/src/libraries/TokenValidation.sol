// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {GameErrors} from "./GameErrors.sol";

library TokenValidation {
    uint256 internal constant REQUIRED_MMO_DECIMALS = 18;

    function requireSupportedMmoToken(address token) internal view {
        if (token == address(0)) revert GameErrors.InvalidTokenAddress();
        if (token.code.length == 0) revert GameErrors.InvalidTokenContract();

        (bool ok, bytes memory result) = token.staticcall(abi.encodeWithSignature("decimals()"));
        if (!ok || result.length < 32) revert GameErrors.UnsupportedTokenDecimals();
        if (abi.decode(result, (uint256)) != REQUIRED_MMO_DECIMALS) {
            revert GameErrors.UnsupportedTokenDecimals();
        }
    }
}
