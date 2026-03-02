// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Test, console} from 'forge-std/Test.sol';
import {AggregatorInterface} from 'aave-v3-origin/src/contracts/dependencies/chainlink/AggregatorInterface.sol';

/**
 * @title VerifyChainlinkFeeds
 * @notice Verify Chainlink price feeds are active on Sepolia before deployment
 * @dev Run with: forge test --fork-url $SEPOLIA_RPC_URL --match-contract VerifyChainlinkFeeds -vv
 */
contract VerifyChainlinkFeeds is Test {
  address constant ETH_USD = 0x694AA1769357215DE4FAC081bf1f309aDC325306;
  address constant BTC_USD = 0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43;

  function setUp() public {
    vm.createSelectFork(vm.envString('SEPOLIA_RPC_URL'));
  }

  function test_ethUsdFeed() public view {
    AggregatorInterface feed = AggregatorInterface(ETH_USD);
    int256 price = feed.latestAnswer();

    // Verify price is in reasonable range
    assertGt(price, 1000e8, 'ETH price too low (< $1000)');
    assertLt(price, 10000e8, 'ETH price too high (> $10000)');

    // Verify decimals
    assertEq(feed.decimals(), 8, 'ETH/USD feed should use 8 decimals');

    console.log('ETH/USD Price:', uint256(price) / 1e8);
  }

  function test_btcUsdFeed() public view {
    AggregatorInterface feed = AggregatorInterface(BTC_USD);
    int256 price = feed.latestAnswer();

    // Verify price is in reasonable range
    assertGt(price, 20000e8, 'BTC price too low (< $20000)');
    assertLt(price, 150000e8, 'BTC price too high (> $150000)');

    // Verify decimals
    assertEq(feed.decimals(), 8, 'BTC/USD feed should use 8 decimals');

    console.log('BTC/USD Price:', uint256(price) / 1e8);
  }

  function test_feedsAreCallable() public view {
    // Verify both feeds are callable and don't revert
    AggregatorInterface ethFeed = AggregatorInterface(ETH_USD);
    AggregatorInterface btcFeed = AggregatorInterface(BTC_USD);

    ethFeed.latestAnswer();
    btcFeed.latestAnswer();

    console.log('Both feeds are callable and returning data');
  }
}
