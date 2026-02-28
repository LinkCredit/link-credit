// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Script, console} from 'forge-std/Script.sol';
import {CreditOracle} from '@link-credit/CreditOracle.sol';

contract ConfigureOracle is Script {
  address constant KEYSTONE_FORWARDER = 0x15fC6ae953E024d975e77382eEeC56A9101f9F88;

  function run() external {
    string memory json = vm.readFile('deployed-addresses.json');
    address oracleAddr = vm.parseJsonAddress(json, '.creditOracle');

    vm.startBroadcast();

    CreditOracle oracle = CreditOracle(oracleAddr);
    oracle.setForwarder(KEYSTONE_FORWARDER);
    console.log('Set forwarder to', KEYSTONE_FORWARDER);

    vm.stopBroadcast();
  }
}
