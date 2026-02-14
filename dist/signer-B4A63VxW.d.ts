/**
 * @module @erudite-intelligence/x402-tron-v2 - Signer
 * @description TronWeb signer abstraction for x402 V2 facilitator and client operations
 * @author Erudite Intelligence LLC (Vector)
 * @created 2026-02-13
 * @purpose Provide a clean signer interface matching x402 V2 patterns (EVM/SVM parity)
 */
/**
 * Client-side signer for creating and signing Tron transactions.
 * Wraps a TronWeb instance with a connected wallet.
 */
type ClientTronSigner = {
    /** The Tron address (base58) of the signer */
    readonly address: string;
    /**
     * Sign a transaction object and return the signed transaction hex
     * @param transaction - The unsigned Tron transaction object
     * @returns Signed transaction object with signature
     */
    signTransaction(transaction: Record<string, unknown>): Promise<Record<string, unknown>>;
    /**
     * Build a TRC-20 transfer transaction (unsigned)
     * @param contractAddress - TRC-20 token contract address
     * @param to - Recipient address
     * @param amount - Amount in smallest unit (e.g., 1000000 for 1 USDT)
     * @returns Unsigned transaction object
     */
    buildTrc20Transfer(contractAddress: string, to: string, amount: string): Promise<Record<string, unknown>>;
};
/**
 * Minimal facilitator signer interface for Tron operations.
 * Supports multiple addresses for load balancing.
 * All implementation details (TronWeb instances, key management) are hidden.
 *
 * Mirrors the FacilitatorSvmSigner and FacilitatorEvmSigner patterns
 * from the official x402 SDK for consistency.
 */
type FacilitatorTronSigner = {
    /**
     * Get all addresses this facilitator can use for operations.
     * Enables dynamic address selection for load balancing.
     * @returns Array of base58 Tron addresses
     */
    getAddresses(): readonly string[];
    /**
     * Verify a signed transaction without broadcasting.
     * Checks: valid signature, correct format, sender matches claimed address.
     * @param signedTxHex - The signed transaction in hex
     * @param network - CAIP-2 network identifier (e.g., "tron:27Lqcw")
     * @returns Decoded transaction details for further verification
     */
    decodeTransaction(signedTxHex: string, network: string): Promise<DecodedTronTransaction>;
    /**
     * Broadcast a signed transaction to the Tron network.
     * @param signedTxHex - The signed transaction in hex
     * @param network - CAIP-2 network identifier
     * @returns Transaction hash (txID) on success
     * @throws Error if broadcast fails
     */
    broadcastTransaction(signedTxHex: string, network: string): Promise<string>;
    /**
     * Wait for transaction confirmation on the Tron network.
     * Polls until the transaction is confirmed or timeout.
     * @param txID - Transaction ID to confirm
     * @param network - CAIP-2 network identifier
     * @throws Error if confirmation fails or times out
     */
    confirmTransaction(txID: string, network: string): Promise<void>;
    /**
     * Get the TRC-20 token balance for an address.
     * @param tokenAddress - TRC-20 contract address
     * @param ownerAddress - Address to check balance for
     * @param network - CAIP-2 network identifier
     * @returns Balance in smallest unit (string)
     */
    getTokenBalance(tokenAddress: string, ownerAddress: string, network: string): Promise<string>;
    /**
     * Estimate the energy cost of a TRC-20 transfer.
     * @param tokenAddress - TRC-20 contract address
     * @param from - Sender address
     * @param to - Recipient address
     * @param amount - Transfer amount
     * @param network - CAIP-2 network identifier
     * @returns Estimated energy cost
     */
    estimateEnergy(tokenAddress: string, from: string, to: string, amount: string, network: string): Promise<number>;
};
/**
 * Decoded Tron transaction details for verification
 */
interface DecodedTronTransaction {
    /** Transaction ID */
    txID: string;
    /** The contract type (e.g., "TriggerSmartContract") */
    contractType: string;
    /** The contract address being called */
    contractAddress: string;
    /** The function selector (first 4 bytes of keccak256 of function signature) */
    functionSelector: string;
    /** Decoded function parameters */
    parameters: {
        /** Recipient address (for transfer) */
        to?: string;
        /** Amount (for transfer) */
        amount?: string;
        /** Spender address (for approve) */
        spender?: string;
    };
    /** The sender (owner) address */
    ownerAddress: string;
    /** Transaction expiration timestamp */
    expiration: number;
    /** Raw signed transaction object */
    rawTransaction: Record<string, unknown>;
}
/**
 * Create a FacilitatorTronSigner from a TronWeb instance.
 *
 * @param tronWeb - TronWeb instance with private key configured
 * @param options - Optional configuration
 * @returns FacilitatorTronSigner ready for x402 V2 operations
 *
 * @example
 * ```typescript
 * import TronWeb from "tronweb";
 * import { toFacilitatorTronSigner } from "@erudite-intelligence/x402-tron-v2";
 *
 * const tronWeb = new TronWeb({
 *   fullHost: "https://api.trongrid.io",
 *   privateKey: process.env.TRON_PRIVATE_KEY,
 * });
 *
 * const signer = toFacilitatorTronSigner(tronWeb);
 * ```
 */
declare function toFacilitatorTronSigner(tronWeb: any, options?: {
    additionalRpcUrls?: Record<string, string>;
}): FacilitatorTronSigner;
/**
 * Create a ClientTronSigner from a TronWeb instance.
 *
 * @param tronWeb - TronWeb instance with private key configured
 * @returns ClientTronSigner for creating payment payloads
 *
 * @example
 * ```typescript
 * import TronWeb from "tronweb";
 * import { toClientTronSigner } from "@erudite-intelligence/x402-tron-v2";
 *
 * const tronWeb = new TronWeb({
 *   fullHost: "https://api.trongrid.io",
 *   privateKey: process.env.TRON_PRIVATE_KEY,
 * });
 *
 * const signer = toClientTronSigner(tronWeb);
 * ```
 */
declare function toClientTronSigner(tronWeb: any): ClientTronSigner;

export { type ClientTronSigner as C, type DecodedTronTransaction as D, type FacilitatorTronSigner as F, toFacilitatorTronSigner as a, toClientTronSigner as t };
