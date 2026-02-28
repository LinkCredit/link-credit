# AI Privacy Credit Scoring → Low Collateral DeFi Lending

> Hackathon: <https://chain.link/hackathon>
>
> Tracks: **Privacy** + **DeFi & Tokenization** (compete in both tracks + Grand Prize)

---

## How Big is the Pain?

DeFi lending's greatest bottleneck remains unsolved: **over-collateralization**. Aave/Compound require 150%+ collateral ratio, meaning to borrow $100 you must lock $150+. This isn't "borrowing"—it's "locking collateral for liquidity." Real-world credit is based on creditworthiness, but DeFi has zero access to off-chain credit data—because of privacy.

## Why Now is the Right Time?

CRE's **Confidential HTTP** (launched February 14) solves this chicken-and-egg problem: you can call off-chain credit assessment APIs inside CRE workflows (bank balances, credit history, income verification), with API credentials and response data remaining confidential, returning only a "credit grade" or boolean to the on-chain contract. User privacy stays intact, but DeFi protocols gain credit signals.

## MVP Approach (Small & Focused)

Don't write a lending protocol from scratch. Do three things: 1) **Credit Score Oracle**—a CRE workflow where the frontend authorizes bank data via Plaid Link, then CRE performs token exchange and fetches bank data via Confidential HTTP and AI-scores credit inside TEE, writing the score on-chain. The only "backend" is a Cloudflare Worker that creates Plaid Link tokens (CRE has no HTTP response mechanism). 2) **Fork Aave v3**—inject credit score boost into Aave's core LTV calculation (~10 line change), letting high-credit-score users borrow with lower collateral ratio. Not a toy contract—it's the real Aave protocol reading your credit score. 3) **World ID Sybil Resistance**—CreditOracle contract has built-in on-chain ZKP verification (calls World ID Router), using zero-knowledge proofs to ensure one person one score, preventing multi-wallet draining attacks.

## Why Reviewers Will Love It?

- Uses CRE's newest Confidential HTTP feature (reviewers reward new feature adoption)
- AI is a key step (credit assessment) not a gimmick
- World ID on-chain ZKP verification for Sybil resistance—zero-knowledge proof + DeFi credit, perfect narrative for privacy track
- Solves DeFi's acknowledged largest structural pain point
- Aligns perfectly with Chainlink's institutional narrative (Aave Horizon, Swift)
- Past Grand Prize winner YieldCoin also solved practical DeFi pain points

## Risks & Mitigations

Plaid API may be hard to set up in hackathon environment. **Mitigation**: use mock API to simulate bank data, focus on demonstrating end-to-end Confidential HTTP flow + AI scoring logic. Reviewers judge architecture and potential.

---

## Implementation Breakdown

### Overall Architecture (Three-Layer Cake)

```
┌─────────────────────────────────────────────────┐
│  Layer 3: Frontend DApp (React)                 │
│  Connect wallet → World ID verification →       │
│  Plaid Link authorization →                    │
│  View credit score → Borrow                     │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│  Layer 2.5: Serverless Function (Cloudflare)    │
│  Create Plaid Link token only (~10 lines)       │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│  Layer 2: CRE Workflow (TypeScript, Core)       │
│  Token exchange → Confidential HTTP fetch →    │
│  AI scoring → Write score + World ID proof      │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│  Layer 1: Solidity Contracts (Sepolia testnet)  │
│  CreditOracle.sol ← on-chain ZKP verification   │
│  (World ID Router) + score storage +            │
│  LTV boost calculation                          │
│  Fork Aave v3 ← modify GenericLogic, inject     │
│  credit score → lower collateral ratio for      │
│  higher credit scores                           │
└─────────────────────────────────────────────────┘
```

### What Can CRE Workflow Actually Do?

CRE SDK gives you core capabilities: **HTTPClient** (send HTTP requests, including Confidential mode) + **EVMClient** (read/write on-chain contracts) + **CronTrigger / on-chain event Trigger**. Workflow compiles to WASM, runs on DON nodes—each node executes independently, consensus via BFT to finalize results.

