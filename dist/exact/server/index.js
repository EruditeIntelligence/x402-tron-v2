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

// src/exact/server/index.ts
var server_exports = {};
__export(server_exports, {
  ExactTronScheme: () => ExactTronScheme,
  registerExactTronServerScheme: () => registerExactTronServerScheme
});
module.exports = __toCommonJS(server_exports);

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
var USDT_DECIMALS = 6;

// src/exact/server/scheme.ts
var ExactTronScheme = class {
  scheme = "exact";
  moneyParsers = [];
  /**
   * Register a custom money parser in the parser chain.
   * Multiple parsers can be registered - they are tried in registration order.
   * If a parser returns null, the next parser is tried.
   * The default USDT parser is always the final fallback.
   *
   * @param parser - Custom function to convert amount to AssetAmount (or null to skip)
   * @returns The service instance for chaining
   */
  registerMoneyParser(parser) {
    this.moneyParsers.push(parser);
    return this;
  }
  /**
   * Parses a price into an asset amount for Tron.
   *
   * Supports three input formats:
   * 1. AssetAmount: { amount: "1000000", asset: "TR7NHqje..." } → pass through
   * 2. String: "$1.50" or "1.50" → convert to USDT smallest unit
   * 3. Number: 1.50 → convert to USDT smallest unit
   *
   * @param price - The price to parse
   * @param network - The Tron network CAIP-2 identifier
   * @returns Promise resolving to the parsed asset amount
   */
  async parsePrice(price, network) {
    if (typeof price === "object" && price !== null && "amount" in price) {
      if (!price.asset) {
        throw new Error(`Asset address must be specified for AssetAmount on network ${network}`);
      }
      return {
        amount: price.amount,
        asset: price.asset,
        extra: price.extra || {}
      };
    }
    const amount = this.parseMoneyToDecimal(price);
    for (const parser of this.moneyParsers) {
      const result = await parser(amount, network);
      if (result !== null) {
        return result;
      }
    }
    return this.defaultMoneyConversion(amount, network);
  }
  /**
   * Build payment requirements for this scheme/network combination.
   *
   * For Tron, this adds Tron-specific metadata to the requirements:
   * - energyDelegation info from facilitator extra data
   * - wrapper contract address if applicable
   *
   * @param paymentRequirements - Base payment requirements with amount/asset set
   * @param supportedKind - The supported kind from facilitator's /supported endpoint
   * @param extensionKeys - Extensions supported by the facilitator
   * @returns Enhanced payment requirements
   */
  enhancePaymentRequirements(paymentRequirements, supportedKind, extensionKeys) {
    void extensionKeys;
    const extraData = {
      ...paymentRequirements.extra
    };
    if (supportedKind.extra) {
      for (const [key, val] of Object.entries(supportedKind.extra)) {
        if (val !== void 0) {
          extraData[key] = val;
        }
      }
    }
    return Promise.resolve({
      ...paymentRequirements,
      extra: extraData
    });
  }
  /**
   * Parse Money (string | number) to a decimal number.
   * Handles formats like "$1.50", "1.50", 1.50, etc.
   */
  parseMoneyToDecimal(money) {
    if (typeof money === "number") {
      return money;
    }
    const cleanMoney = money.replace(/^\$/, "").trim();
    const amount = parseFloat(cleanMoney);
    if (isNaN(amount)) {
      throw new Error(`Invalid money format: ${money}`);
    }
    return amount;
  }
  /**
   * Default money conversion: USD amount → USDT TRC-20 smallest unit.
   * USDT has 6 decimals, so $1.50 → 1500000.
   */
  defaultMoneyConversion(amount, network) {
    const usdtAddress = USDT_ADDRESSES[network];
    if (!usdtAddress) {
      throw new Error(
        `No default USDT address configured for network ${network}. Provide an explicit AssetAmount or register a custom MoneyParser.`
      );
    }
    const tokenAmount = Math.round(amount * 10 ** USDT_DECIMALS).toString();
    return {
      amount: tokenAmount,
      asset: usdtAddress,
      extra: {}
    };
  }
};

// src/exact/server/register.ts
function registerExactTronServerScheme(server, config) {
  const networks = config?.networks ? Array.isArray(config.networks) ? config.networks : [config.networks] : [...TRON_NETWORKS];
  const scheme = new ExactTronScheme();
  for (const network of networks) {
    server.register(network, scheme);
  }
  return server;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ExactTronScheme,
  registerExactTronServerScheme
});
//# sourceMappingURL=index.js.map