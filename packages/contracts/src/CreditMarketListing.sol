// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {AaveV3Payload} from 'aave-v3-origin/src/contracts/extensions/v3-config-engine/AaveV3Payload.sol';
import {IAaveV3ConfigEngine as IEngine} from 'aave-v3-origin/src/contracts/extensions/v3-config-engine/IAaveV3ConfigEngine.sol';
import {EngineFlags} from 'aave-v3-origin/src/contracts/extensions/v3-config-engine/EngineFlags.sol';
import {TestnetERC20} from 'aave-v3-origin/src/contracts/mocks/testnet-helpers/TestnetERC20.sol';
import {MockAggregator} from 'aave-v3-origin/src/contracts/mocks/oracle/CLAggregators/MockAggregator.sol';
import {ACLManager} from 'aave-v3-origin/src/contracts/protocol/configuration/ACLManager.sol';
import {MarketReport} from 'aave-v3-origin/src/deployments/interfaces/IMarketReportTypes.sol';
import {IPoolConfigurator, ConfiguratorInputTypes} from 'aave-v3-origin/src/contracts/interfaces/IPoolConfigurator.sol';

/**
 * @title CreditMarketListing
 * @notice Custom asset listing configuration for Link Credit market with 50% base LTV
 * @dev Based on AaveV3TestListing but with modified LTV parameters
 */
contract CreditMarketListing is AaveV3Payload {
  bytes32 public constant POOL_ADMIN_ROLE_ID =
    0x12ad05bde78c5ab75238ce885307f96ecd482bb402ef831f99e7018a0f169b7b;

  address public immutable USDX_ADDRESS;
  address public immutable USDX_MOCK_PRICE_FEED;

  address public immutable WBTC_ADDRESS;
  address public immutable WBTC_MOCK_PRICE_FEED;

  address public immutable WETH_ADDRESS;
  address public immutable WETH_MOCK_PRICE_FEED;

  address immutable ATOKEN_IMPLEMENTATION;
  address immutable VARIABLE_DEBT_TOKEN_IMPLEMENTATION;

  ACLManager immutable ACL_MANAGER;
  IPoolConfigurator immutable CONFIGURATOR;

  constructor(
    IEngine customEngine,
    address erc20Owner,
    address weth9,
    MarketReport memory report
  ) AaveV3Payload(customEngine) {
    USDX_ADDRESS = address(new TestnetERC20('USDX', 'USDX', 6, erc20Owner));
    USDX_MOCK_PRICE_FEED = address(new MockAggregator(1e8));

    WBTC_ADDRESS = address(new TestnetERC20('WBTC', 'WBTC', 8, erc20Owner));
    WBTC_MOCK_PRICE_FEED = address(new MockAggregator(27000e8));

    WETH_ADDRESS = weth9;
    WETH_MOCK_PRICE_FEED = address(new MockAggregator(1800e8));

    ATOKEN_IMPLEMENTATION = report.aToken;
    VARIABLE_DEBT_TOKEN_IMPLEMENTATION = report.variableDebtToken;

    ACL_MANAGER = ACLManager(report.aclManager);
    CONFIGURATOR = IPoolConfigurator(report.poolConfiguratorProxy);
  }

  function newListingsCustom()
    public
    view
    override
    returns (IEngine.ListingWithCustomImpl[] memory)
  {
    IEngine.ListingWithCustomImpl[] memory listingsCustom = new IEngine.ListingWithCustomImpl[](3);

    IEngine.InterestRateInputData memory rateParams = IEngine.InterestRateInputData({
      optimalUsageRatio: 45_00,
      baseVariableBorrowRate: 0,
      variableRateSlope1: 4_00,
      variableRateSlope2: 60_00
    });

    listingsCustom[0] = IEngine.ListingWithCustomImpl(
      IEngine.Listing({
        asset: USDX_ADDRESS,
        assetSymbol: 'USDX',
        priceFeed: USDX_MOCK_PRICE_FEED,
        rateStrategyParams: rateParams,
        enabledToBorrow: EngineFlags.ENABLED,
        borrowableInIsolation: EngineFlags.DISABLED,
        withSiloedBorrowing: EngineFlags.DISABLED,
        flashloanable: EngineFlags.ENABLED,
        ltv: 50_00, // Changed from 82_50 to 50_00
        liqThreshold: 76_00, // Changed from 86_00 to 76_00 (allows max LTV of 75%)
        liqBonus: 5_00,
        reserveFactor: 10_00,
        supplyCap: 0,
        borrowCap: 0,
        debtCeiling: 0,
        liqProtocolFee: 10_00
      }),
      IEngine.TokenImplementations({
        aToken: ATOKEN_IMPLEMENTATION,
        vToken: VARIABLE_DEBT_TOKEN_IMPLEMENTATION
      })
    );

    listingsCustom[1] = IEngine.ListingWithCustomImpl(
      IEngine.Listing({
        asset: WBTC_ADDRESS,
        assetSymbol: 'WBTC',
        priceFeed: WBTC_MOCK_PRICE_FEED,
        rateStrategyParams: rateParams,
        enabledToBorrow: EngineFlags.ENABLED,
        borrowableInIsolation: EngineFlags.DISABLED,
        withSiloedBorrowing: EngineFlags.DISABLED,
        flashloanable: EngineFlags.ENABLED,
        ltv: 50_00, // Changed from 82_50 to 50_00
        liqThreshold: 76_00, // Changed from 86_00 to 76_00 (allows max LTV of 75%)
        liqBonus: 5_00,
        reserveFactor: 10_00,
        supplyCap: 0,
        borrowCap: 0,
        debtCeiling: 0,
        liqProtocolFee: 10_00
      }),
      IEngine.TokenImplementations({
        aToken: ATOKEN_IMPLEMENTATION,
        vToken: VARIABLE_DEBT_TOKEN_IMPLEMENTATION
      })
    );

    listingsCustom[2] = IEngine.ListingWithCustomImpl(
      IEngine.Listing({
        asset: WETH_ADDRESS,
        assetSymbol: 'WETH',
        priceFeed: WETH_MOCK_PRICE_FEED,
        rateStrategyParams: rateParams,
        enabledToBorrow: EngineFlags.ENABLED,
        borrowableInIsolation: EngineFlags.DISABLED,
        withSiloedBorrowing: EngineFlags.DISABLED,
        flashloanable: EngineFlags.ENABLED,
        ltv: 50_00, // Changed from 82_50 to 50_00
        liqThreshold: 76_00, // Changed from 86_00 to 76_00 (allows max LTV of 75%)
        liqBonus: 5_00,
        reserveFactor: 10_00,
        supplyCap: 0,
        borrowCap: 0,
        debtCeiling: 0,
        liqProtocolFee: 10_00
      }),
      IEngine.TokenImplementations({
        aToken: ATOKEN_IMPLEMENTATION,
        vToken: VARIABLE_DEBT_TOKEN_IMPLEMENTATION
      })
    );

    return listingsCustom;
  }

  function getPoolContext() public pure override returns (IEngine.PoolContext memory) {
    return IEngine.PoolContext({networkName: 'Local', networkAbbreviation: 'Loc'});
  }
}
