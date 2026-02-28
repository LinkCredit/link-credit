// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Script, console} from 'forge-std/Script.sol';
import {IPool} from '@link-credit/interfaces/IPool.sol';

interface ITestnetERC20 {
  function mint(address account, uint256 value) external returns (bool);
  function approve(address spender, uint256 amount) external returns (bool);
}

contract SeedPool is Script {
  uint256 constant USDX_AMOUNT = 1_000_000e6; // 1,000,000 USDX (6 decimals)

  function run() external {
    string memory json = vm.readFile('deployed-addresses.json');
    address poolProxy = vm.parseJsonAddress(json, '.poolProxy');
    address usdx = vm.parseJsonAddress(json, '.usdx');

    address deployer = vm.parseJsonAddress(json, '.deployer');
    vm.startBroadcast();

    ITestnetERC20(usdx).mint(deployer, USDX_AMOUNT);
    ITestnetERC20(usdx).approve(poolProxy, USDX_AMOUNT);
    IPool(poolProxy).supply(usdx, USDX_AMOUNT, deployer, 0);
    console.log('Supplied 1,000,000 USDX to pool');

    vm.stopBroadcast();
  }
}
