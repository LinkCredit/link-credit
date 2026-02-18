import { useCallback, useEffect, useState } from "react";
import { usePlaidLink as usePlaidWidget } from "react-plaid-link";
import { type Address } from "viem";
import { apiBaseUrl } from "../config/addresses";

type PlaidEvaluateResponse = {
  scoreBps?: number;
  score?: number;
  message?: string;
};

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Plaid operation failed.";
}

export function usePlaidLink(
  walletAddress?: Address,
  onEvaluated?: () => void,
) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [openQueued, setOpenQueued] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastEvaluation, setLastEvaluation] =
    useState<PlaidEvaluateResponse | null>(null);

  useEffect(() => {
    setLinkToken(null);
    setLastEvaluation(null);
  }, [walletAddress]);

  const runEvaluation = useCallback(
    async (publicToken: string) => {
      if (!walletAddress) {
        return;
      }

      setIsEvaluating(true);
      setError(null);

      try {
        const response = await fetch(`${apiBaseUrl}/plaid/evaluate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            publicToken,
            walletAddress,
          }),
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || "Credit evaluation request failed.");
        }

        const payload = (await response.json()) as PlaidEvaluateResponse;
        setLastEvaluation(payload);
        onEvaluated?.();
      } catch (evaluationError) {
        setError(formatError(evaluationError));
      } finally {
        setIsEvaluating(false);
      }
    },
    [walletAddress, onEvaluated]
  );

  const { open, ready } = usePlaidWidget({
    token: linkToken,
    onSuccess: (publicToken) => {
      void runEvaluation(publicToken);
    },
    onExit: (plaidError) => {
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

  return {
    launch,
    isPreparing,
    isEvaluating,
    ready,
    error,
    lastEvaluation,
  };
}
