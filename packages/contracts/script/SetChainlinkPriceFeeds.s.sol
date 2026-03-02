// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Script, console} from 'forge-std/Script.sol';
import {IAaveOracle} from 'aave-v3-origin/src/contracts/interfaces/IAaveOracle.sol';

contract SetChainlinkPriceFeeds is Script {
  // Chainlink Sepolia Price Feeds
  address constant CHAINLINK_ETH_USD = 0x694AA1769357215DE4FAC081bf1f309aDC325306;
  address constant CHAINLINK_BTC_USD = 0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43;

  function run() external {
    // Read deployed addresses from JSON
    string memory json = vm.readFile('deployed-addresses.json');

    // Try to parse addresses, provide helpful error messages
    address aaveOracle;
    address weth;
    address wbtc;

    try vm.parseJsonAddress(json, '$.aaveOracle') returns (address addr) {
      aaveOracle = addr;
    } catch {
      revert('aaveOracle not found in deployed-addresses.json. Please redeploy using DeployCreditMarket.s.sol');
    }

    try vm.parseJsonAddress(json, '$.weth') returns (address addr) {
      weth = addr;
    } catch {
      revert('weth not found in deployed-addresses.json');
    }

    try vm.parseJsonAddress(json, '$.wbtc') returns (address addr) {
      wbtc = addr;
    } catch {
      revert('wbtc not found in deployed-addresses.json');
    }

    address deployer = vm.envOr('DEPLOYER_ADDRESS', msg.sender);

    vm.startBroadcast(deployer);

    // Update price feeds to Chainlink
    address[] memory assets = new address[](2);
    address[] memory sources = new address[](2);

    assets[0] = weth;
    sources[0] = CHAINLINK_ETH_USD;

    assets[1] = wbtc;
    sources[1] = CHAINLINK_BTC_USD;

    IAaveOracle(aaveOracle).setAssetSources(assets, sources);

    vm.stopBroadcast();

    // Log updated feeds
    console.log('Updated price feeds:');
    console.log('WETH -> Chainlink ETH/USD:', CHAINLINK_ETH_USD);
    console.log('WBTC -> Chainlink BTC/USD:', CHAINLINK_BTC_USD);
  }
}
