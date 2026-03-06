/**
 * Syncs deployed contract addresses from packages/contracts/deployed-addresses.json
 * into workflow config files.
 */

type AddressBook = {
  creditOracle?: string;
  worldIdRegistry?: string;
};

async function updateConfigValue(
  configPath: string,
  key: string,
  value: string | undefined
) {
  if (!value) {
    return;
  }

  const config = await Bun.file(configPath).json();
  config[key] = value;
  await Bun.write(configPath, JSON.stringify(config, null, 2) + "\n");
}

const sepoliaAddresses = (await Bun.file(
  "packages/contracts/deployed-addresses.json"
).json()) as AddressBook;

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
  await updateConfigValue(
    configPath,
    "oracleContractAddress",
    sepoliaAddresses.creditOracle
  );
}

// Sync worldIdRegistry to worldid-workflow configs
for (const configPath of worldidWorkflowConfigs) {
  await updateConfigValue(
    configPath,
    "registryContractAddress",
    sepoliaAddresses.worldIdRegistry
  );
}

console.log(`Synced oracleContractAddress → ${sepoliaAddresses.creditOracle || "missing"}`);
console.log(`Synced registryContractAddress → ${sepoliaAddresses.worldIdRegistry || "missing"}`);
