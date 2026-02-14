/**
 * @module @erudite-intelligence/x402-tron-v2
 * @description x402 Payment Protocol V2 - Tron Network Plugin
 *
 * The first and only x402 V2 implementation for the TRON blockchain.
 * Enables USDT TRC-20 payments for AI agents, web services, and merchants
 * through the x402 payment protocol.
 *
 * @author Erudite Intelligence LLC (Vector)
 * @created 2026-02-13
 * @license MIT
 *
 * @example
 * ```typescript
 * // Facilitator setup (processing payments)
 * import { x402Facilitator } from "@x402/core/facilitator";
 * import { registerExactTronScheme, toFacilitatorTronSigner } from "@erudite-intelligence/x402-tron-v2";
 * import TronWeb from "tronweb";
 *
 * const tronWeb = new TronWeb({ fullHost: "https://api.trongrid.io", privateKey: "..." });
 * const facilitator = new x402Facilitator();
 * registerExactTronScheme(facilitator, {
 *   signer: toFacilitatorTronSigner(tronWeb),
 *   networks: "tron:27Lqcw", // Tron mainnet
 * });
 * ```
 */

// =============================================================================
// Exact Scheme Exports
// =============================================================================

// Facilitator (verify & settle)
export { ExactTronScheme as ExactTronFacilitatorScheme } from "./exact/facilitator";
export { registerExactTronScheme } from "./exact/facilitator";
export type { TronFacilitatorRegistrationConfig } from "./exact/facilitator";

// Client (create payment payloads)
export { ExactTronScheme as ExactTronClientScheme } from "./exact/client";
export { registerExactTronClientScheme } from "./exact/client";
export type { TronClientConfig } from "./exact/client";

// Server (resource server / merchant)
export { ExactTronScheme as ExactTronServerScheme } from "./exact/server";
export { registerExactTronServerScheme } from "./exact/server";
export type { TronServerConfig } from "./exact/server";

// =============================================================================
// Signer Exports
// =============================================================================

export { toFacilitatorTronSigner, toClientTronSigner } from "./signer";
export type {
  FacilitatorTronSigner,
  ClientTronSigner,
  DecodedTronTransaction,
} from "./signer";

// =============================================================================
// Type Exports
// =============================================================================

export type {
  ExactTronPayloadV2,
  ExactTronApprovePayloadV2,
  ExactTronPayload,
  TronFacilitatorConfig,
  TronBroadcastResult,
} from "./types";
export { isSignedTransactionPayload, isApprovePayload } from "./types";

// =============================================================================
// Constant Exports
// =============================================================================

// Import constants used locally in utility functions below
import { USDT_ADDRESSES as _USDT_ADDRESSES, USDT_DECIMALS as _USDT_DECIMALS } from "./constants";

export {
  TRON_MAINNET,
  TRON_SHASTA,
  TRON_NILE,
  TRON_CAIP_FAMILY,
  TRON_NETWORKS,
  TRON_RPC_URLS,
  USDT_ADDRESSES,
  USDC_ADDRESSES,
  USDT_DECIMALS,
  USDC_DECIMALS,
  ERUDITEPAY_WRAPPER_CONTRACT,
  ERUDITEPAY_FEE_BPS,
  TRC20_ABI,
} from "./constants";

// =============================================================================
// Utility Exports
// =============================================================================

/**
 * Helper to get the USDT address for a given Tron CAIP-2 network.
 * @param network - CAIP-2 network identifier (e.g., "tron:27Lqcw")
 * @returns USDT TRC-20 contract address or undefined
 */
export function getUsdtAddress(network: string): string | undefined {
  return _USDT_ADDRESSES[network];
}

/**
 * Helper to convert a decimal USD amount to USDT smallest unit.
 * @param usdAmount - Amount in USD (e.g., 1.50)
 * @returns Amount in USDT smallest unit (e.g., "1500000")
 */
export function usdToUsdt(usdAmount: number): string {
  return Math.round(usdAmount * 10 ** _USDT_DECIMALS).toString();
}
