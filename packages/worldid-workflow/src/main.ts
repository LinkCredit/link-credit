import {
  consensusIdenticalAggregation,
  decodeJson,
  EVMClient,
  getNetwork,
  handler,
  hexToBase64,
  HTTPCapability,
  HTTPClient,
  prepareReportRequest,
  Runner,
  type HTTPPayload,
  type HTTPSendRequester,
  type Runtime,
} from "@chainlink/cre-sdk";
import {
  encodeAbiParameters,
  parseAbiParameters,
  stringToHex,
  type Address,
} from "viem";
import { z } from "zod";

const configSchema = z.object({
  chainSelectorName: z.string(),
  registryContractAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  worldIdAppId: z.string().min(1),
  worldIdRpId: z.string().min(1),
  worldIdAction: z.string().min(1).default("credit-scoring"),
  worldIdApiBaseUrl: z.string().default("https://developer.worldcoin.org/api/v4"),
});

const verificationLevelSchema = z
  .string()
  .transform((value) => value.trim().toLowerCase())
  .pipe(z.enum(["device", "orb"]));

const httpInputSchema = z.object({
  proof: z.string().min(1),
  merkle_root: z.string().min(1),
  nullifier_hash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  verification_level: verificationLevelSchema,
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
});

type Config = z.infer<typeof configSchema>;
type TriggerPayload = z.infer<typeof httpInputSchema>;
type HttpResponse = ReturnType<HTTPSendRequester["sendRequest"]> extends {
  result: () => infer T;
}
  ? T
  : never;

export const initWorkflow = (rawConfig: Config) => {
  const config = configSchema.parse(rawConfig);
  const http = new HTTPCapability();

  const onHttpTrigger = (runtime: Runtime<Config>, payload: HTTPPayload): string => {
    const input = parseHttpInput(payload);
    const httpClient = new HTTPClient();

    const verified = httpClient
      .sendRequest(
        runtime,
        (requester) => verifyWorldIdProof(requester, config, input),
        consensusIdenticalAggregation<boolean>(),
      )()
      .result();

    writeVerificationOnChain(runtime, config, input, verified);

    runtime.log(
      `[worldid] verification complete wallet=${input.walletAddress} verified=${verified}`,
    );

    return "ok";
  };

  return [handler(http.trigger({ authorizedKeys: [] }), onHttpTrigger)];
};

export async function main(): Promise<void> {
  const runner = await Runner.newRunner<Config>();
  await runner.run((config) => initWorkflow(configSchema.parse(config)));
}

function parseHttpInput(payload: HTTPPayload): TriggerPayload {
  const parsed = decodeJson(payload.input);
  return httpInputSchema.parse(parsed);
}

function verifyWorldIdProof(
  sendRequester: HTTPSendRequester,
  config: Config,
  input: TriggerPayload,
): boolean {
  const response = sendRequester
    .sendRequest({
      url: `${trimTrailingSlash(config.worldIdApiBaseUrl)}/verify/${config.worldIdRpId}`,
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: jsonBody({
        proof: input.proof,
        merkle_root: input.merkle_root,
        nullifier_hash: input.nullifier_hash,
        verification_level: input.verification_level,
        action: config.worldIdAction,
        signal: input.walletAddress,
      }),
    })
    .result();

  if (!responseOk(response)) {
    return false;
  }

  const parsed = safeJsonParse(decodeBody(response));
  if (!parsed || typeof parsed !== "object") {
    return false;
  }

  return (parsed as Record<string, unknown>).success === true;
}

function writeVerificationOnChain(
  runtime: Runtime<Config>,
  config: Config,
  input: TriggerPayload,
  verified: boolean,
): void {
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: config.chainSelectorName,
    isTestnet: true,
  });

  if (!network) {
    throw new Error(`Unsupported chain selector name: ${config.chainSelectorName}`);
  }

  const evmClient = new EVMClient(network.chainSelector.selector);
  const verificationLevel = input.verification_level === "orb" ? 1 : 0;

  const reportPayload = encodeAbiParameters(
    parseAbiParameters("address user, bool verified, uint256 level, bytes32 nullifier"),
    [
      input.walletAddress as Address,
      verified,
      BigInt(verificationLevel),
      input.nullifier_hash as `0x${string}`,
    ],
  );

  const report = runtime.report(prepareReportRequest(reportPayload)).result();
  evmClient
    .writeReport(runtime, {
      receiver: config.registryContractAddress,
      report,
    })
    .result();
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function jsonBody(payload: object): string {
  return hexToBase64(stringToHex(JSON.stringify(payload)));
}

function decodeBody(response: HttpResponse): string {
  return new TextDecoder().decode(response.body);
}

function responseOk(response: HttpResponse): boolean {
  return response.statusCode >= 200 && response.statusCode < 300;
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
