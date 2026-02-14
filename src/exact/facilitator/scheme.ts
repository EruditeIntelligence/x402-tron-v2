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

import type {
  PaymentPayload,
  PaymentRequirements,
  SchemeNetworkFacilitator,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import type { FacilitatorTronSigner } from "../../signer";
import type { ExactTronPayloadV2, TronFacilitatorConfig } from "../../types";
import { isSignedTransactionPayload } from "../../types";

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
export class ExactTronScheme implements SchemeNetworkFacilitator {
  readonly scheme = "exact";
  readonly caipFamily = "tron:*";
  private readonly config: Required<TronFacilitatorConfig>;

  /**
   * Creates a new ExactTronScheme facilitator instance.
   *
   * @param signer - The Tron signer for facilitator operations
   * @param config - Optional configuration for the facilitator
   */
  constructor(
    private readonly signer: FacilitatorTronSigner,
    config?: TronFacilitatorConfig,
  ) {
    this.config = {
      useWrapperContract: config?.useWrapperContract ?? false,
      maxEnergyFeeSun: config?.maxEnergyFeeSun ?? 100_000_000, // 100 TRX — reserved for future use
      feeDelegation: config?.feeDelegation ?? false,
    };
  }

  /**
   * Get mechanism-specific extra data for the supported kinds endpoint.
   *
   * Currently returns minimal metadata. energyDelegation and wrapperContract
   * will be exposed here once those features are implemented.
   *
   * @param _network - The network identifier (currently unused)
   * @returns Extra data for clients, or undefined if no extra data
   */
  getExtra(_network: string): Record<string, unknown> | undefined {
    // Only advertise features that are actually implemented.
    // useWrapperContract and feeDelegation are reserved for future use.
    // When implemented, they will be exposed here.
    return undefined;
  }

  /**
   * Get signer addresses used by this facilitator.
   * @param _network - The network identifier (unused - Tron addresses are network-agnostic)
   * @returns Array of facilitator Tron addresses (base58)
   */
  getSigners(_network: string): string[] {
    return [...this.signer.getAddresses()];
  }

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
  async verify(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<VerifyResponse> {
    // Step 1: Validate scheme and network
    if (payload.accepted.scheme !== "exact" || requirements.scheme !== "exact") {
      return {
        isValid: false,
        invalidReason: "unsupported_scheme",
        payer: "",
      };
    }

    if (payload.accepted.network !== requirements.network) {
      return {
        isValid: false,
        invalidReason: "network_mismatch",
        payer: "",
      };
    }

    // Step 2: Validate payload type
    const rawPayload = payload.payload;
    if (!isSignedTransactionPayload(rawPayload)) {
      return {
        isValid: false,
        invalidReason: "invalid_tron_payload_type",
        invalidMessage: "Expected signed transaction payload with 'signedTransaction' and 'from' fields",
        payer: "",
      };
    }

    const tronPayload = rawPayload as unknown as ExactTronPayloadV2;

    // Step 3: Decode and validate the transaction
    let decoded;
    try {
      decoded = await this.signer.decodeTransaction(
        tronPayload.signedTransaction,
        requirements.network,
      );
    } catch (error) {
      return {
        isValid: false,
        invalidReason: "invalid_tron_payload_decode_failed",
        invalidMessage: error instanceof Error ? error.message : "Failed to decode transaction",
        payer: tronPayload.from,
      };
    }

    // Step 4: Verify it's a TRC-20 transfer (function selector a9059cbb)
    if (decoded.contractType !== "TriggerSmartContract") {
      return {
        isValid: false,
        invalidReason: "invalid_tron_payload_not_smart_contract",
        invalidMessage: `Expected TriggerSmartContract, got ${decoded.contractType}`,
        payer: tronPayload.from,
      };
    }

    if (decoded.functionSelector !== "a9059cbb") {
      return {
        isValid: false,
        invalidReason: "invalid_tron_payload_not_transfer",
        invalidMessage: `Expected transfer(address,uint256) selector a9059cbb, got ${decoded.functionSelector}`,
        payer: tronPayload.from,
      };
    }

    // Step 5: Verify the token contract matches the required asset
    if (decoded.contractAddress !== requirements.asset) {
      return {
        isValid: false,
        invalidReason: "invalid_tron_payload_asset_mismatch",
        invalidMessage: `Expected asset ${requirements.asset}, transaction targets ${decoded.contractAddress}`,
        payer: tronPayload.from,
      };
    }

    // Step 6: Verify the recipient matches payTo
    if (decoded.parameters.to !== requirements.payTo) {
      return {
        isValid: false,
        invalidReason: "invalid_tron_payload_recipient_mismatch",
        invalidMessage: `Expected recipient ${requirements.payTo}, transaction sends to ${decoded.parameters.to}`,
        payer: tronPayload.from,
      };
    }

    // Step 7: Verify the amount meets requirements
    const txAmount = BigInt(decoded.parameters.amount || "0");
    const requiredAmount = BigInt(requirements.amount);

    if (txAmount < requiredAmount) {
      return {
        isValid: false,
        invalidReason: "invalid_tron_payload_amount_insufficient",
        invalidMessage: `Required ${requiredAmount.toString()}, transaction sends ${txAmount.toString()}`,
        payer: tronPayload.from,
      };
    }

    // Step 8: Verify the sender matches the claimed 'from' address
    if (decoded.ownerAddress !== tronPayload.from) {
      return {
        isValid: false,
        invalidReason: "invalid_tron_payload_sender_mismatch",
        invalidMessage: "Transaction owner does not match claimed sender",
        payer: tronPayload.from,
      };
    }

    // Step 9: SECURITY - Verify facilitator is NOT the sender (prevent self-transfers)
    const facilitatorAddresses = this.signer.getAddresses();
    if (facilitatorAddresses.includes(decoded.ownerAddress)) {
      return {
        isValid: false,
        invalidReason: "invalid_tron_payload_facilitator_is_sender",
        invalidMessage: "Facilitator address cannot be the payment sender",
        payer: tronPayload.from,
      };
    }

    // Step 10: Verify transaction has not expired
    const now = Date.now();
    if (decoded.expiration && decoded.expiration < now) {
      return {
        isValid: false,
        invalidReason: "invalid_tron_payload_expired",
        invalidMessage: `Transaction expired at ${new Date(decoded.expiration).toISOString()}`,
        payer: tronPayload.from,
      };
    }

    // Step 11: Verify sender has sufficient token balance
    try {
      const balance = await this.signer.getTokenBalance(
        requirements.asset,
        decoded.ownerAddress,
        requirements.network,
      );
      const balanceBigInt = BigInt(balance);

      if (balanceBigInt < requiredAmount) {
        return {
          isValid: false,
          invalidReason: "invalid_tron_payload_insufficient_balance",
          invalidMessage: `Sender balance ${balance} < required ${requirements.amount}`,
          payer: tronPayload.from,
        };
      }
    } catch (error) {
      return {
        isValid: false,
        invalidReason: "invalid_tron_payload_balance_check_failed",
        invalidMessage: error instanceof Error ? error.message : "Balance check failed",
        payer: tronPayload.from,
      };
    }

    // Step 12: Estimate energy cost and reject if too expensive
    // Protects the facilitator from broadcasting extremely expensive txs
    try {
      const estimatedEnergy = await this.signer.estimateEnergy(
        requirements.asset,
        decoded.ownerAddress,
        decoded.parameters.to || requirements.payTo,
        requirements.amount,
        requirements.network,
      );

      // Convert energy to SUN cost (energy price varies, use conservative 420 SUN/energy)
      const estimatedFeeSun = estimatedEnergy * 420;
      if (estimatedFeeSun > this.config.maxEnergyFeeSun) {
        return {
          isValid: false,
          invalidReason: "invalid_tron_payload_energy_too_expensive",
          invalidMessage: `Estimated energy cost ${estimatedFeeSun} SUN exceeds max ${this.config.maxEnergyFeeSun} SUN`,
          payer: tronPayload.from,
        };
      }
    } catch {
      // Energy estimation is best-effort — don't reject if the RPC fails.
      // The transaction may still succeed; confirmTransaction will catch failures.
    }

    // All checks passed
    return {
      isValid: true,
      invalidReason: undefined,
      payer: tronPayload.from,
    };
  }

  /**
   * Settles a payment by broadcasting the signed transaction to the Tron network.
   *
   * @param payload - The payment payload to settle
   * @param requirements - The payment requirements
   * @returns Promise resolving to settlement response with transaction hash
   */
  async settle(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<SettleResponse> {
    // First verify the payment
    const verification = await this.verify(payload, requirements);
    if (!verification.isValid) {
      return {
        success: false,
        network: payload.accepted.network,
        transaction: "",
        errorReason: verification.invalidReason ?? "verification_failed",
        errorMessage: verification.invalidMessage,
        payer: verification.payer || "",
      };
    }

    const tronPayload = payload.payload as unknown as ExactTronPayloadV2;

    try {
      // Second-layer verification: re-decode (which re-verifies signature)
      // before broadcasting. Belt-and-suspenders against verify→settle race.
      await this.signer.decodeTransaction(
        tronPayload.signedTransaction,
        requirements.network,
      );

      // Broadcast the signed transaction
      // NOTE ON REPLAY PROTECTION: Tron nodes reject duplicate transactions
      // (DUP_TRANSACTION_ERROR). An attacker attempting to reuse a previously
      // settled transaction will fail at broadcast. Additionally, Tron
      // transactions contain ref_block_bytes and ref_block_hash which bind
      // them to a specific block range (~60 seconds), providing natural
      // expiration. Combined with our expiration check in verify(), replay
      // attacks are mitigated at the network layer.
      //
      // For additional safety, the x402 facilitator server (x402Facilitator
      // class) should maintain a settled txID set to reject duplicates at
      // the application layer before hitting the network.
      const txID = await this.signer.broadcastTransaction(
        tronPayload.signedTransaction,
        requirements.network,
      );

      // Wait for confirmation
      await this.signer.confirmTransaction(txID, requirements.network);

      return {
        success: true,
        transaction: txID,
        network: payload.accepted.network,
        payer: verification.payer,
      };
    } catch (error) {
      console.error("[x402-tron] Settlement failed:", error);
      return {
        success: false,
        errorReason: "transaction_broadcast_failed",
        errorMessage: error instanceof Error ? error.message : "Unknown broadcast error",
        transaction: "",
        network: payload.accepted.network,
        payer: verification.payer || "",
      };
    }
  }
}
