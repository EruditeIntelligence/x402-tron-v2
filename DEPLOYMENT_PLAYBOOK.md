# EruditePay V2 — Deployment Playbook

**Author:** Claude Opus (Strategy) + Vector (Execution)  
**Date:** 2026-02-13  
**Status:** URGENT — Ship tonight while Stripe/Coinbase x402 wave is hot

---

## What's In This Package

```
x402-tron-v2/
├── src/                          # V2 plugin source (TypeScript)
│   ├── exact/
│   │   ├── facilitator/scheme.ts  # SchemeNetworkFacilitator (verify + settle)
│   │   ├── client/scheme.ts       # SchemeNetworkClient (createPaymentPayload)
│   │   ├── server/scheme.ts       # SchemeNetworkServer (parsePrice)
│   │   └── */register.ts          # Registration helpers
│   ├── signer.ts                  # TronWeb signer abstractions
│   ├── constants.ts               # CAIP-2 IDs, token addresses
│   ├── types.ts                   # Tron payload types
│   └── index.ts                   # All exports
├── contracts/
│   ├── EruditePayV2.sol           # NEW wrapper contract (deploy this)
│   └── deploy-eruditepay-v2.js    # Deployment script + ABI
├── package.json                   # npm package config
├── tsconfig.json
├── tsup.config.ts                 # Build config
└── README.md                      # Documentation
```

---

## Step-by-Step Deployment

### PHASE 1: Deploy the New Contract (30 minutes)

**Why a new contract?** The V1 wrapper (THGkLBrLY1G5VovZjjK1jP9upyxRdMNL3b) is hardcoded with a 
single facilitator. V2 needs multi-facilitator support, nonce replay protection, batch payments, 
and configurable fees. It's a proper upgrade.

**V2 Contract Improvements:**
- Multi-facilitator: register MCRN-1 through MCRN-4 as authorized callers
- Nonce replay protection: per-payer nonce tracking prevents double-spend
- Batch payments: settle up to 20 payments in one transaction (gas efficient)
- Configurable fee: 0.25% default, adjustable by owner (max 5%)
- Emergency pause: kill switch if something goes wrong
- Token rescue: recover any tokens accidentally sent to the contract
- Events: full on-chain logging of every payment

**Steps:**

1. **Open TronIDE:** https://www.tronide.io/
2. **Create new file:** `EruditePayV2.sol`
3. **Paste** the contents of `contracts/EruditePayV2.sol`
4. **Compile:** Select Solidity 0.8.20, enable optimization (200 runs)
5. **Deploy:** 
   - Constructor arg 1 (`_treasury`): Your Kraken deposit T-address
   - Constructor arg 2 (`_feeBasisPoints`): `25` (= 0.25%)
   - Fee limit: 1000 TRX
6. **Note the deployed contract address** (starts with T...)
7. **Verify on Tronscan:** Submit source code for verification

**OR use the script:**
```bash
export TRON_PRIVATE_KEY=your_hex_private_key
export TREASURY_ADDRESS=TYourKrakenDepositAddress
node contracts/deploy-eruditepay-v2.js mainnet deploy
```

### PHASE 2: Register Facilitator Wallets (5 minutes)

After deployment, add your MCRN server wallets as authorized facilitators:

**In TronIDE (click "Write" tab on Tronscan):**
```
addFacilitator(MCRN_1_WALLET_ADDRESS)  // 46.225.17.227
addFacilitator(MCRN_2_WALLET_ADDRESS)  // 46.225.21.154
addFacilitator(MCRN_3_WALLET_ADDRESS)  // If you have wallets for MCRN-3/4
addFacilitator(MCRN_4_WALLET_ADDRESS)
```

**Or via script:**
```bash
node contracts/deploy-eruditepay-v2.js mainnet add-facilitators \
  TNewContractAddress \
  TMCRN1Address TMCRN2Address TMCRN3Address TMCRN4Address
```

### PHASE 3: Update Plugin Constants (5 minutes)

In `src/constants.ts`, update the wrapper contract address:

```typescript
// OLD (V1):
// export const WRAPPER_CONTRACT_ADDRESS = "THGkLBrLY1G5VovZjjK1jP9upyxRdMNL3b";

// NEW (V2):
export const WRAPPER_CONTRACT_ADDRESS = "TYourNewV2ContractAddress";
```

### PHASE 4: Build and Publish npm Package (10 minutes)

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Test locally
npm run test

