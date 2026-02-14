import { SchemeNetworkServer, MoneyParser, Price, Network, AssetAmount, PaymentRequirements } from '@x402/core/types';
export { TronServerConfig, registerExactTronServerScheme } from './register.mjs';
import '@x402/core/server';

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
declare class ExactTronScheme implements SchemeNetworkServer {
    readonly scheme = "exact";
    private moneyParsers;
    /**
     * Register a custom money parser in the parser chain.
     * Multiple parsers can be registered - they are tried in registration order.
     * If a parser returns null, the next parser is tried.
     * The default USDT parser is always the final fallback.
     *
     * @param parser - Custom function to convert amount to AssetAmount (or null to skip)
     * @returns The service instance for chaining
     */
    registerMoneyParser(parser: MoneyParser): ExactTronScheme;
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
    parsePrice(price: Price, network: Network): Promise<AssetAmount>;
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
    enhancePaymentRequirements(paymentRequirements: PaymentRequirements, supportedKind: {
        x402Version: number;
        scheme: string;
        network: Network;
        extra?: Record<string, unknown>;
    }, extensionKeys: string[]): Promise<PaymentRequirements>;
    /**
     * Parse Money (string | number) to a decimal number.
     * Handles formats like "$1.50", "1.50", 1.50, etc.
     */
    private parseMoneyToDecimal;
    /**
     * Default money conversion: USD amount → USDT TRC-20 smallest unit.
     * USDT has 6 decimals, so $1.50 → 1500000.
     */
    private defaultMoneyConversion;
}

export { ExactTronScheme };
