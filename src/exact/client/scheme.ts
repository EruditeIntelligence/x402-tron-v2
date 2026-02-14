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

import type {
  PaymentRequirements,
  SchemeNetworkClient,
  PaymentPayloadResult,
} from "@x402/core/types";
import type { ClientTronSigner } from "../../signer";

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
export class ExactTronScheme implements SchemeNetworkClient {
  readonly scheme = "exact";

  /**
   * Creates a new ExactTronScheme client instance.
   *
   * @param signer - The Tron signer for client operations
   */
  constructor(private readonly signer: ClientTronSigner) {}

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
  async createPaymentPayload(
    x402Version: number,
    paymentRequirements: PaymentRequirements,
  ): Promise<PaymentPayloadResult> {
    // Build the TRC-20 transfer transaction
    const unsignedTx = await this.signer.buildTrc20Transfer(
      paymentRequirements.asset,    // Token contract (e.g., USDT TRC-20)
      paymentRequirements.payTo,    // Merchant address
      paymentRequirements.amount,   // Amount in smallest unit
    );

    // Sign the transaction
    const signedTx = await this.signer.signTransaction(unsignedTx);

    // Package as x402 payload
    return {
      x402Version,
      payload: {
        signedTransaction: JSON.stringify(signedTx),
        from: this.signer.address,
        txID: (signedTx as Record<string, unknown>).txID as string | undefined,
      },
    };
  }
}
