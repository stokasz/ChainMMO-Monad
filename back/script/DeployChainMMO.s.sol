// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {MMOToken} from "../src/MMOToken.sol";
import {GameWorld} from "../src/GameWorld.sol";
import {FeeVault} from "../src/FeeVault.sol";
import {TradeEscrow} from "../src/TradeEscrow.sol";
import {RFQMarket} from "../src/RFQMarket.sol";

contract DeployChainMMO is Script {
    struct Deployment {
        address mmoToken;
        address gameWorld;
        address feeVault;
        address items;
        address tradeEscrow;
        address rfqMarket;
    }

    /// @notice Deploys immutable ChainMMO.com back contracts in dependency order.
    /// @dev Expects `PRIVATE_KEY` in env. Optional `FEE_DEPLOYER` overrides deployer fee recipient.
    /// @dev Set `DEPLOY_TEST_MMO=true` for dev/test stand-in token deployment.
    /// @dev Production path requires `MMO_TOKEN_ADDRESS` and never auto-deploys MMO.
    function run() external returns (Deployment memory deployment) {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(privateKey);
        address feeDeployer = vm.envOr("FEE_DEPLOYER", deployer);
        bool deployTestMmo = vm.envOr("DEPLOY_TEST_MMO", false);
        address configuredMmo = deployTestMmo ? address(0) : vm.envOr("MMO_TOKEN_ADDRESS", address(0));
        if (!deployTestMmo && configuredMmo == address(0)) {
            revert("MMO_TOKEN_ADDRESS is required when DEPLOY_TEST_MMO=false");
        }

        uint256 deployerNonce = vm.getNonce(deployer);
        uint256 feeVaultNonceOffset = deployTestMmo ? 2 : 1;
        address predictedFeeVault = vm.computeCreateAddress(deployer, deployerNonce + feeVaultNonceOffset);

        vm.startBroadcast(privateKey);

        address mmoToken = configuredMmo;
        if (deployTestMmo) {
            mmoToken = address(new MMOToken(deployer));
        } else if (mmoToken.code.length == 0) {
            revert("MMO_TOKEN_ADDRESS has no code");
        }

        GameWorld world = new GameWorld(mmoToken, predictedFeeVault, feeDeployer);
        FeeVault vault = new FeeVault(address(world), mmoToken, feeDeployer);
        TradeEscrow escrow = new TradeEscrow(address(world.items()), mmoToken, feeDeployer);
        RFQMarket rfq = new RFQMarket(address(world.items()), mmoToken, feeDeployer);

        vm.stopBroadcast();

        if (address(vault) != predictedFeeVault) revert("fee vault prediction mismatch");

        deployment = Deployment({
            mmoToken: mmoToken,
            gameWorld: address(world),
            feeVault: address(vault),
            items: address(world.items()),
            tradeEscrow: address(escrow),
            rfqMarket: address(rfq)
        });

        console2.log("MMOToken", deployment.mmoToken);
        console2.log("GameWorld", deployment.gameWorld);
        console2.log("FeeVault", deployment.feeVault);
        console2.log("Items", deployment.items);
        console2.log("TradeEscrow", deployment.tradeEscrow);
        console2.log("RFQMarket", deployment.rfqMarket);
    }
}
