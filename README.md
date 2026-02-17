# @erudite-intelligence/x402-tron-v2

The first and only [x402](https://x402.org) V2 protocol implementation for the **TRON** blockchain. Enables USDT TRC-20 payments for AI agents, APIs, and web services using the HTTP 402 Payment Required standard.

Built by [Erudite Intelligence LLC](https://eruditepay.com) — FinCEN-registered MSB.

## How It Works

Tron does not support EIP-3009 (`transferWithAuthorization`). This plugin uses an alternative approach that provides the same security guarantees:

1. **Client** creates a `TriggerSmartContract` transaction calling the standard TRC-20 `transfer(address, uint256)` function.
2. **Client** signs the transaction but does **not** broadcast it.
3. The signed transaction is sent to the resource server via the `PAYMENT-SIGNATURE` HTTP header.
4. The **facilitator** verifies the signature, recipient, amount, and token — then broadcasts the transaction on settlement.

No custom contracts are required. Payments use the standard USDT TRC-20 contract directly. The facilitator pays energy and bandwidth costs on behalf of the sender.

## Install

```bash
npm install @erudite-intelligence/x402-tron-v2
```

**Peer dependencies:**

```bash
npm install @x402/core tronweb
```

| Dependency | Version |
|---|---|
| `@x402/core` | `>=2.3.0` |
| `tronweb` | `>=6.0.0` |

## Supported Networks

This plugin uses [CAIP-2](https://namespaces.chainagnostic.org/) identifiers:

| Network | CAIP-2 ID | Status |
|---|---|---|
| Mainnet | `tron:27Lqcw` | Production |
| Shasta Testnet | `tron:4oPwXB` | Testing |
| Nile Testnet | `tron:6FhfKq` | Testing |

**Supported assets:**

| Token | Mainnet Address | Decimals |
|---|---|---|
| USDT | `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` | 6 |

## Usage

### Facilitator (Verify & Settle Payments)

```typescript
import { x402Facilitator } from "@x402/core/facilitator";
import { registerExactTronFacilitatorScheme } from "@erudite-intelligence/x402-tron-v2/exact/facilitator/register";
import TronWeb from "tronweb";

const tronWeb = new TronWeb({
  fullHost: "https://api.trongrid.io",
  privateKey: process.env.FACILITATOR_PRIVATE_KEY,
});

const facilitator = new x402Facilitator();

registerExactTronFacilitatorScheme(facilitator, {
  tronWeb,
  maxEnergyFeeSun: 100_000_000, // Max 100 TRX in energy costs
});

// The facilitator now handles Tron payments via /verify and /settle
```

### Client (Create Payment Payloads)

```typescript
import { x402Client } from "@x402/core/client";
import { registerExactTronClientScheme } from "@erudite-intelligence/x402-tron-v2/exact/client/register";
import TronWeb from "tronweb";

const tronWeb = new TronWeb({
  fullHost: "https://api.trongrid.io",
  privateKey: process.env.CLIENT_PRIVATE_KEY,
});

const client = new x402Client();

registerExactTronClientScheme(client, { tronWeb });

// Client is ready to sign Tron payment payloads
```

### Server (Resource Server Middleware)

```typescript
import { x402ResourceServer } from "@x402/core/server";
import { registerExactTronServerScheme } from "@erudite-intelligence/x402-tron-v2/exact/server/register";

const server = new x402ResourceServer(facilitatorClient);

registerExactTronServerScheme(server);

// Use with Express, Hono, Next.js, etc.
// Example with Express:
app.use(
  paymentMiddleware(
    {
      "GET /api/data": {
        accepts: {
          scheme: "exact",
          network: "tron:27Lqcw",
          price: "$0.01",
          payTo: "TYourMerchantTronAddress",
        },
        description: "Access to premium data",
      },
    },
    server,
  ),
);
```

## Package Exports

```typescript
// Main entry — constants, types, helpers
import { TRON_NETWORKS, getUsdtAddress, usdToUsdt } from "@erudite-intelligence/x402-tron-v2";

// Facilitator (verify + settle)
import { ExactTronFacilitatorScheme } from "@erudite-intelligence/x402-tron-v2/exact/facilitator";
import { registerExactTronFacilitatorScheme } from "@erudite-intelligence/x402-tron-v2/exact/facilitator/register";

// Client (create payment payloads)
import { ExactTronClientScheme } from "@erudite-intelligence/x402-tron-v2/exact/client";
import { registerExactTronClientScheme } from "@erudite-intelligence/x402-tron-v2/exact/client/register";

// Server (resource server integration)
import { ExactTronServerScheme } from "@erudite-intelligence/x402-tron-v2/exact/server";
import { registerExactTronServerScheme } from "@erudite-intelligence/x402-tron-v2/exact/server/register";
```

## Security

This package has been independently audited:

- **Grok (xAI):** Identified critical signature verification bypass and phantom feature claims. All findings resolved.
- **Gemini (Google):** Approved for production after security fixes applied.
- **17 attack-scenario tests** covering signature forgery, transaction tampering, replay attacks, ABI manipulation, and amount spoofing — all passing.

**Key security properties:**

- Transactions are decoded and the signature is verified via ECRecover before any verification or settlement occurs.
- The transaction ID is recomputed from `raw_data_hex` to detect tampering.
- A second-layer signature verification runs in `settle()` before broadcast as a belt-and-suspenders defense.
- ABI data length is validated before parsing to prevent malformed input attacks.

## Roadmap

The following features are defined in the type system but are **not yet implemented**. They have no effect if configured and will be activated in future releases:

- `useWrapperContract` — Route payments through the EruditePay wrapper contract for automated on-chain fee collection.
- `feeDelegation` — Facilitator covers energy costs on behalf of the sender.

## Related

- [x402 Protocol](https://x402.org) — The open standard for internet-native payments
- [coinbase/x402](https://github.com/coinbase/x402) — Official x402 repository
- [@x402/core](https://www.npmjs.com/package/@x402/core) — Core x402 protocol library
- [@x402/evm](https://www.npmjs.com/package/@x402/evm) — EVM implementation (Base, Ethereum, Polygon, etc.)
- [x402-solana](https://www.npmjs.com/package/x402-solana) — Solana implementation

## Why Tron

- **Largest USDT network:** 95%+ of Tether's circulating supply lives on Tron.
- **Dominant payment rail:** De facto stablecoin infrastructure across Southeast Asia, Africa, and Latin America.
- **Sub-cent transaction costs:** $0.001–$0.01 per transfer.
- **3-second block finality.**
- **No existing x402 Tron support.** This package fills that gap.

## Author

**Erudite Intelligence LLC**
FinCEN-registered Money Services Business
[eruditepay.com](https://eruditepay.com)

## License

MIT
