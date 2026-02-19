import { useCallback, useEffect, useState } from "react";
import { usePlaidLink as usePlaidWidget } from "react-plaid-link";
import { type Address } from "viem";
import { apiBaseUrl } from "../config/addresses";

type PlaidEvaluateResponse = {
  accepted: boolean;
  message?: string;
};

type SignMessageAsync = (variables: { message: string }) => Promise<string>;

function getOAuthRedirectUri(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const query = new URLSearchParams(window.location.search);
  if (!query.get("oauth_state_id")) {
    return null;
  }

  return window.location.href;
}

function cleanOAuthParams(): void {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  if (!url.searchParams.has("oauth_state_id")) {
    return;
  }

  url.searchParams.delete("oauth_state_id");
  url.searchParams.delete("oauth_state");

  const query = url.searchParams.toString();
  const next = `${url.pathname}${query ? `?${query}` : ""}${url.hash}`;
  window.history.replaceState(window.history.state, "", next);
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Plaid operation failed.";
}

function createWalletOwnershipMessage(
  publicToken: string,
  walletAddress: Address,
): string {
  return [
    "Link Credit scoring authorization",
    `publicToken:${publicToken}`,
    `walletAddress:${walletAddress}`,
  ].join("\n");
}

export function usePlaidLink(
  walletAddress?: Address,
  signMessageAsync?: SignMessageAsync,
  onEvaluated?: () => void,
) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [openQueued, setOpenQueued] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [hasAttemptedOAuthResume, setHasAttemptedOAuthResume] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastEvaluation, setLastEvaluation] =
    useState<PlaidEvaluateResponse | null>(null);
  const [receivedRedirectUri, setReceivedRedirectUri] = useState<string | null>(
    null,
  );

  useEffect(() => {
    setLinkToken(null);
    setLastEvaluation(null);

    const redirectUri = getOAuthRedirectUri();
    setReceivedRedirectUri(redirectUri);
    setHasAttemptedOAuthResume(!redirectUri);
  }, [walletAddress]);

  const runEvaluation = useCallback(
    async (publicToken: string) => {
      if (!walletAddress) {
        return;
      }

      setIsEvaluating(true);
      setError(null);

      try {
        if (!signMessageAsync) {
          throw new Error("Connect wallet first.");
        }

        const message = createWalletOwnershipMessage(publicToken, walletAddress);
        const signature = await signMessageAsync({ message });

        const response = await fetch(`${apiBaseUrl}/trigger-scoring`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            publicToken,
            walletAddress,
            signature,
          }),
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || "Credit evaluation request failed.");
        }

        const payload = (await response.json()) as PlaidEvaluateResponse;
        if (!payload.accepted) {
          throw new Error(payload.message || "Scoring request was not accepted.");
        }
        setLastEvaluation(payload);
        onEvaluated?.();
      } catch (evaluationError) {
        setError(formatError(evaluationError));
      } finally {
        setIsEvaluating(false);
      }
    },
    [walletAddress, signMessageAsync, onEvaluated]
  );

  const { open, ready } = usePlaidWidget({
    token: linkToken,
    receivedRedirectUri: receivedRedirectUri ?? undefined,
    onSuccess: (publicToken) => {
      cleanOAuthParams();
      setReceivedRedirectUri(null);
      setHasAttemptedOAuthResume(true);
      void runEvaluation(publicToken);
    },
    onExit: (plaidError) => {
      cleanOAuthParams();
      setReceivedRedirectUri(null);
      setHasAttemptedOAuthResume(true);
      if (plaidError) {
        setError(plaidError.display_message || plaidError.error_message);
      }
    },
  });

  const fetchLinkToken = useCallback(async () => {
    if (!walletAddress) {
      throw new Error("Connect wallet first.");
    }

    const response = await fetch(`${apiBaseUrl}/plaid/link-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "Failed to fetch Plaid link token.");
    }

    const payload = (await response.json()) as
      | { linkToken?: string; link_token?: string }
      | undefined;
    const token = payload?.linkToken ?? payload?.link_token;
    if (!token) {
      throw new Error("API returned an invalid Plaid link token.");
    }

    setLinkToken(token);
    return token;
  }, [walletAddress]);

  const launch = useCallback(async () => {
    setError(null);
    setIsPreparing(true);

    try {
      if (!linkToken) {
        await fetchLinkToken();
      }

      if (ready) {
        open();
      } else {
        setOpenQueued(true);
      }
    } catch (launchError) {
      setError(formatError(launchError));
    } finally {
      setIsPreparing(false);
    }
  }, [fetchLinkToken, linkToken, open, ready]);

  useEffect(() => {
    if (!openQueued || !ready) {
      return;
    }
    open();
    setOpenQueued(false);
  }, [openQueued, open, ready]);

  useEffect(() => {
    if (!receivedRedirectUri || !walletAddress || hasAttemptedOAuthResume) {
      return;
    }

    setHasAttemptedOAuthResume(true);
    setOpenQueued(true);
    setError(null);
    setIsPreparing(true);

    void fetchLinkToken()
      .catch((resumeError) => {
        setOpenQueued(false);
        setError(formatError(resumeError));
      })
      .finally(() => {
        setIsPreparing(false);
      });
  }, [
    fetchLinkToken,
    hasAttemptedOAuthResume,
    receivedRedirectUri,
    walletAddress,
  ]);

  return {
    launch,
    isPreparing,
    isEvaluating,
    ready,
    error,
    lastEvaluation,
  };
}
