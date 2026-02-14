/**
 * @module @erudite-intelligence/x402-tron-v2 - Server Scheme
 * @description x402 V2 server implementation for Tron. Handles price parsing
 *   and payment requirements enhancement for resource servers (merchants).
 * @author Erudite Intelligence LLC (Vector)
 * @created 2026-02-13
 * @purpose Enable resource servers to set prices in USDT and build Tron payment requirements
 *
 * CHANGELOG:
 * - 2026-02-13: Initial implementation. USDT default asset, custom money parser support.
 */

import type {
  AssetAmount,
  Network,
  PaymentRequirements,
  Price,
  SchemeNetworkServer,
  MoneyParser,
} from "@x402/core/types";
import { USDT_ADDRESSES, USDT_DECIMALS } from "../../constants";

/**
 * Tron server implementation for the Exact payment scheme.
 *
 * Converts user-friendly prices (e.g., "$1.50", 0.10) into the correct
 * token amount and asset format for Tron TRC-20 tokens.
 *
 * Default behavior:
 * - Treats numeric/string prices as USD amounts
 * - Converts to USDT TRC-20 with 6 decimal precision
 * - e.g., "$1.50" → { amount: "1500000", asset: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t" }
 */
export class ExactTronScheme implements SchemeNetworkServer {
  readonly scheme = "exact";
  private moneyParsers: MoneyParser[] = [];

  /**
   * Register a custom money parser in the parser chain.
   * Multiple parsers can be registered - they are tried in registration order.
   * If a parser returns null, the next parser is tried.
   * The default USDT parser is always the final fallback.
   *
   * @param parser - Custom function to convert amount to AssetAmount (or null to skip)
   * @returns The service instance for chaining
   */
  registerMoneyParser(parser: MoneyParser): ExactTronScheme {
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
  async parsePrice(price: Price, network: Network): Promise<AssetAmount> {
    // If already an AssetAmount, return it directly
    if (typeof price === "object" && price !== null && "amount" in price) {
      if (!price.asset) {
        throw new Error(`Asset address must be specified for AssetAmount on network ${network}`);
      }
      return {
        amount: price.amount,
        asset: price.asset,
        extra: price.extra || {},
      };
    }

    // Parse Money to decimal number
    const amount = this.parseMoneyToDecimal(price);

    // Try each custom money parser in order
    for (const parser of this.moneyParsers) {
      const result = await parser(amount, network);
      if (result !== null) {
        return result;
      }
    }

    // Default: convert to USDT
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
  enhancePaymentRequirements(
    paymentRequirements: PaymentRequirements,
    supportedKind: {
      x402Version: number;
      scheme: string;
      network: Network;
      extra?: Record<string, unknown>;
    },
    extensionKeys: string[],
  ): Promise<PaymentRequirements> {
    void extensionKeys;

    const extraData: Record<string, unknown> = {
      ...paymentRequirements.extra,
    };

    // Pass through any facilitator-provided extra metadata
    // Currently no Tron-specific extras are implemented.
    // When useWrapperContract and feeDelegation go live, their
    // metadata will be forwarded here.
    if (supportedKind.extra) {
      for (const [key, val] of Object.entries(supportedKind.extra)) {
        if (val !== undefined) {
          extraData[key] = val;
        }
      }
    }

    return Promise.resolve({
      ...paymentRequirements,
      extra: extraData,
    });
  }

  /**
   * Parse Money (string | number) to a decimal number.
   * Handles formats like "$1.50", "1.50", 1.50, etc.
   */
  private parseMoneyToDecimal(money: string | number): number {
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
  private defaultMoneyConversion(amount: number, network: Network): AssetAmount {
    const usdtAddress = USDT_ADDRESSES[network];
    if (!usdtAddress) {
      throw new Error(
        `No default USDT address configured for network ${network}. ` +
        `Provide an explicit AssetAmount or register a custom MoneyParser.`,
      );
    }

    // Convert decimal amount to smallest unit (6 decimals for USDT)
    const tokenAmount = Math.round(amount * 10 ** USDT_DECIMALS).toString();

    return {
      amount: tokenAmount,
      asset: usdtAddress,
      extra: {},
    };
  }
}