**Key Constraint**: workflow callbacks are stateless—each trigger starts from zero. QuickJS engine isn't full Node.js, can't use `node:crypto` built-in modules. But can call any HTTP API, so AI inference is completely outsourced to external services.

---

## Implementation Steps

### Week One (2/6-2/13): Full Stack Integration

Use standard HTTPClient to run the entire flow (Confidential HTTP not yet live). CRE Workflow directly calls Plaid + OpenAI, no backend:

```
CRE Workflow (4/5 HTTP requests):
  [1] Plaid /item/public_token/exchange → access_token
  [2] Plaid /accounts/balance/get → balances
  [3] Plaid /transactions/get → transaction history
  ──  Local aggregation → FinancialProfile + rule-based scoring (non-HTTP, doesn't count toward quota)
  [4] OpenAI API → AI credit score
  ──  Weighted merge (rule score + AI score) → final score (consensusMedianAggregation)
  └─ EVMClient → CreditOracle.updateScore(walletAddress, score)
```

Architecture decision: **all assessment logic runs in CRE Workflow**, no centralized backend needed.

1. **Serverless Function** (Cloudflare Worker): Create Plaid Link token only (~10 lines)
2. **CRE Workflow Full Flow**: After frontend Plaid Link authorization completes, pass `public_token` to trigger CRE Workflow → token exchange → fetch bank data → AI score → write on-chain
3. **Frontend DApp**: Connect wallet → World ID verification → Plaid Link authorization → trigger CRE → listen for on-chain `ScoreUpdated` event → display score and discounted collateral ratio → borrow

#### Solidity Contracts (Write simultaneously in Week One)

**Lending Layer: Fork Aave v3** (see [aave-fork.md](./aave-fork.md))

Don't write a toy contract, directly fork `aave-dao/aave-v3-origin` (Foundry-native, v3.6), inject credit score boost into Aave's core LTV calculation function. Minimal changes (~10 lines core logic + parameter passing), but the effect is: credit score directly influences Aave protocol's borrowing capacity calculation, liquidation logic, frontend display—full stack integration.

**CreditOracle.sol** (our contract, base version; add World ID ZKP verification in week three, see below):

```solidity
// CreditOracle.sol — credit score storage + LTV boost calculation
contract CreditOracle {
    mapping(address => uint256) public creditScores;  // 0-10000 (bps)
    address public creWorkflow;  // Only CRE workflow can write
    uint256 public constant MAX_LTV_BOOST_BPS = 1500; // Max boost 15%

    function updateScore(address user, uint256 score) external {
        require(msg.sender == creWorkflow || msg.sender == owner());
        creditScores[user] = score;
    }

    // Linear boost: score 8000 (80/100) → boost = 1500 * 8000 / 10000 = 1200 bps (12%)
    function getLtvBoost(address user) external view returns (uint256) {
        uint256 score = creditScores[user];
        if (score == 0) return 0;
        return (MAX_LTV_BOOST_BPS * score) / 10000;
    }
}
```

**Aave Core Modification** (in `GenericLogic.calculateUserAccountData()`):

```solidity
// After fetching original LTV, inject credit score boost
if (params.creditOracle != address(0) && vars.ltv != 0) {
    uint256 boost = ICreditOracle(params.creditOracle).getLtvBoost(params.user);
    uint256 liqThreshold = currentReserve.configuration.getLiquidationThreshold();
    uint256 boostedLtv = vars.ltv + boost;
    if (boostedLtv > liqThreshold - 100) {
        boostedLtv = liqThreshold - 100; // 1% safety margin
    }
    vars.ltv = boostedLtv;
}
```

**Demo Parameters** (intentionally lower base LTV for clearer comparison):
- Base LTV: 50% (standard DeFi over-collateralization without credit score)
- Liquidation Threshold: 75%
- Max credit boost: 15%
- Credit score 80/100 user: effective LTV = 62% → collateral ratio ~161% (vs 200% without score)
- Credit score 100/100 user: effective LTV = 65% → collateral ratio ~154%

