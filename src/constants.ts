/**
 * @module @erudite-intelligence/x402-tron-v2 - Constants
 * @description Tron network constants for x402 V2 plugin
 * @author Erudite Intelligence LLC (Vector)
 * @created 2026-02-13
 * @purpose Define CAIP-2 identifiers, asset addresses, and network configuration for Tron
 */

// =============================================================================
// CAIP-2 Network Identifiers
// Format: tron:<genesis_block_hash_prefix>
// Reference: https://docs.offblocks.xyz/developer-guides/api-integration/blockchain-identifiers
// =============================================================================

/** Tron Mainnet CAIP-2 identifier */
export const TRON_MAINNET = "tron:27Lqcw" as const;

/** Tron Shasta Testnet CAIP-2 identifier */
export const TRON_SHASTA = "tron:4oPwXB" as const;

/** Tron Nile Testnet CAIP-2 identifier */
export const TRON_NILE = "tron:6FhfKq" as const;

/** CAIP-2 family pattern for Tron networks */
export const TRON_CAIP_FAMILY = "tron:*" as const;

/** All supported Tron networks for V2 registration */
export const TRON_NETWORKS = [TRON_MAINNET, TRON_SHASTA, TRON_NILE] as const;

/** All supported Tron networks for V1 backwards compatibility */
export const TRON_V1_NETWORKS = [TRON_MAINNET] as const;

// =============================================================================
// RPC Endpoints
// =============================================================================

/** Default RPC endpoints per CAIP-2 network identifier */
export const TRON_RPC_URLS: Record<string, string> = {
  [TRON_MAINNET]: "https://api.trongrid.io",
  [TRON_SHASTA]: "https://api.shasta.trongrid.io",
  [TRON_NILE]: "https://nile.trongrid.io",
};

// =============================================================================
// Token Addresses (Base58)
// =============================================================================

/** USDT TRC-20 contract addresses by CAIP-2 network */
export const USDT_ADDRESSES: Record<string, string> = {
  [TRON_MAINNET]: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
  [TRON_SHASTA]: "TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs", // Shasta USDT
  [TRON_NILE]: "TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj",   // Nile USDT
};

/** USDC TRC-20 contract addresses by CAIP-2 network */
export const USDC_ADDRESSES: Record<string, string> = {
  [TRON_MAINNET]: "TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8",
};

/** USDT decimals (6) - same across all TRC-20 USDT deployments */
export const USDT_DECIMALS = 6;

/** USDC decimals (6) */
export const USDC_DECIMALS = 6;

// =============================================================================
// EruditePay Wrapper Contract
// The hands-free x402 wrapper contract deployed on Tron mainnet.
// Collects 0.25% facilitator fee automatically on-chain.
// =============================================================================

/** EruditePay wrapper contract address on Tron mainnet */
export const ERUDITEPAY_WRAPPER_CONTRACT = "THGkLBrLY1G5VovZjjK1jP9upyxRdMNL3b";

/** EruditePay facilitator fee: 0.25% (25 basis points) */
export const ERUDITEPAY_FEE_BPS = 25;

// =============================================================================
// TRC-20 ABI (minimal for transfer operations)
// =============================================================================

/** Minimal TRC-20 ABI for transfer and balance operations */
export const TRC20_ABI = [
  {
    constant: false,
    inputs: [
      { name: "_to", type: "address" },
      { name: "_value", type: "uint256" },
    ],
    name: "transfer",
    outputs: [{ name: "", type: "bool" }],
    type: "Function",
  },
  {
    constant: true,
    inputs: [{ name: "_owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "balance", type: "uint256" }],
    type: "Function",
  },
  {
    constant: true,
    inputs: [
      { name: "_owner", type: "address" },
      { name: "_spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ name: "remaining", type: "uint256" }],
    type: "Function",
  },
  {
    constant: false,
    inputs: [
      { name: "_spender", type: "address" },
      { name: "_value", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    type: "Function",
  },
  {
    constant: true,
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    type: "Function",
  },
] as const;

// =============================================================================
// Energy/Bandwidth Defaults
// =============================================================================

/**
 * Estimated energy cost for a TRC-20 transfer.
 * Used for pre-flight checks. Actual cost may vary.
 */
export const ESTIMATED_TRC20_TRANSFER_ENERGY = 65_000;

/**
 * Estimated bandwidth cost for a TRC-20 transfer (in bytes).
 * Used for pre-flight checks.
 */
export const ESTIMATED_TRC20_TRANSFER_BANDWIDTH = 350;

/**
 * Maximum acceptable energy fee for a facilitator-paid transaction (in SUN).
 * 100 TRX = 100_000_000 SUN. Prevents runaway costs.
 */
export const MAX_ENERGY_FEE_SUN = 100_000_000;
