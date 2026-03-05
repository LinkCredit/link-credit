/**
 * Syncs deployed contract addresses from packages/contracts/deployed-addresses.json
 * into workflow config files (config.staging.json, config.production.json).
 */

const addresses = await Bun.file("packages/contracts/deployed-addresses.json").json();

const workflowConfigs = [
  "packages/workflow/config.staging.json",
  "packages/workflow/config.production.json",
];

const worldidWorkflowConfigs = [
  "packages/worldid-workflow/config.staging.json",
  "packages/worldid-workflow/config.production.json",
];

// Sync creditOracle to workflow configs
for (const configPath of workflowConfigs) {
  const config = await Bun.file(configPath).json();
  config.oracleContractAddress = addresses.creditOracle;
  await Bun.write(configPath, JSON.stringify(config, null, 2) + "\n");
}

// Sync worldIdRegistry to worldid-workflow configs
for (const configPath of worldidWorkflowConfigs) {
  const config = await Bun.file(configPath).json();
  config.registryContractAddress = addresses.worldIdRegistry;
  await Bun.write(configPath, JSON.stringify(config, null, 2) + "\n");
}

console.log(`Synced oracleContractAddress → ${addresses.creditOracle}`);
console.log(`Synced registryContractAddress → ${addresses.worldIdRegistry}`);
