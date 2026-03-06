import { IDKit, type IDKitResult, type CredentialRequestType, type IDKitCompletionResult } from "@worldcoin/idkit-core";
import { useEffect, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { apiBaseUrl } from "../config/addresses";
import { useWorldIdVerification } from "../hooks/useWorldIdVerification";
import QRCode from "qrcode";

const worldcoinAppId = import.meta.env
  .VITE_WORLDCOIN_APP_ID as `app_${string}` | undefined;

const ACTION = "credit-scoring";

interface RpContext {
  rp_id: string;
  nonce: string;
  created_at: number;
  expires_at: number;
  signature: string;
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "World ID verification failed.";
}

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

function createWorldIdOwnershipMessage(input: {
  walletAddress: string;
  nullifierHash: string;
}): string {
  return [
    "Link Credit World ID authorization",
    `walletAddress:${input.walletAddress}`,
    `nullifierHash:${input.nullifierHash}`,
  ].join("\n");
}

export function WorldIDVerification(): React.JSX.Element {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationAccepted, setVerificationAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rpContext, setRpContext] = useState<RpContext | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [connectorURI, setConnectorURI] = useState<string | null>(null);
  const [isWaitingForScan, setIsWaitingForScan] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const { isVerified, verificationBoostPercent } = useWorldIdVerification(address);

  useEffect(() => {
    setVerificationAccepted(false);
    setError(null);
  }, [address]);

  useEffect(() => {
    if (!rpContext && address) {
      fetch(`${apiBaseUrl}/worldid/rp-signature`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: ACTION }),
      })
        .then((r) => r.json())
        .then((data) => setRpContext(data as RpContext))
        .catch((err) => setError(formatError(err)));
    }
  }, [rpContext, address]);

  const handleVerify = async (proof: IDKitResult): Promise<void> => {
    if (!address) {
      setError("Connect wallet first.");
      return;
    }

    setIsVerifying(true);
    setError(null);

    try {
      if (!signMessageAsync) {
        throw new Error("Connect wallet first.");
      }

      const response = proof.responses[0];
      if (!response) {
        throw new Error("No proof response received.");
      }

      const nullifierHash =
        typeof (response as { nullifier?: unknown }).nullifier === "string"
          ? (response as { nullifier: string }).nullifier
          : undefined;
      if (!nullifierHash) {
        throw new Error("World ID response is missing nullifier.");
      }

      const message = createWorldIdOwnershipMessage({
        walletAddress: address,
        nullifierHash,
      });
      const signature = await signMessageAsync({ message });

      const workflowPayload = {
        worldIdProof: proof,
        walletAddress: address,
      };

      console.log('=== WORLDID TRIGGER PAYLOAD FOR WORKFLOW DEBUG ===');
      console.log(JSON.stringify(workflowPayload, null, 2));
      console.log('===================================================');

      const apiResponse = await fetch(`${apiBaseUrl}/trigger-worldid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...workflowPayload,
          signature,
        }),
      });

      if (!apiResponse.ok) {
        const body = await apiResponse.text();
        throw new Error(body || "World ID workflow trigger failed.");
      }

      const payload = (await apiResponse.json()) as { accepted?: boolean; message?: string };
      if (!payload.accepted) {
        throw new Error(payload.message || "World ID verification was not accepted.");
      }

      setVerificationAccepted(true);
    } catch (verificationError) {
      setError(formatError(verificationError));
    } finally {
      setIsVerifying(false);
    }
  };

  const startVerification = async (): Promise<void> => {
    if (!address || !worldcoinAppId || !rpContext) {
      setError("Missing required configuration.");
      return;
    }

    setError(null);
    setQrCodeUrl(null);
    setIsWaitingForScan(true);

    try {
      const deviceConstraint: CredentialRequestType = {
        type: "device"
      };

      const request = await IDKit.request({
        app_id: worldcoinAppId,
        action: ACTION,
        rp_context: rpContext,
        allow_legacy_proofs: true,
        environment: "staging"
      }).constraints(deviceConstraint);

      const uri = request.connectorURI;
      setConnectorURI(uri);
      const qrDataUrl = await QRCode.toDataURL(uri);
      setQrCodeUrl(qrDataUrl);

      const completionResult: IDKitCompletionResult = await request.pollUntilCompletion();

      if (!completionResult.success) {
        throw new Error(`Verification failed: ${completionResult.error}`);
      }

      setIsWaitingForScan(false);
      await handleVerify(completionResult.result);
    } catch (err) {
      setError(formatError(err));
      setIsWaitingForScan(false);
      setQrCodeUrl(null);
    }
  };

  const cancelVerification = (): void => {
    setQrCodeUrl(null);
    setConnectorURI(null);
    setIsWaitingForScan(false);
    setError(null);
    setCopySuccess(false);
  };

  const copyConnectorLink = async (): Promise<void> => {
    if (!connectorURI) return;

    try {
      await navigator.clipboard.writeText(connectorURI);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      setError("Failed to copy link to clipboard");
    }
  };

  const canInitializeFlow = worldcoinAppId && rpContext && address;

  function renderContent() {
    if (!isConnected || !address) {
      return <p className="mt-4 text-sm text-amber-200">Connect wallet to verify with World ID.</p>;
    }

    if (!worldcoinAppId) {
      return (
        <p className="mt-4 text-sm text-amber-200">
          Set
          <span className="mx-1 rounded bg-black/40 px-1.5 py-0.5 font-mono text-xs">
            VITE_WORLDCOIN_APP_ID
          </span>
          to enable verification.
        </p>
      );
    }

    if (isVerified) {
      return (
        <p className="mt-4 text-sm font-medium text-emerald-300">
          ✓ Verified. World ID boost: +{formatPercent(verificationBoostPercent)}.
        </p>
      );
    }

    if (verificationAccepted) {
      return (
        <p className="mt-4 text-sm font-medium text-cyan-300">
          Verification accepted. Waiting for on-chain boost update.
        </p>
      );
    }

    if (qrCodeUrl) {
      return (
        <div className="mt-4 space-y-4">
          <button
            type="button"
            onClick={copyConnectorLink}
            className="rounded-xl bg-white p-4 inline-block transition hover:bg-gray-100 cursor-pointer relative group"
            title="Click to copy World ID link"
          >
            <img src={qrCodeUrl} alt="World ID QR Code" className="w-64 h-64" />
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl">
              <span className="text-white text-sm font-semibold">
                {copySuccess ? "✓ Copied!" : "Click to copy link"}
              </span>
            </div>
          </button>
          <div className="space-y-2">
            <p className="text-sm text-slate-300">
              Scan this QR code with your World ID app to verify
            </p>
            {copySuccess && (
              <p className="text-sm text-emerald-300">
                ✓ Link copied to clipboard
              </p>
            )}
            {isWaitingForScan && (
              <p className="text-sm text-cyan-300 animate-pulse">
                Waiting for verification...
              </p>
            )}
            {isVerifying && (
              <p className="text-sm text-cyan-300 animate-pulse">
                Processing verification...
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={cancelVerification}
            disabled={isVerifying}
            className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      );
    }

    return (
      <div className="mt-4">
        <button
          type="button"
          onClick={startVerification}
          disabled={isVerifying || isWaitingForScan || !canInitializeFlow}
          className="rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isVerifying ? "Submitting..." : !rpContext ? "Loading..." : "Verify with World ID"}
        </button>
      </div>
    );
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-slate-900/60 p-6 shadow-2xl shadow-cyan-900/20">
      <h2 className="text-xl font-semibold text-white">World ID (optional)</h2>
      <p className="mt-1 text-sm text-slate-300">
        Verify unique humanness for an extra LTV boost.
      </p>

      {renderContent()}

      {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}
    </section>
  );
}