### Week Two (from 2/14): Switch to Confidential HTTP

February 14 early access for Confidential HTTP. Changes are only replacing `HTTPClient` with `ConfidentialHTTPClient`, credentials stored in Vault DON, core logic unchanged.

### Week Three: World ID Sybil Resistance + World Mini App

After core flow and Confidential HTTP complete, add World ID on-chain ZKP verification layer. Detailed technical design in "World ID + World Mini App Integration Plan" section below.

Main work:
1. Register app in Developer Portal, get `app_id`, create `credit-score` action
2. Integrate World ID Router in CreditOracle contract (`verifyProof` + nullifier mapping)
3. Add World ID verification component to frontend (dual mode: IDKit + MiniKit)
4. CRE Workflow transparently passes proof data to contract calls
5. Test Mini App mode (ngrok tunnel + World App QR scan)

---

## Final Demo Impact

Complete narrative for a five-minute video:

1. **Opening** (30s): Show DeFi lending pain point—"User wants to borrow $1000, needs to lock $2000, this isn't credit, it's pawn shop"
2. **User Flow Demo** (90s): Connect wallet → World ID verification (Orb scan/Simulator simulation) → Plaid Link authorize bank → CRE workflow execution (show CLI simulation logs, clearly see each step: token exchange, Confidential HTTP fetch bank data, AI scoring, on-chain write + ZKP verification) → Frontend listens on-chain event, real-time refresh credit score (e.g., 82/100) → display "Your personalized collateral ratio: 161%" (not default 200%)
3. **Borrowing Demo** (60s): Operate on forked Aave v3—deposit $1610 collateral → successfully borrow $1000 → compare user without credit score needing $2000. This is real Aave protocol reading credit score, not toy contract
4. **Tech Highlights** (60s): Show how Confidential HTTP protects bank data—"Raw financial data never leaves TEE, chain only records score result". World ID on-chain ZKP verification—"Zero-knowledge proof ensures one person one score, prevents multi-wallet draining, verification reveals no identity info". Show Aave GenericLogic modification—only 10 lines of code and entire protocol supports credit scoring. AI scoring via DON multi-node consensus with median aggregation, prevents single-point manipulation
5. **Future Vision** (30s): Integrate real Plaid/bank open banking APIs → multi-protocol reuse same credit oracle → build on-chain credit history

---

## Risks & Plan B

**Biggest Risk**: Confidential HTTP opens early access on 2/14, but docs and API may be unstable or require early access queue.

**Plan B**: Even if Confidential HTTP unavailable, you can still build with standard HTTPClient + CRE Secrets management (store API keys). In video demo say "this workflow designed for Confidential HTTP, currently running in simulation mode with standard HTTP, will migrate to Confidential HTTP at GA"—reviewers understand early access limits, your architecture already in place, this is enough. Many past award winners only did simulation/testnet level.

---

## World ID + World Mini App Integration Plan

### Why World ID?

Credit scoring system's biggest vulnerability is **Sybil attacks**: one person creates multiple wallets, each gets a credit score, then borrows using multiple "high-credit" identities. World ID provides **proof-of-personhood via zero-knowledge proof**—proves user is one unique person, reveals no identity info. Each real person has one unique `nullifier_hash` (per app + per action), write to contract enforces on-chain "one person one score".

Additionally, World ID verification level itself is a **trust signal** usable as input factor for AI credit scoring.

### Integration Method: Gate + AI Scoring Factor (Hybrid Approach)

**1) Gate (Sybil Resistance)**: User must pass World ID verification first, then can trigger Plaid Link authorization and credit scoring flow. `nullifier_hash` written to CreditOracle contract alongside credit score, contract enforces one nullifier binds to one wallet address.

**2) AI Scoring Factor**: Orb verification (iris biometric) itself highest trust level, AI can weight higher trust in scoring. Not simple point bonus, but lets AI evaluate bank data with identity verification strength as risk factor.

### Verification Levels

On-chain ZKP verification only supports **Orb level** (iris biometric, strongest uniqueness). Hackathon demo uses Worldcoin Simulator to simulate Orb verification.

