import { describe, expect, test } from "bun:test";
import {
  buildFinancialProfile,
  calculateRuleScore,
  decryptAccessToken,
  encryptAccessToken,
  parseEncryptionKey,
  scoreProfile,
} from "./index";
import { incomeClusterStats, scoreIncomeStability, txSearchText } from "./scoring";

describe("token encryption", () => {
  test("encrypt/decrypt roundtrip with hex key", () => {
    const key = "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const token = "access-development-token";

    const encrypted = encryptAccessToken(token, key);
    const decrypted = decryptAccessToken(encrypted, key);

    expect(encrypted).not.toBe(token);
    expect(decrypted).toBe(token);
  });

  test("rejects invalid encryption key length", () => {
    expect(() => parseEncryptionKey("short-key")).toThrow();
  });
});

describe("rule score", () => {
  test("returns high score for healthy profile", () => {
    const profile = buildFinancialProfile(
      {
        accounts: [{ balances: { current: 5600 } }],
      },
      {
        transactions: [
          { amount: -2100, merchant_name: "Payroll" },
          { amount: -2100, merchant_name: "Payroll" },
          { amount: 800, merchant_name: "Rent" },
          { amount: 120, merchant_name: "Groceries" },
          { amount: 60, merchant_name: "Utilities" },
        ],
      },
    );

    const score = calculateRuleScore(profile);
    expect(score.score).toBeGreaterThanOrEqual(70);
  });

  test("returns lower score for risk-heavy profile", () => {
    const profile = buildFinancialProfile(
      {
        accounts: [{ balances: { current: 120 } }],
      },
      {
        transactions: [
          { amount: 400, name: "Overdraft fee" },
          { amount: 320, name: "Shopping spree" },
          { amount: 180, name: "Travel" },
          { amount: 90, name: "Coffee" },
        ],
      },
    );

    const score = calculateRuleScore(profile);
    expect(score.score).toBeLessThanOrEqual(55);
  });
});

describe("income clustering", () => {
  test("detects periodic income in the largest merchant cluster", () => {
    const cluster = incomeClusterStats([
      { amount: -2000, merchant_name: "Acme Payroll", date: "2026-01-03" },
      { amount: -2050, merchant_name: "Acme Payroll", date: "2026-01-17" },
      { amount: -2020, merchant_name: "Acme Payroll", date: "2026-01-31" },
      { amount: -300, merchant_name: "Side Hustle", date: "2026-01-08" },
    ]);

    expect(cluster.detected).toBe(true);
    expect(cluster.periodic).toBe(true);
    expect(cluster.cv).toBeLessThan(0.02);
  });

  test("adds periodic bonus to income stability score", () => {
    expect(scoreIncomeStability(true, 0.3, false)).toBe(60);
    expect(scoreIncomeStability(true, 0.3, true)).toBe(70);
  });
});

describe("text and merchant normalization", () => {
  test("normalizes merchant names before aggregation", () => {
    const profile = buildFinancialProfile(
      { accounts: [] },
      {
        transactions: [
          { amount: 20, merchant_name: "ACME, Inc." },
          { amount: 40, merchant_name: " acme inc " },
        ],
      },
    );

    expect(profile.topMerchants[0]).toEqual({
      name: "acme inc",
      count: 2,
      total: 60,
    });
  });

  test("search text includes plaid description and finance category fields", () => {
    const text = txSearchText({
      amount: 12,
      name: "Coffee Shop",
      original_description: "Daily Brew",
      personal_finance_category: {
        primary: "FOOD_AND_DRINK",
        detailed: "COFFEE",
      },
    });

    expect(text).toContain("coffee shop");
    expect(text).toContain("daily brew");
    expect(text).toContain("food_and_drink");
    expect(text).toContain("coffee");
  });
});

describe("reason generation", () => {
  test("builds rule reasons and appends unique AI reason codes", async () => {
    const config = {
      chainSelectorName: "test",
      oracleContractAddress: "0xabc",
      workerBaseUrl: "https://worker.test",
    };
    const deps = {
      secrets: {
        async getSecret(name: string): Promise<string> {
          if (name === "OPENAI_API_KEY") {
            return "test-key";
          }
          throw new Error(`Missing secret: ${name}`);
        },
      },
      oracle: {
        async updateScore(): Promise<void> {},
      },
      fetchFn: async (): Promise<Response> =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    adjustment: 0,
                    reason_codes: ["RISK_FLAGS_NONE", "NEUTRAL_PROFILE"],
                    one_sentence_explanation: "ok",
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        ),
    };

    const result = await scoreProfile(
      config,
      {
        balance: { accounts: [{ balances: { current: 0 } }] },
        transactions: { transactions: [] },
      },
      deps,
    );

    expect(result.reasons).toEqual(["NEUTRAL_PROFILE", "RISK_FLAGS_NONE"]);
  });
});
