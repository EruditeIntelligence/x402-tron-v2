import { SchemeNetworkFacilitator, PaymentPayload, PaymentRequirements, VerifyResponse, SettleResponse } from '@x402/core/types';
import { F as FacilitatorTronSigner } from '../../signer-B4A63VxW.mjs';
import { c as TronFacilitatorConfig } from '../../register-BnsSDUm5.mjs';
export { d as TronFacilitatorRegistrationConfig, r as registerExactTronScheme } from '../../register-BnsSDUm5.mjs';
import '@x402/core/facilitator';

/**
 * @module @erudite-intelligence/x402-tron-v2 - Facilitator Scheme
 * @description x402 V2 facilitator implementation for the Tron exact payment scheme.
 *   Verifies and settles TRC-20 payment transactions on the Tron network.
 * @author Erudite Intelligence LLC (Vector)
 * @created 2026-02-13
 * @purpose First x402 V2 facilitator for Tron - verify signed TRC-20 transfers and broadcast them
 *
 * CHANGELOG:
 * - 2026-02-13: Initial implementation. Supports signed TRC-20 transfer verification and settlement.
 */

/**
 * Tron facilitator implementation for the Exact payment scheme.
 *
 * Verification flow:
 * 1. Decode the signed transaction
 * 2. Verify it's a TRC-20 transfer to the correct recipient
 * 3. Verify the transfer amount meets requirements
 * 4. Verify the token contract matches the required asset
 * 5. Verify the sender has sufficient token balance
 * 6. Verify the transaction hasn't expired
 *
 * Settlement flow:
 * 1. Re-verify the payment (verify() is called internally)
 * 2. Broadcast the signed transaction to the Tron network
 * 3. Wait for confirmation
 * 4. Return the transaction hash
 */
declare class ExactTronScheme implements SchemeNetworkFacilitator {
    private readonly signer;
    readonly scheme = "exact";
    readonly caipFamily = "tron:*";
    private readonly config;
    /**
     * Creates a new ExactTronScheme facilitator instance.
     *
     * @param signer - The Tron signer for facilitator operations
     * @param config - Optional configuration for the facilitator
     */
    constructor(signer: FacilitatorTronSigner, config?: TronFacilitatorConfig);
    /**
     * Get mechanism-specific extra data for the supported kinds endpoint.
     *
     * Currently returns minimal metadata. energyDelegation and wrapperContract
     * will be exposed here once those features are implemented.
     *
     * @param _network - The network identifier (currently unused)
     * @returns Extra data for clients, or undefined if no extra data
     */
    getExtra(_network: string): Record<string, unknown> | undefined;
    /**
     * Get signer addresses used by this facilitator.
     * @param _network - The network identifier (unused - Tron addresses are network-agnostic)
     * @returns Array of facilitator Tron addresses (base58)
     */
    getSigners(_network: string): string[];
    /**
     * Verifies a Tron payment payload.
     *
     * Security checks performed:
     * - Scheme and network validation
     * - Transaction format validation (must be a TRC-20 transfer)
     * - Token contract matches required asset
     * - Recipient matches payTo address
     * - Amount meets or exceeds required amount
     * - Sender has sufficient token balance
     * - Transaction has not expired
     * - Facilitator address is NOT the sender (prevent self-transfers)
     *
     * @param payload - The payment payload to verify
     * @param requirements - The payment requirements
     * @returns Promise resolving to verification response
     */
    verify(payload: PaymentPayload, requirements: PaymentRequirements): Promise<VerifyResponse>;
    /**
     * Settles a payment by broadcasting the signed transaction to the Tron network.
     *
     * @param payload - The payment payload to settle
     * @param requirements - The payment requirements
     * @returns Promise resolving to settlement response with transaction hash
     */
    settle(payload: PaymentPayload, requirements: PaymentRequirements): Promise<SettleResponse>;
}

export { ExactTronScheme };
