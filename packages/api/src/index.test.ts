import { describe, expect, test } from "bun:test";
import { createWalletOwnershipMessage } from "./index";

describe("createWalletOwnershipMessage", () => {
  test("includes token and wallet in deterministic format", () => {
    const message = createWalletOwnershipMessage("public-123", "0xabc");

    expect(message).toContain("Link Credit scoring authorization");
    expect(message).toContain("publicToken:public-123");
    expect(message).toContain("walletAddress:0xabc");
  });
});
