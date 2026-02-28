// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Script} from 'forge-std/Script.sol';

import {FfiUtils} from 'aave-v3-origin/src/deployments/contracts/utilities/FfiUtils.sol';
import {DefaultMarketInput} from 'aave-v3-origin/src/deployments/inputs/DefaultMarketInput.sol';
import {AaveV3BatchOrchestration} from 'aave-v3-origin/src/deployments/projects/aave-v3-batched/AaveV3BatchOrchestration.sol';
import {MarketReport, Roles, MarketConfig, DeployFlags} from 'aave-v3-origin/src/deployments/interfaces/IMarketReportTypes.sol';
import {WETH9} from 'aave-v3-origin/src/contracts/dependencies/weth/WETH9.sol';
import {AaveV3TestListing} from 'aave-v3-origin/tests/mocks/AaveV3TestListing.sol';
import {IAaveV3ConfigEngine} from 'aave-v3-origin/src/contracts/extensions/v3-config-engine/AaveV3ConfigEngine.sol';
import {ACLManager} from 'aave-v3-origin/src/contracts/protocol/configuration/ACLManager.sol';
import {IPoolAddressesProvider} from 'aave-v3-origin/src/contracts/interfaces/IPoolAddressesProvider.sol';

import {IReserveInterestRateStrategy} from '@link-credit/interfaces/IReserveInterestRateStrategy.sol';
import {ICreditPool} from '@link-credit/interfaces/ICreditPool.sol';
import {CreditOracle} from '@link-credit/CreditOracle.sol';
import {CreditPoolInstance} from '@link-credit/instances/CreditPoolInstance.sol';

contract DeployCreditMarket is Script, DefaultMarketInput, FfiUtils {
  function run() external {
    _detectFoundryLibrariesAndDelete();

    Roles memory roles;
    MarketConfig memory config;
    DeployFlags memory flags;
    MarketReport memory report;

    address deployer = vm.envOr('DEPLOYER_ADDRESS', msg.sender);
    (roles, config, flags, report) = _getMarketInput(deployer);

    vm.startBroadcast(deployer);

    address weth = address(new WETH9());
    config.wrappedNativeToken = weth;

    report = AaveV3BatchOrchestration.deployAaveV3(deployer, roles, config, flags, report);

    AaveV3TestListing listing = new AaveV3TestListing(
      IAaveV3ConfigEngine(report.configEngine),
      roles.poolAdmin,
      weth,
      report
    );

    ACLManager(report.aclManager).addPoolAdmin(address(listing));
    listing.execute();

    CreditOracle creditOracle = new CreditOracle(deployer);
    CreditPoolInstance creditPoolImplementation = new CreditPoolInstance(
      IPoolAddressesProvider(report.poolAddressesProvider),
      IReserveInterestRateStrategy(report.defaultInterestRateStrategy)
    );

    IPoolAddressesProvider(report.poolAddressesProvider).setPoolImpl(address(creditPoolImplementation));
    ICreditPool(report.poolProxy).setCreditOracle(address(creditOracle));
    creditOracle.setForwarder(0x15fC6ae953E024d975e77382eEeC56A9101f9F88);

    vm.stopBroadcast();

    // -- Link Credit custom contracts --
    string memory json = vm.serializeAddress('deployment', 'deployer', deployer);
    json = vm.serializeAddress('deployment', 'creditOracle', address(creditOracle));
    json = vm.serializeAddress('deployment', 'creditPoolImplementation', address(creditPoolImplementation));

    // -- Aave v3 core --
    json = vm.serializeAddress('deployment', 'poolAddressesProvider', report.poolAddressesProvider);
    json = vm.serializeAddress('deployment', 'poolProxy', report.poolProxy);
    json = vm.serializeAddress('deployment', 'poolImplementation', report.poolImplementation);
    json = vm.serializeAddress('deployment', 'poolConfiguratorProxy', report.poolConfiguratorProxy);
    json = vm.serializeAddress('deployment', 'poolConfiguratorImplementation', report.poolConfiguratorImplementation);
    json = vm.serializeAddress('deployment', 'aclManager', report.aclManager);
    json = vm.serializeAddress('deployment', 'aaveOracle', report.aaveOracle);
    json = vm.serializeAddress('deployment', 'protocolDataProvider', report.protocolDataProvider);
    json = vm.serializeAddress('deployment', 'defaultInterestRateStrategy', report.defaultInterestRateStrategy);
    json = vm.serializeAddress('deployment', 'treasury', report.treasury);
    json = vm.serializeAddress('deployment', 'emissionManager', report.emissionManager);
    json = vm.serializeAddress('deployment', 'rewardsControllerProxy', report.rewardsControllerProxy);

    // -- Test tokens & price feeds --
    json = vm.serializeAddress('deployment', 'weth', weth);
    json = vm.serializeAddress('deployment', 'wbtc', listing.WBTC_ADDRESS());
    json = vm.serializeAddress('deployment', 'usdx', listing.USDX_ADDRESS());
    json = vm.serializeAddress('deployment', 'wethPriceFeed', listing.WETH_MOCK_PRICE_FEED());
    json = vm.serializeAddress('deployment', 'wbtcPriceFeed', listing.WBTC_MOCK_PRICE_FEED());
    json = vm.serializeAddress('deployment', 'usdxPriceFeed', listing.USDX_MOCK_PRICE_FEED());

    vm.writeJson(json, 'deployed-addresses.json');
  }

  function _detectFoundryLibrariesAndDelete() internal {
    if (_librariesPathExists()) {
      _deleteLibrariesPath();
      revert('FOUNDRY_LIBRARIES was detected in .env and removed. Re-run the script.');
    }
  }
}
