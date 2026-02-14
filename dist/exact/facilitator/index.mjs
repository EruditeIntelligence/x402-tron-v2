// src/types.ts
function isSignedTransactionPayload(payload) {
  if (typeof payload !== "object" || payload === null) return false;
  const p = payload;
  return typeof p.signedTransaction === "string" && typeof p.from === "string" && !("method" in p);
}

// src/exact/facilitator/scheme.ts
var ExactTronScheme = class {
  /**
   * Creates a new ExactTronScheme facilitator instance.
   *
   * @param signer - The Tron signer for facilitator operations
   * @param config - Optional configuration for the facilitator
   */
  constructor(signer, config) {
    this.signer = signer;
    this.config = {
      useWrapperContract: config?.useWrapperContract ?? false,
      maxEnergyFeeSun: config?.maxEnergyFeeSun ?? 1e8,
      // 100 TRX — reserved for future use
      feeDelegation: config?.feeDelegation ?? false
    };
  }
  scheme = "exact";
  caipFamily = "tron:*";
  config;
  /**
   * Get mechanism-specific extra data for the supported kinds endpoint.
   *
   * Currently returns minimal metadata. energyDelegation and wrapperContract
   * will be exposed here once those features are implemented.
   *
   * @param _network - The network identifier (currently unused)
   * @returns Extra data for clients, or undefined if no extra data
   */
  getExtra(_network) {
    return void 0;
  }
  /**
   * Get signer addresses used by this facilitator.
   * @param _network - The network identifier (unused - Tron addresses are network-agnostic)
   * @returns Array of facilitator Tron addresses (base58)
   */
  getSigners(_network) {
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
  async verify(payload, requirements) {
    if (payload.accepted.scheme !== "exact" || requirements.scheme !== "exact") {
      return {
        isValid: false,
        invalidReason: "unsupported_scheme",
        payer: ""
      };
    }
    if (payload.accepted.network !== requirements.network) {
      return {
        isValid: false,
        invalidReason: "network_mismatch",
        payer: ""
      };
    }
    const rawPayload = payload.payload;
    if (!isSignedTransactionPayload(rawPayload)) {
      return {
        isValid: false,
        invalidReason: "invalid_tron_payload_type",
        invalidMessage: "Expected signed transaction payload with 'signedTransaction' and 'from' fields",
        payer: ""
      };
    }
    const tronPayload = rawPayload;
    let decoded;
    try {
      decoded = await this.signer.decodeTransaction(
        tronPayload.signedTransaction,
        requirements.network
      );
    } catch (error) {
      return {
        isValid: false,
        invalidReason: "invalid_tron_payload_decode_failed",
        invalidMessage: error instanceof Error ? error.message : "Failed to decode transaction",
        payer: tronPayload.from
      };
    }
    if (decoded.contractType !== "TriggerSmartContract") {
      return {
        isValid: false,
        invalidReason: "invalid_tron_payload_not_smart_contract",
        invalidMessage: `Expected TriggerSmartContract, got ${decoded.contractType}`,
        payer: tronPayload.from
      };
    }
    if (decoded.functionSelector !== "a9059cbb") {
      return {
        isValid: false,
        invalidReason: "invalid_tron_payload_not_transfer",
        invalidMessage: `Expected transfer(address,uint256) selector a9059cbb, got ${decoded.functionSelector}`,
        payer: tronPayload.from
      };
    }
    if (decoded.contractAddress !== requirements.asset) {
      return {
        isValid: false,
        invalidReason: "invalid_tron_payload_asset_mismatch",
        invalidMessage: `Expected asset ${requirements.asset}, transaction targets ${decoded.contractAddress}`,
        payer: tronPayload.from
      };
    }
    if (decoded.parameters.to !== requirements.payTo) {
      return {
        isValid: false,
        invalidReason: "invalid_tron_payload_recipient_mismatch",
        invalidMessage: `Expected recipient ${requirements.payTo}, transaction sends to ${decoded.parameters.to}`,
        payer: tronPayload.from
      };
    }
    const txAmount = BigInt(decoded.parameters.amount || "0");
    const requiredAmount = BigInt(requirements.amount);
    if (txAmount < requiredAmount) {
      return {
        isValid: false,
        invalidReason: "invalid_tron_payload_amount_insufficient",
        invalidMessage: `Required ${requiredAmount.toString()}, transaction sends ${txAmount.toString()}`,
        payer: tronPayload.from
      };
    }
    if (decoded.ownerAddress !== tronPayload.from) {
      return {
        isValid: false,
        invalidReason: "invalid_tron_payload_sender_mismatch",
        invalidMessage: "Transaction owner does not match claimed sender",
        payer: tronPayload.from
      };
    }
    const facilitatorAddresses = this.signer.getAddresses();
    if (facilitatorAddresses.includes(decoded.ownerAddress)) {
      return {
        isValid: false,
        invalidReason: "invalid_tron_payload_facilitator_is_sender",
        invalidMessage: "Facilitator address cannot be the payment sender",
        payer: tronPayload.from
      };
    }
    const now = Date.now();
    if (decoded.expiration && decoded.expiration < now) {
      return {
        isValid: false,
        invalidReason: "invalid_tron_payload_expired",
        invalidMessage: `Transaction expired at ${new Date(decoded.expiration).toISOString()}`,
        payer: tronPayload.from
      };
    }
    try {
      const balance = await this.signer.getTokenBalance(
        requirements.asset,
        decoded.ownerAddress,
        requirements.network
      );
      const balanceBigInt = BigInt(balance);
      if (balanceBigInt < requiredAmount) {
        return {
          isValid: false,
          invalidReason: "invalid_tron_payload_insufficient_balance",
          invalidMessage: `Sender balance ${balance} < required ${requirements.amount}`,
          payer: tronPayload.from
        };
      }
    } catch (error) {
      return {
        isValid: false,
        invalidReason: "invalid_tron_payload_balance_check_failed",
        invalidMessage: error instanceof Error ? error.message : "Balance check failed",
        payer: tronPayload.from
      };
    }
    try {
      const estimatedEnergy = await this.signer.estimateEnergy(
        requirements.asset,
        decoded.ownerAddress,
        decoded.parameters.to || requirements.payTo,
        requirements.amount,
        requirements.network
      );
      const estimatedFeeSun = estimatedEnergy * 420;
      if (estimatedFeeSun > this.config.maxEnergyFeeSun) {
        return {
          isValid: false,
          invalidReason: "invalid_tron_payload_energy_too_expensive",
          invalidMessage: `Estimated energy cost ${estimatedFeeSun} SUN exceeds max ${this.config.maxEnergyFeeSun} SUN`,
          payer: tronPayload.from
        };
      }
    } catch {
    }
    return {
      isValid: true,
      invalidReason: void 0,
      payer: tronPayload.from
    };
  }
  /**
   * Settles a payment by broadcasting the signed transaction to the Tron network.
   *
   * @param payload - The payment payload to settle
   * @param requirements - The payment requirements
   * @returns Promise resolving to settlement response with transaction hash
   */
  async settle(payload, requirements) {
    const verification = await this.verify(payload, requirements);
    if (!verification.isValid) {
      return {
        success: false,
        network: payload.accepted.network,
        transaction: "",
        errorReason: verification.invalidReason ?? "verification_failed",
        errorMessage: verification.invalidMessage,
        payer: verification.payer || ""
      };
    }
    const tronPayload = payload.payload;
    try {
      await this.signer.decodeTransaction(
        tronPayload.signedTransaction,
        requirements.network
      );
      const txID = await this.signer.broadcastTransaction(
        tronPayload.signedTransaction,
        requirements.network
      );
      await this.signer.confirmTransaction(txID, requirements.network);
      return {
        success: true,
        transaction: txID,
        network: payload.accepted.network,
        payer: verification.payer
      };
    } catch (error) {
      console.error("[x402-tron] Settlement failed:", error);
      return {
        success: false,
        errorReason: "transaction_broadcast_failed",
        errorMessage: error instanceof Error ? error.message : "Unknown broadcast error",
        transaction: "",
        network: payload.accepted.network,
        payer: verification.payer || ""
      };
    }
  }
};

// src/constants.ts
var TRON_MAINNET = "tron:27Lqcw";
var TRON_SHASTA = "tron:4oPwXB";
var TRON_NILE = "tron:6FhfKq";
var TRON_NETWORKS = [TRON_MAINNET, TRON_SHASTA, TRON_NILE];
var TRON_RPC_URLS = {
  [TRON_MAINNET]: "https://api.trongrid.io",
  [TRON_SHASTA]: "https://api.shasta.trongrid.io",
  [TRON_NILE]: "https://nile.trongrid.io"
};
var USDT_ADDRESSES = {
  [TRON_MAINNET]: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
  [TRON_SHASTA]: "TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs",
  // Shasta USDT
  [TRON_NILE]: "TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj"
  // Nile USDT
};
var USDC_ADDRESSES = {
  [TRON_MAINNET]: "TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8"
};

// src/exact/facilitator/register.ts
function registerExactTronScheme(facilitator, config) {
  const networks = config.networks ? Array.isArray(config.networks) ? config.networks : [config.networks] : [...TRON_NETWORKS];
  facilitator.register(
    networks,
    new ExactTronScheme(config.signer, config.config)
  );
  return facilitator;
}
export {
  ExactTronScheme,
  registerExactTronScheme
};
//# sourceMappingURL=index.mjs.map