// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Script, console} from 'forge-std/Script.sol';
import {IPool} from '@link-credit/interfaces/IPool.sol';

interface ITestnetERC20 {
  function mint(address account, uint256 value) external returns (bool);
  function approve(address spender, uint256 amount) external returns (bool);
}

contract SeedPool is Script {
  uint256 constant WBTC_AMOUNT = 100e8; // 100 WBTC (8 decimals)

  function run() external {
    string memory json = vm.readFile('deployed-addresses.json');
    address poolProxy = vm.parseJsonAddress(json, '.poolProxy');
    address wbtc = vm.parseJsonAddress(json, '.wbtc');

    address deployer = vm.parseJsonAddress(json, '.deployer');
    vm.startBroadcast();

    ITestnetERC20(wbtc).mint(deployer, WBTC_AMOUNT);
    ITestnetERC20(wbtc).approve(poolProxy, WBTC_AMOUNT);
    IPool(poolProxy).supply(wbtc, WBTC_AMOUNT, deployer, 0);
    console.log('Supplied 100 WBTC to pool');

    vm.stopBroadcast();
  }
}