### Architecture Decision: On-Chain ZKP Verification (Not Cloud API)

Choose on-chain ZKP verification over Cloud API verification:
- **Doesn't increase backend complexity**: verification logic in CreditOracle contract, contract calls World ID Router `verifyProof()`, no backend endpoint additions
- **Saves CRE HTTP budget**: verification done on-chain, doesn't consume CRE's 5 HTTP request quota (currently 4/5: Plaid×3 + OpenAI×1)
- **Fully trustless**: ZKP verification runs on-chain, doesn't depend on Worldcoin Cloud API, aligns with "privacy + DeFi" track narrative
- **Atomic**: verification + score write in single transaction, no intermediate state where verification passes but write fails
- **Hackathon bonus points**: on-chain ZKP more technically sophisticated than Cloud API call

### Contract Changes

CreditOracle adds World ID Router integration + nullifier Sybil resistance:

```solidity
import { IWorldID } from "@worldcoin/world-id-contracts/interfaces/IWorldID.sol";

// New state variables
IWorldID public worldId;                    // Sepolia Router: 0x469449f251692e0779667583026b5a1e99512157
uint256 public externalNullifierHash;       // hash(hash(app_id), action)
mapping(uint256 => bool) public usedNullifiers;  // prevent replay verification

// updateScore signature changed: add ZKP proof parameters
function updateScore(
    address user, uint256 score,
    uint256 root, uint256 nullifierHash, uint256[8] calldata proof
) external {
    require(!usedNullifiers[nullifierHash], "already verified");
    // On-chain verify ZKP — reverts on failure
    worldId.verifyProof(
        root, 1,  // groupId=1 (Orb)
        hashToField(abi.encodePacked(user)),  // signal = user address
        nullifierHash, externalNullifierHash, proof
    );
    usedNullifiers[nullifierHash] = true;
    creditScores[user] = score;
}
```

CRE Workflow passes proof data from frontend IDKit via EVMClient when calling (`merkle_root`, `nullifier_hash`, `proof[8]`).

### Modified User Flow

```
Connect wallet → World ID verification (IDKit generates ZKP proof)
  → Plaid Link authorize bank data
  → Trigger CRE Workflow (pass public_token + proof data)
  → CRE: token exchange → fetch bank data → AI score (4/5 HTTP requests)
  → CRE: EVMClient → CreditOracle.updateScore(wallet, score, root, nullifierHash, proof)
  → Contract: worldIdRouter.verifyProof() → verify passes → store nullifier → write score
  → Frontend listens ScoreUpdated event → display score + personalized collateral ratio → borrow
```

### World Mini App Dual-Mode Frontend

Frontend supports both **browser mode** and **World App Mini App mode**:

| Capability | Browser Mode | Mini App Mode |
|-----------|-------------|--------------|
| World ID Verification | `<IDKitWidget>` popup/QR scan | `MiniKit.commandsAsync.verify()` native call |
| Wallet Connection | wagmi + ConnectKit | `MiniKit.commandsAsync.walletAuth()` (SIWE) |
| On-Chain Transaction | wagmi sends Sepolia transaction directly | Unavailable (`sendTransaction` only supports World Chain) |
| Detection | Default | `MiniKit.isInstalled()` |

**Key Constraint**: MiniKit `sendTransaction` only supports **World Chain**, while our Aave fork and CreditOracle deployed on **Sepolia**. Therefore Mini App mode focuses on "verification + scoring" UX, full borrowing operation completes in browser mode. Mini App serves World App ecosystem entry point, guides users through identity verification and credit assessment.

**SDK Info**:
- Browser: `@worldcoin/idkit` v2.4.2 (React component)
- Mini App: `@worldcoin/minikit-js` v1.9.10 (peer deps: react ^17-19, viem ^2.23.5)
- Sepolia World ID Router: `0x469449f251692e0779667583026b5a1e99512157`
- Developer Portal: https://developer.worldcoin.org (register app, create `credit-score` action)
