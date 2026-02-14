import { SchemeNetworkClient, PaymentRequirements, PaymentPayloadResult } from '@x402/core/types';
import { C as ClientTronSigner } from '../../signer-B4A63VxW.js';
export { TronClientConfig, registerExactTronClientScheme } from './register.js';
import '@x402/core/client';

/**
 * @module @erudite-intelligence/x402-tron-v2 - Client Scheme
 * @description x402 V2 client implementation for creating Tron payment payloads.
 *   Builds and signs TRC-20 transfer transactions for x402 payments.
 * @author Erudite Intelligence LLC (Vector)
 * @created 2026-02-13
 * @purpose Enable x402 clients (AI agents, wallets) to create Tron payment payloads
 *
 * CHANGELOG:
 * - 2026-02-13: Initial implementation. Signed TRC-20 transfer payload creation.
 */

/**
 * Tron client implementation for the Exact payment scheme.
 *
 * Creates payment payloads by:
 * 1. Building a TRC-20 transfer transaction (to: payTo, amount: required amount)
 * 2. Signing it with the client's private key
 * 3. Returning the signed transaction as the payload
 *
 * The facilitator will then verify and broadcast this transaction.
 */
declare class ExactTronScheme implements SchemeNetworkClient {
    private readonly signer;
    readonly scheme = "exact";
    /**
     * Creates a new ExactTronScheme client instance.
     *
     * @param signer - The Tron signer for client operations
     */
    constructor(signer: ClientTronSigner);
    /**
     * Creates a payment payload for the Exact scheme on Tron.
     *
     * Builds a TRC-20 transfer transaction targeting the merchant's (payTo) address
     * for the required amount, signs it, and packages it as an x402 payload.
     *
     * @param x402Version - The x402 protocol version
     * @param paymentRequirements - The payment requirements from the resource server
     * @returns Promise resolving to a payment payload result
     *
     * @example
     * ```typescript
     * const client = new ExactTronScheme(signer);
     * const payload = await client.createPaymentPayload(2, {
     *   scheme: "exact",
     *   network: "tron:27Lqcw",
     *   asset: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", // USDT
     *   amount: "1000000", // 1 USDT
     *   payTo: "TRecipientAddress...",
     *   maxTimeoutSeconds: 300,
     *   extra: {},
     * });
     * ```
     */
    createPaymentPayload(x402Version: number, paymentRequirements: PaymentRequirements): Promise<PaymentPayloadResult>;
}

export { ExactTronScheme };
