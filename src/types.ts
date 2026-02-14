/**
 * @module @erudite-intelligence/x402-tron-v2 - Types
 * @description Tron-specific payload and signer types for x402 V2
 * @author Erudite Intelligence LLC (Vector)
 * @created 2026-02-13
 * @purpose Define Tron payment payload structures and type guards
 */

// =============================================================================
// Payment Payload Types
// =============================================================================

/**
 * Tron exact payment payload for x402 V2.
 *
 * Unlike EVM (which uses EIP-3009/Permit2 signed authorizations) or SVM
 * (which uses partially-signed transactions), Tron uses a simpler model:
 * the client constructs and signs a TRC-20 transfer transaction, and the
 * facilitator verifies the transaction structure before broadcasting it.
 *
 * Flow:
 * 1. Client builds a TRC-20 transfer tx (from → payTo, amount)
 * 2. Client signs the tx with their private key
 * 3. Client sends the signed tx hex as the payload
 * 4. Facilitator decodes, verifies amounts/recipients, then broadcasts
 */
export interface ExactTronPayloadV2 {
  /**
   * The signed transaction as a JSON-serialized string.
   * Produced by JSON.stringify(tronWeb.trx.sign(tx)).
   * Contains: raw_data, raw_data_hex, txID, signature[], visible.
   */
  signedTransaction: string;

  /**
   * The sender's Tron address (base58 format).
   * Used for verification that the signer matches the transfer `from`.
   */
  from: string;

  /**
   * Optional: transaction ID (txID) for pre-verification.
   * TronWeb generates this deterministically from the transaction data.
   */
  txID?: string;
}

/**
 * Alternative payload: TRC-20 approve + facilitator-executed transfer.
 * The client approves the facilitator to spend their tokens, and the
 * facilitator executes the transferFrom on their behalf.
 *
 * This is more gas-efficient for the client (approve costs less energy
 * than transfer) and gives the facilitator control over execution timing.
 */
export interface ExactTronApprovePayloadV2 {
  /**
   * The approval method used
   */
  method: "approve";

  /**
   * The signed approval transaction in hex format.
   * Approves the facilitator address to spend the exact payment amount.
   */
  signedApproval: string;

  /**
   * The sender's Tron address (base58 format).
   */
  from: string;

  /**
   * The nonce or unique identifier to prevent replay
   */
  nonce: string;
}

/**
 * Union type for all supported Tron exact payloads
 */
export type ExactTronPayload = ExactTronPayloadV2 | ExactTronApprovePayloadV2;

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if a payload is a direct signed transaction payload
 */
export function isSignedTransactionPayload(
  payload: unknown,
): payload is ExactTronPayloadV2 {
  if (typeof payload !== "object" || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.signedTransaction === "string" &&
    typeof p.from === "string" &&
    !("method" in p)
  );
}

/**
 * Check if a payload is an approve-based payload
 */
export function isApprovePayload(
  payload: unknown,
): payload is ExactTronApprovePayloadV2 {
  if (typeof payload !== "object" || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return p.method === "approve" && typeof p.signedApproval === "string";
}

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Configuration for the Tron facilitator.
 *
 * NOTE: useWrapperContract and feeDelegation are RESERVED for future implementation.
 * They are NOT currently active. Setting them has no effect on payment routing.
 * When implemented, useWrapperContract will route payments through the EruditePay
 * wrapper contract for automated on-chain fee deduction. feeDelegation will have
 * the facilitator cover energy costs for senders.
 */
export interface TronFacilitatorConfig {
  /**
   * RESERVED / NOT YET IMPLEMENTED.
   * When implemented: Use EruditePay wrapper contract for automated fee collection.
   * Currently has NO effect — payments always go direct from client to payTo.
   * @default false
   */
  useWrapperContract?: boolean;

  /**
   * Optional: Maximum energy fee (in SUN) the facilitator will pay.
   * Transactions exceeding this limit will be rejected during verification.
   * @default 100_000_000 (100 TRX)
   */
  maxEnergyFeeSun?: number;

  /**
   * RESERVED / NOT YET IMPLEMENTED.
   * When implemented: Facilitator pays energy costs on behalf of sender.
   * Currently has NO effect — sender must have sufficient energy/TRX.
   * @default false
   */
  feeDelegation?: boolean;
}

/**
 * Result of a Tron transaction broadcast
 */
export interface TronBroadcastResult {
  result: boolean;
  txid: string;
  code?: string;
  message?: string;
}
