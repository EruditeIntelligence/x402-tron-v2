# @erudite-intelligence/x402-tron-v2

**The first and only x402 V2 plugin for the TRON blockchain.**

Enable USDT TRC-20 payments for AI agents, web services, and merchants through the [x402 payment protocol](https://x402.org).

[![npm version](https://img.shields.io/npm/v/@erudite-intelligence/x402-tron-v2.svg)](https://www.npmjs.com/package/@erudite-intelligence/x402-tron-v2)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why Tron + x402?

- **$3.3T+ in stablecoin transactions** processed on Tron (2024-2025)
- **Sub-cent fees** — Tron TRC-20 transfers cost <$0.01 vs Ethereum's $5-50
- **USDT dominance** — 95%+ of Tron's stablecoin supply is USDT
- **Southeast Asian adoption** — Tron USDT is the de facto payment rail for street vendors, freelancers, and cross-border remittances
- **AI agent payments** — x402 enables HTTP-native payments; Tron makes them practically free

## Installation

```bash
npm install @erudite-intelligence/x402-tron-v2 @x402/core tronweb
```

## Quick Start

### Facilitator Setup (Processing Payments)

```typescript
import { x402Facilitator } from "@x402/core/facilitator";
import {
  registerExactTronScheme,
  toFacilitatorTronSigner,
  TRON_MAINNET,
} from "@erudite-intelligence/x402-tron-v2";
import TronWeb from "tronweb";

// Initialize TronWeb with your facilitator private key
const tronWeb = new TronWeb({
  fullHost: "https://api.trongrid.io",
  privateKey: process.env.TRON_FACILITATOR_PRIVATE_KEY,
});

// Create and configure the x402 facilitator
const facilitator = new x402Facilitator();

registerExactTronScheme(facilitator, {
  signer: toFacilitatorTronSigner(tronWeb),
  networks: TRON_MAINNET, // "tron:27Lqcw"
});

// The facilitator now handles Tron USDT payments!
// Use with any x402-compatible HTTP server (Express, Hono, Next.js, etc.)
```

### Multi-Chain Facilitator (Tron + Base + Solana)

```typescript
import { x402Facilitator } from "@x402/core/facilitator";
import { registerExactEvmScheme } from "@x402/evm/exact/facilitator/register";
import { registerExactSvmScheme } from "@x402/svm/exact/facilitator/register";
import { registerExactTronScheme, toFacilitatorTronSigner } from "@erudite-intelligence/x402-tron-v2";

const facilitator = new x402Facilitator();

// Register all chains
registerExactEvmScheme(facilitator, { signer: evmSigner, networks: "eip155:8453" });
registerExactSvmScheme(facilitator, { signer: svmSigner, networks: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" });
registerExactTronScheme(facilitator, { signer: toFacilitatorTronSigner(tronWeb), networks: "tron:27Lqcw" });

// One facilitator, three blockchains. USDC on Base, USDC on Solana, USDT on Tron.
```

### Client Setup (Making Payments)

```typescript
import { x402Client } from "@x402/core/client";
import {
  registerExactTronClientScheme,
  toClientTronSigner,
  TRON_MAINNET,
} from "@erudite-intelligence/x402-tron-v2";
import TronWeb from "tronweb";

const tronWeb = new TronWeb({
  fullHost: "https://api.trongrid.io",
  privateKey: process.env.TRON_WALLET_PRIVATE_KEY,
});

const client = new x402Client();

registerExactTronClientScheme(client, {
  signer: toClientTronSigner(tronWeb),
  networks: TRON_MAINNET,
});

// Client can now pay for x402-protected resources using Tron USDT
```

### Resource Server Setup (Merchants)

```typescript
import { x402ResourceServer } from "@x402/core/server";
import {
  registerExactTronServerScheme,
  TRON_MAINNET,
} from "@erudite-intelligence/x402-tron-v2";

const server = new x402ResourceServer();

registerExactTronServerScheme(server, {
  networks: TRON_MAINNET,
});

// Set prices in USD — automatically converted to USDT TRC-20
// "$0.10" → { amount: "100000", asset: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t" }
```

## Architecture

This plugin follows the exact same pattern as the official `@x402/evm` and `@x402/svm` packages:

```
@erudite-intelligence/x402-tron-v2
├── exact/
│   ├── facilitator/   # Verify & settle TRC-20 payments
│   │   ├── scheme.ts  # ExactTronScheme (SchemeNetworkFacilitator)
│   │   └── register.ts # registerExactTronScheme()
│   ├── client/        # Create payment payloads
│   │   ├── scheme.ts  # ExactTronScheme (SchemeNetworkClient)
│   │   └── register.ts # registerExactTronClientScheme()
│   └── server/        # Parse prices & build requirements
│       ├── scheme.ts  # ExactTronScheme (SchemeNetworkServer)
│       └── register.ts # registerExactTronServerScheme()
├── signer.ts          # TronWeb signer abstractions
├── constants.ts       # CAIP-2 IDs, token addresses, ABI
├── types.ts           # Tron-specific payload types
└── index.ts           # Main exports
```

## CAIP-2 Network Identifiers

| Network | CAIP-2 ID | Constant |
|---------|-----------|----------|
| Tron Mainnet | `tron:27Lqcw` | `TRON_MAINNET` |
| Tron Shasta (Testnet) | `tron:4oPwXB` | `TRON_SHASTA` |
| Tron Nile (Testnet) | `tron:6FhfKq` | `TRON_NILE` |

## Supported Assets

| Token | Mainnet Address | Decimals |
|-------|----------------|----------|
| USDT | `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` | 6 |
| USDC | `TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8` | 6 |

## Payment Flow

```
Client (AI Agent/Wallet)          Facilitator (EruditePay)          Tron Network
        │                                    │                           │
        │  1. GET /resource                  │                           │
        │  ← 402 Payment Required            │                           │
        │    (scheme: exact,                 │                           │
        │     network: tron:27Lqcw,          │                           │
        │     asset: TR7NHqje...,            │                           │
        │     amount: 1000000)               │                           │
        │                                    │                           │
        │  2. Build TRC-20 transfer tx       │                           │
        │     Sign with wallet key           │                           │
        │                                    │                           │
        │  3. POST /verify ──────────────────>│                           │
        │    (signedTransaction, from)       │                           │
        │                                    │  4. Decode & verify       │
        │                                    │     - Valid TRC-20 call   │
        │                                    │     - Correct recipient   │
        │                                    │     - Sufficient amount   │
        │                                    │     - Sender has balance  │
        │  ← { isValid: true }               │                           │
        │                                    │                           │
        │  5. GET /resource (with payment)   │                           │
        │  ──────────────────────────────────>│                           │
        │                                    │  6. Broadcast tx ─────────>│
        │                                    │  ← txID                   │
        │                                    │  7. Confirm ──────────────>│
        │                                    │  ← confirmed              │
        │  ← 200 OK + resource content       │                           │
```

## EruditePay Integration

This plugin includes built-in support for the [EruditePay](https://eruditepay.com) wrapper contract, which provides automated 0.25% fee collection on-chain:

```typescript
registerExactTronScheme(facilitator, {
  signer: toFacilitatorTronSigner(tronWeb),
  networks: TRON_MAINNET,
  config: {
    useWrapperContract: true, // Routes through THGkLBrLY1G5VovZjjK1jP9upyxRdMNL3b
  },
});
```

## Security

The facilitator performs comprehensive verification before broadcasting any transaction:

1. **Scheme/network validation** — Only processes `exact` scheme on Tron networks
2. **Transaction format** — Must be a `TriggerSmartContract` calling `transfer(address,uint256)`
3. **Asset verification** — Token contract must match the required asset (e.g., USDT)
4. **Recipient check** — Transfer destination must match the merchant's `payTo` address
5. **Amount verification** — Transfer amount must meet or exceed required amount
6. **Sender authentication** — Transaction owner must match claimed `from` address
7. **Self-transfer prevention** — Facilitator addresses cannot be the payment sender
8. **Expiration check** — Transaction must not have expired
9. **Balance verification** — Sender must have sufficient token balance

## Contributing

This is an open-source project by Erudite Intelligence LLC. Contributions are welcome.

```bash
git clone https://github.com/erudite-intelligence/x402-tron-v2
cd x402-tron-v2
npm install
npm run build
npm test
```

## License

MIT © [Erudite Intelligence LLC](https://eruditeintelligence.com)

---

**Built by [Erudite Intelligence](https://eruditeintelligence.com) — The first x402 facilitator on Tron.**
