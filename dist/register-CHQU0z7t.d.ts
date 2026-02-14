import { x402Facilitator } from '@x402/core/facilitator';
import { Network } from '@x402/core/types';
import { F as FacilitatorTronSigner } from './signer-B4A63VxW.js';

/**
 * @module @erudite-intelligence/x402-tron-v2 - Types
 * @description Tron-specific payload and signer types for x402 V2
 * @author Erudite Intelligence LLC (Vector)
 * @created 2026-02-13
 * @purpose Define Tron payment payload structures and type guards
 */
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
interface ExactTronPayloadV2 {
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
interface ExactTronApprovePayloadV2 {
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
type ExactTronPayload = ExactTronPayloadV2 | ExactTronApprovePayloadV2;
/**
 * Check if a payload is a direct signed transaction payload
 */
declare function isSignedTransactionPayload(payload: unknown): payload is ExactTronPayloadV2;
/**
 * Check if a payload is an approve-based payload
 */
declare function isApprovePayload(payload: unknown): payload is ExactTronApprovePayloadV2;
/**
 * Configuration for the Tron facilitator.
 *
 * NOTE: useWrapperContract and feeDelegation are RESERVED for future implementation.
 * They are NOT currently active. Setting them has no effect on payment routing.
 * When implemented, useWrapperContract will route payments through the EruditePay
 * wrapper contract for automated on-chain fee deduction. feeDelegation will have
 * the facilitator cover energy costs for senders.
 */
interface TronFacilitatorConfig {
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
interface TronBroadcastResult {
    result: boolean;
    txid: string;
    code?: string;
    message?: string;
}

/**
 * @module @erudite-intelligence/x402-tron-v2 - Facilitator Registration
 * @description Registration helper to add Tron support to any x402 V2 facilitator
 * @author Erudite Intelligence LLC (Vector)
 * @created 2026-02-13
 * @purpose One-line registration of Tron exact scheme into x402Facilitator
 *
 * CHANGELOG:
 * - 2026-02-13: Initial implementation. Mirrors registerExactEvmScheme/registerExactSvmScheme patterns.
 */

/**
 * Configuration options for registering Tron schemes to an x402Facilitator
 */
interface TronFacilitatorRegistrationConfig {
    /**
     * The Tron signer for facilitator operations (verify and settle)
     */
    signer: FacilitatorTronSigner;
    /**
     * Networks to register (single network or array of networks).
     * Defaults to all Tron networks (mainnet, Shasta, Nile).
     *
     * @example
     * // Single network
     * networks: "tron:27Lqcw"
     *
     * @example
     * // Multiple networks
     * networks: ["tron:27Lqcw", "tron:4oPwXB"]
     *
     * @default TRON_NETWORKS (all supported Tron networks)
     */
    networks?: Network | Network[];
    /**
     * Optional scheme-level configuration
     */
    config?: TronFacilitatorConfig;
}
/**
 * Registers Tron exact payment schemes to an x402Facilitator instance.
 *
 * This is the primary integration point for adding Tron support to any
 * x402 V2 facilitator. Call this alongside registerExactEvmScheme and
 * registerExactSvmScheme to build a multi-chain facilitator.
 *
 * @param facilitator - The x402Facilitator instance to register schemes to
 * @param config - Configuration for Tron facilitator registration
 * @returns The facilitator instance for chaining
 *
 * @example
 * ```typescript
 * import { x402Facilitator } from "@x402/core/facilitator";
 * import { registerExactEvmScheme } from "@x402/evm/exact/facilitator/register";
 * import { registerExactTronScheme } from "@erudite-intelligence/x402-tron-v2/exact/facilitator/register";
 * import { toFacilitatorTronSigner } from "@erudite-intelligence/x402-tron-v2";
 * import TronWeb from "tronweb";
 *
 * const facilitator = new x402Facilitator();
 *
 * // Register EVM chains (Base, Ethereum, etc.)
 * registerExactEvmScheme(facilitator, { signer: evmSigner, networks: "eip155:8453" });
 *
 * // Register Tron (USDT TRC-20)
 * const tronWeb = new TronWeb({ fullHost: "https://api.trongrid.io", privateKey: "..." });
 * const tronSigner = toFacilitatorTronSigner(tronWeb);
 * registerExactTronScheme(facilitator, { signer: tronSigner });
 *
 * // Facilitator now handles both Base USDC and Tron USDT!
 * ```
 */
declare function registerExactTronScheme(facilitator: x402Facilitator, config: TronFacilitatorRegistrationConfig): x402Facilitator;

export { type ExactTronApprovePayloadV2 as E, type TronBroadcastResult as T, type ExactTronPayload as a, type ExactTronPayloadV2 as b, type TronFacilitatorConfig as c, type TronFacilitatorRegistrationConfig as d, isSignedTransactionPayload as e, isApprovePayload as i, registerExactTronScheme as r };