# Publish to npm
npm version 2.0.0
npm publish --access public
```

Package name: `@erudite-intelligence/x402-tron-v2`
(Or update the existing `@erudite-intelligence/x402-tron` to v2.0.0)

### PHASE 5: Update MCRN Servers (20 minutes)

On each MCRN server, update the facilitator code:

```bash
# SSH into each MCRN server
ssh root@46.225.17.227  # MCRN-1
ssh root@46.225.21.154  # MCRN-2

# Update the package
npm install @erudite-intelligence/x402-tron-v2@latest
# OR if updating existing:
npm update @erudite-intelligence/x402-tron

# Update facilitator code to use V2 registration
# See "MCRN Server Integration" section below

# Restart
pm2 restart all
```

---

## MCRN Server Integration Code

Replace the current facilitator setup on each MCRN server with:

```typescript
/**
 * MCRN Facilitator Server — V2 Integration
 * @author Erudite Intelligence LLC
 * @updated 2026-02-13
 */
import express from 'express';
import { x402Facilitator } from '@x402/core/facilitator';
import {
  registerExactTronScheme,
  toFacilitatorTronSigner,
  TRON_MAINNET,
} from '@erudite-intelligence/x402-tron-v2';
import TronWeb from 'tronweb';

// Initialize TronWeb with this server's facilitator key
const tronWeb = new TronWeb({
  fullHost: 'https://api.trongrid.io',
  privateKey: process.env.TRON_FACILITATOR_PRIVATE_KEY,
});

// Create V2 facilitator
const facilitator = new x402Facilitator();

// Register Tron exact scheme
registerExactTronScheme(facilitator, {
  signer: toFacilitatorTronSigner(tronWeb),
  networks: TRON_MAINNET,
  config: {
    useWrapperContract: true,
    feeDelegation: true,
  },
});

// Express endpoints (match x402 facilitator API)
const app = express();
app.use(express.json());

// GET /supported — What payment types this facilitator handles
app.get('/supported', (req, res) => {
  res.json(facilitator.getSupported());
});

// POST /verify — Verify a payment payload
app.post('/verify', async (req, res) => {
  try {
    const { paymentPayload, paymentRequirements } = req.body;
    const result = await facilitator.verify(paymentPayload, paymentRequirements);
    res.json(result);
  } catch (error) {
    res.status(500).json({ isValid: false, invalidReason: error.message });
  }
});

// POST /settle — Verify and execute the payment
app.post('/settle', async (req, res) => {
  try {
    const { paymentPayload, paymentRequirements } = req.body;
    const result = await facilitator.settle(paymentPayload, paymentRequirements);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, errorReason: error.message, transaction: '' });
  }
});

const PORT = process.env.PORT || 4020;
app.listen(PORT, () => {
  console.log(`[x402-tron] Facilitator running on port ${PORT}`);
  console.log(`[x402-tron] Network: tron:27Lqcw (mainnet)`);
  console.log(`[x402-tron] Wallet: ${tronWeb.defaultAddress.base58}`);
});
```

---

## V1 vs V2 Contract Comparison

| Feature | V1 (THGkLB...) | V2 (New) |
|---------|---------------|----------|
| Facilitators | Single hardcoded | Multi-address, add/remove |
| Replay protection | None | Per-payer nonce tracking |
| Batch payments | No | Yes (up to 20) |
| Fee | Hardcoded 0.25% | Configurable (0-5%) |
| Pause | No | Emergency pause/unpause |
| Token rescue | No | Owner can recover stuck tokens |
| Events | Minimal | Full event logging |
| x402 V2 compatible | No | Yes — nonce field maps to x402 nonce |

---

## Revenue Path

```
Client pays $1.00 USDT
       ↓
EruditePayV2 contract receives $1.00
       ↓
Fee: $1.00 × 0.25% = $0.0025 → Treasury (Kraken deposit)
Net: $0.9975 → Merchant (payTo address)
       ↓
Kraken auto-converts to fiat if desired
```

---

## Testing Checklist

Before going live:

- [ ] Contract deployed on Nile testnet first
- [ ] executePayment() works with test USDT
- [ ] Batch payment works
- [ ] Nonce replay rejected
- [ ] Non-facilitator call rejected
- [ ] Pause stops payments
- [ ] Fee calculation matches (use previewPayment view function)
- [ ] npm package builds (`npm run build`)
- [ ] npm package published
- [ ] MCRN-1 updated and responding on /supported
- [ ] MCRN-2 updated and responding on /supported
- [ ] Load balancer routes to both servers
- [ ] End-to-end test: client → server → facilitator → Tron

---

## Emergency Contacts

- **Contract pause:** Call `setPaused(true)` from owner wallet
- **Remove compromised facilitator:** Call `setFacilitator(addr, false)` from owner
- **Rescue stuck tokens:** Call `rescueTokens(token, toAddr, amount)` from owner
