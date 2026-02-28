/**
 * Syncs deployed contract addresses from packages/contracts/deployed-addresses.json
 * into workflow config files (config.staging.json, config.production.json).
 */

const addresses = await Bun.file("packages/contracts/deployed-addresses.json").json();

const configPaths = [
  "packages/workflow/config.staging.json",
  "packages/workflow/config.production.json",
];

for (const configPath of configPaths) {
  const config = await Bun.file(configPath).json();
  config.oracleContractAddress = addresses.creditOracle;
  await Bun.write(configPath, JSON.stringify(config, null, 2) + "\n");
}

console.log(`Synced oracleContractAddress → ${addresses.creditOracle}`);
