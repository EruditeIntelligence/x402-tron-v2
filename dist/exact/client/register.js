"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/exact/client/register.ts
var register_exports = {};
__export(register_exports, {
  registerExactTronClientScheme: () => registerExactTronClientScheme
});
module.exports = __toCommonJS(register_exports);

// src/exact/client/scheme.ts
var ExactTronScheme = class {
  /**
   * Creates a new ExactTronScheme client instance.
   *
   * @param signer - The Tron signer for client operations
   */
  constructor(signer) {
    this.signer = signer;
  }
  scheme = "exact";
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
  async createPaymentPayload(x402Version, paymentRequirements) {
    const unsignedTx = await this.signer.buildTrc20Transfer(
      paymentRequirements.asset,
      // Token contract (e.g., USDT TRC-20)
      paymentRequirements.payTo,
      // Merchant address
      paymentRequirements.amount
      // Amount in smallest unit
    );
    const signedTx = await this.signer.signTransaction(unsignedTx);
    return {
      x402Version,
      payload: {
        signedTransaction: JSON.stringify(signedTx),
        from: this.signer.address,
        txID: signedTx.txID
      }
    };
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

// src/exact/client/register.ts
function registerExactTronClientScheme(client, config) {
  const networks = config.networks ? Array.isArray(config.networks) ? config.networks : [config.networks] : [...TRON_NETWORKS];
  const scheme = new ExactTronScheme(config.signer);
  for (const network of networks) {
    client.register(network, scheme);
  }
  return client;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  registerExactTronClientScheme
});
//# sourceMappingURL=register.js.map