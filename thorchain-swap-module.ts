/**
 * @module eruditepay-thorchain - THORChain Cross-Chain Swap Integration
 * @description Enables EruditePay to accept BTC, ETH, LTC, DOGE, XRP, and other
 *   native assets via THORChain, converting them to USDT on Tron for merchant settlement.
 * @author Erudite Intelligence LLC (Vector)
 * @created 2026-02-13
 * @purpose Replace ChangeNow and multiple swap API integrations with a single
 *   decentralized, non-custodial, no-KYC cross-chain settlement layer.
 *
 * ARCHITECTURE:
 *   Customer (BTC/ETH/LTC/etc.)
 *     → THORChain vault (native swap)
 *       → USDT arrives on Tron
 *         → EruditePay fee applied
 *           → Merchant receives USDT
 *
 * CHANGELOG:
 * - 2026-02-13: Initial implementation. Quote, swap execution, status tracking.
 */

// =============================================================================
// CONFIGURATION
// =============================================================================

/** THORNode API endpoint (Nine Realms hosted, free) */
const THORNODE_API = "https://thornode.ninerealms.com";

/** Midgard API endpoint (analytics/history) */
const MIDGARD_API = "https://midgard.ninerealms.com";

/**
 * THORChain asset identifiers.
 * Format: CHAIN.ASSET-CONTRACT_PREFIX (for tokens)
 * Native assets: CHAIN.CHAIN (e.g., BTC.BTC, ETH.ETH)
 */
const THORCHAIN_ASSETS = {
  // Native assets (no contract address needed)
  BTC: "BTC.BTC",
  ETH: "ETH.ETH",
  LTC: "LTC.LTC",
  DOGE: "DOGE.DOGE",
  BCH: "BCH.BCH",
  ATOM: "GAIA.ATOM",
  AVAX: "AVAX.AVAX",
  BNB: "BSC.BNB",
  XRP: "XRP.XRP",
  TRX: "TRON.TRX",

  // Tron tokens (destination for EruditePay)
  USDT_TRON: "TRON.USDT-TR7NHQ",

  // EVM tokens
  USDC_ETH: "ETH.USDC-0XA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48",
  USDT_ETH: "ETH.USDT-0XDAC17F958D2EE523A2206206994597C13D831EC7",
  USDC_BASE: "BASE.USDC-0X833589FCD6EDB6E08F4C7C32D4F71B54BDA02913",
};

/**
 * Human-friendly names for supported inbound assets
 */
const SUPPORTED_INBOUND = {
  BTC: { name: "Bitcoin", asset: THORCHAIN_ASSETS.BTC, decimals: 8 },
  ETH: { name: "Ethereum", asset: THORCHAIN_ASSETS.ETH, decimals: 18 },
  LTC: { name: "Litecoin", asset: THORCHAIN_ASSETS.LTC, decimals: 8 },
  DOGE: { name: "Dogecoin", asset: THORCHAIN_ASSETS.DOGE, decimals: 8 },
  XRP: { name: "XRP", asset: THORCHAIN_ASSETS.XRP, decimals: 6 },
  BCH: { name: "Bitcoin Cash", asset: THORCHAIN_ASSETS.BCH, decimals: 8 },
  TRX: { name: "Tron", asset: THORCHAIN_ASSETS.TRX, decimals: 6 },
  AVAX: { name: "Avalanche", asset: THORCHAIN_ASSETS.AVAX, decimals: 18 },
  BNB: { name: "BNB", asset: THORCHAIN_ASSETS.BNB, decimals: 18 },
  ATOM: { name: "Cosmos", asset: THORCHAIN_ASSETS.ATOM, decimals: 6 },
  USDC_ETH: { name: "USDC (Ethereum)", asset: THORCHAIN_ASSETS.USDC_ETH, decimals: 6 },
  USDT_ETH: { name: "USDT (Ethereum)", asset: THORCHAIN_ASSETS.USDT_ETH, decimals: 6 },
  USDC_BASE: { name: "USDC (Base)", asset: THORCHAIN_ASSETS.USDC_BASE, decimals: 6 },
};

/** EruditePay affiliate thorname (must be ≤4 chars for THORChain memos) */
const AFFILIATE_NAME = "ep"; // Register this via THORName

/** EruditePay affiliate fee in basis points (e.g., 50 = 0.50%) */
const AFFILIATE_BPS = 50;

// =============================================================================
// TYPES
// =============================================================================

/**
 * Quote response from THORChain /thorchain/quote/swap
 */
interface THORChainQuote {
  /** Vault address to send funds to */
  inbound_address: string;
  /** Required confirmations on source chain */
  inbound_confirmation_blocks: number;
  /** Estimated confirmation time in seconds */
  inbound_confirmation_seconds: number;
  /** Expected output amount (in 1e8) */
  expected_amount_out: string;
  /** Expected output amount after all fees (in 1e8) */
  expected_amount_out_streaming: string;
  /** Recommended minimum input amount (in 1e8) */
  recommended_min_amount_in: string;
  /** Expiry timestamp (unix seconds) */
  expiry: number;
  /** Warning message */
  warning: string;
  /** Notes/instructions */
  notes: string;
  /** Fee breakdown */
  fees: {
    asset: string;
    affiliate: string;
    outbound: string;
    liquidity: string;
    total: string;
    slippage_bps: number;
    total_bps: number;
  };
  /** Memo to include in the transaction */
  memo: string;
  /** Estimated total processing time in seconds */
  total_swap_seconds: number;
  /** Streaming swap parameters (if streaming) */
  streaming_swap_blocks?: number;
  streaming_swap_seconds?: number;
  /** Slippage in basis points */
  slippage_bps: number;
  /** Router address (for EVM chains) */
  router?: string;
  /** Max streaming quantity used */
  max_streaming_quantity?: number;
}

/**
 * Swap request from an EruditePay merchant/client
 */
interface SwapRequest {
  /** The asset the customer wants to pay with (e.g., "BTC", "ETH") */
  fromAsset: keyof typeof SUPPORTED_INBOUND;
  /** Amount in the source asset's native unit (e.g., 0.001 for BTC) */
  fromAmount: number;
  /** Destination Tron address (merchant's USDT TRC-20 address) */
  destinationAddress: string;
  /** Whether to use streaming swaps for better execution (recommended for > $1000) */
  streaming?: boolean;
  /** Maximum acceptable slippage in basis points (default: 100 = 1%) */
  toleranceBps?: number;
}

/**
 * Swap quote with payment instructions for the customer
 */
interface SwapInstructions {
  /** Quote ID for tracking */
  quoteId: string;
  /** Address to send funds to */
  depositAddress: string;
  /** Memo to include in the transaction (CRITICAL for UTXO chains) */
  memo: string;
  /** Amount to send (in native units, e.g., 0.001 BTC) */
  depositAmount: number;
  /** Estimated USDT the merchant will receive */
  estimatedOutput: number;
  /** EruditePay fee in USDT */
  eruditeFee: number;
  /** THORChain fees breakdown */
  thorchainFees: {
    affiliate: number;
    outbound: number;
    liquidity: number;
    total: number;
    slippageBps: number;
  };
  /** Estimated total processing time */
  estimatedSeconds: number;
  /** Quote expiry (ISO timestamp) */
  expiresAt: string;
  /** Source chain and asset info */
  source: {
    chain: string;
    asset: string;
    name: string;
  };
  /** Destination info */
  destination: {
    chain: "TRON";
    asset: "USDT";
    address: string;
  };
  /** Router address (for EVM deposits that need contract interaction) */
  router?: string;
  /** Notes for the customer/frontend */
  notes: string;
}

/**
 * Transaction status
 */
interface SwapStatus {
  /** Current stage */
  stage: "pending_inbound" | "inbound_observed" | "swapping" | "outbound_signed" | "completed" | "failed";
  /** Source chain transaction hash */
  inboundTxHash?: string;
  /** Destination chain transaction hash */
  outboundTxHash?: string;
  /** Amount received on Tron (USDT) */
  receivedAmount?: number;
  /** Error message if failed */
  error?: string;
}

// =============================================================================
// CORE MODULE
// =============================================================================

class THORChainSwapModule {
  private apiBase: string;

  constructor(apiBase: string = THORNODE_API) {
    this.apiBase = apiBase;
  }

  // ---------------------------------------------------------------------------
  // 1. GET SWAP QUOTE
  // ---------------------------------------------------------------------------

  /**
   * Get a swap quote from THORChain.
   *
   * Queries THORChain for the best route to convert the source asset
   * into USDT on Tron, including affiliate fees for EruditePay.
   *
   * @param request - Swap request details
   * @returns Payment instructions for the customer
   */
  async getQuote(request: SwapRequest): Promise<SwapInstructions> {
    const sourceInfo = SUPPORTED_INBOUND[request.fromAsset];
    if (!sourceInfo) {
      throw new Error(`Unsupported asset: ${request.fromAsset}. Supported: ${Object.keys(SUPPORTED_INBOUND).join(", ")}`);
    }

    // Convert amount to THORChain's 1e8 format
    const amountIn1e8 = Math.round(request.fromAmount * 1e8);

    // Build query parameters
    const params = new URLSearchParams({
      from_asset: sourceInfo.asset,
      to_asset: THORCHAIN_ASSETS.USDT_TRON,
      amount: amountIn1e8.toString(),
      destination: request.destinationAddress,
      affiliate: AFFILIATE_NAME,
      affiliate_bps: AFFILIATE_BPS.toString(),
    });

    // Add streaming swap parameters for better execution on large trades
    if (request.streaming !== false) {
      params.set("streaming_interval", "1"); // Every block
      params.set("streaming_quantity", "0"); // Let THORNode optimize
    }

    // Add slippage tolerance
    if (request.toleranceBps) {
      params.set("tolerance_bps", request.toleranceBps.toString());
    }

    // Fetch quote from THORNode
    const url = `${this.apiBase}/thorchain/quote/swap?${params.toString()}`;
    const response = await fetch(url);

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`THORChain quote failed (${response.status}): ${errorBody}`);
    }

    const quote: THORChainQuote = await response.json();

    // Convert THORChain 1e8 amounts to human-readable
    const expectedOutput = parseInt(quote.expected_amount_out_streaming || quote.expected_amount_out) / 1e8;
    const affiliateFee = parseInt(quote.fees.affiliate) / 1e8;
    const outboundFee = parseInt(quote.fees.outbound) / 1e8;
    const liquidityFee = parseInt(quote.fees.liquidity) / 1e8;
    const totalFee = parseInt(quote.fees.total) / 1e8;
    const minAmount = parseInt(quote.recommended_min_amount_in) / 1e8;

    // Validate minimum amount
    if (request.fromAmount < minAmount) {
      throw new Error(
        `Amount too small. Minimum: ${minAmount} ${request.fromAsset} ` +
        `(${minAmount * 1e8} in base units). You sent: ${request.fromAmount} ${request.fromAsset}`
      );
    }

    // Generate unique quote ID
    const quoteId = `ep-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    return {
      quoteId,
      depositAddress: quote.inbound_address,
      memo: quote.memo,
      depositAmount: request.fromAmount,
      estimatedOutput: expectedOutput,
      eruditeFee: affiliateFee, // Our affiliate fee is already included
      thorchainFees: {
        affiliate: affiliateFee,
        outbound: outboundFee,
        liquidity: liquidityFee,
        total: totalFee,
        slippageBps: quote.slippage_bps,
      },
      estimatedSeconds: quote.total_swap_seconds || (quote.streaming_swap_seconds || 0) + quote.inbound_confirmation_seconds,
      expiresAt: new Date(quote.expiry * 1000).toISOString(),
      source: {
        chain: request.fromAsset,
        asset: sourceInfo.asset,
        name: sourceInfo.name,
      },
      destination: {
        chain: "TRON",
        asset: "USDT",
        address: request.destinationAddress,
      },
      router: quote.router,
      notes: quote.notes || "Send the exact deposit amount to the deposit address with the memo included.",
    };
  }

  // ---------------------------------------------------------------------------
  // 2. CHECK SWAP STATUS
  // ---------------------------------------------------------------------------

  /**
   * Check the status of a swap using the source chain transaction hash.
   *
   * @param inboundTxHash - The transaction hash on the source chain
   * @returns Current swap status
   */
  async getStatus(inboundTxHash: string): Promise<SwapStatus> {
    const url = `${this.apiBase}/thorchain/tx/status/${inboundTxHash}`;
    const response = await fetch(url);

    if (!response.ok) {
      if (response.status === 404) {
        return { stage: "pending_inbound" };
      }
      throw new Error(`Status check failed: ${response.status}`);
    }

    const data = await response.json();

    // Parse THORChain's multi-stage status
    if (data.stages?.inbound_observed?.completed) {
      if (data.stages?.swap_status?.completed) {
        if (data.stages?.outbound_signed?.completed) {
          return {
            stage: "completed",
            inboundTxHash,
            outboundTxHash: data.out_txs?.[0]?.id,
            receivedAmount: data.out_txs?.[0]?.coins?.[0]?.amount
              ? parseInt(data.out_txs[0].coins[0].amount) / 1e8
              : undefined,
          };
        }
        return { stage: "outbound_signed", inboundTxHash };
      }
      return { stage: "swapping", inboundTxHash };
    }

    return { stage: "inbound_observed", inboundTxHash };
  }

  // ---------------------------------------------------------------------------
  // 3. GET SUPPORTED ASSETS AND POOL INFO
  // ---------------------------------------------------------------------------

  /**
   * Get available inbound addresses and check if chains are halted.
   * CRITICAL: Always check before presenting deposit addresses to users.
   * @returns Map of chain to inbound vault address
   */
  async getInboundAddresses(): Promise<Map<string, { address: string; halted: boolean; gas_rate: string }>> {
    const url = `${this.apiBase}/thorchain/inbound_addresses`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch inbound addresses: ${response.status}`);
    }

    const data: Array<{
      chain: string;
      address: string;
      halted: boolean;
      gas_rate: string;
      gas_rate_units: string;
      router?: string;
    }> = await response.json();

    const result = new Map();
    for (const entry of data) {
      result.set(entry.chain, {
        address: entry.address,
        halted: entry.halted,
        gas_rate: entry.gas_rate,
      });
    }
    return result;
  }

  /**
   * Get pool information for a specific asset.
   * Useful for checking liquidity depth before quoting.
   */
  async getPool(asset: string): Promise<{
    status: string;
    balance_asset: string;
    balance_rune: string;
    synth_mint_paused: boolean;
  }> {
    const url = `${this.apiBase}/thorchain/pool/${asset}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch pool: ${response.status}`);
    }

    return await response.json();
  }

  // ---------------------------------------------------------------------------
  // 4. BATCH QUOTE - Get quotes for all supported inbound assets at once
  // ---------------------------------------------------------------------------

  /**
   * Get quotes for converting a fixed USD amount from each supported asset to USDT on Tron.
   * Useful for displaying "Pay with..." options on a checkout page.
   *
   * @param usdAmount - Target USD amount (e.g., 10.00)
   * @param destinationAddress - Merchant's Tron USDT address
   * @returns Map of asset symbol to swap instructions
   */
  async getBatchQuotes(
    usdAmount: number,
    destinationAddress: string,
  ): Promise<Map<string, SwapInstructions | { error: string }>> {
    // For USDT amount, the 1e8 amount is straightforward
    // For other assets, we'd need price feeds - use THORChain's quote endpoint
    // which handles conversion internally

    const results = new Map();

    // Get quotes sequentially (rate limit: 1/second)
    for (const [symbol, info] of Object.entries(SUPPORTED_INBOUND)) {
      try {
        // Use a rough estimate for input amount based on common prices
        // THORChain will calculate the exact output
        const quote = await this.getQuote({
          fromAsset: symbol as keyof typeof SUPPORTED_INBOUND,
          fromAmount: this.estimateInputForUsd(symbol, usdAmount),
          destinationAddress,
        });
        results.set(symbol, quote);
      } catch (error) {
        results.set(symbol, {
          error: error instanceof Error ? error.message : "Quote failed",
        });
      }

      // Rate limit: 1 request/second
      await new Promise((resolve) => setTimeout(resolve, 1100));
    }

    return results;
  }

  /**
   * Rough USD-to-native-asset estimation for batch quoting.
   * These are approximate — THORChain handles exact conversion.
   */
  private estimateInputForUsd(symbol: string, usdAmount: number): number {
    // Rough price estimates (updated periodically)
    // In production, use a price feed or cache THORChain pool prices
    const roughPrices: Record<string, number> = {
      BTC: 95000,
      ETH: 3200,
      LTC: 120,
      DOGE: 0.35,
      XRP: 2.50,
      BCH: 350,
      TRX: 0.28,
      AVAX: 35,
      BNB: 650,
      ATOM: 8,
      USDC_ETH: 1,
      USDT_ETH: 1,
      USDC_BASE: 1,
    };

    const price = roughPrices[symbol] || 1;
    // Add 5% buffer for slippage and fees
    return (usdAmount / price) * 1.05;
  }

  // ---------------------------------------------------------------------------
  // 5. HEALTH CHECK
  // ---------------------------------------------------------------------------

  /**
   * Check if THORChain and the Tron outbound chain are operational.
   * Call this before accepting payments.
   */
  async healthCheck(): Promise<{
    thorchainHealthy: boolean;
    tronHalted: boolean;
    tronInboundAddress?: string;
    message: string;
  }> {
    try {
      const addresses = await this.getInboundAddresses();
      const tronInfo = addresses.get("TRON");

      if (!tronInfo) {
        return {
          thorchainHealthy: true,
          tronHalted: true,
          message: "Tron chain not found in THORChain inbound addresses",
        };
      }

      return {
        thorchainHealthy: true,
        tronHalted: tronInfo.halted,
        tronInboundAddress: tronInfo.address,
        message: tronInfo.halted
          ? "WARNING: Tron chain is currently halted on THORChain"
          : "All systems operational",
      };
    } catch (error) {
      return {
        thorchainHealthy: false,
        tronHalted: true,
        message: `THORChain API unreachable: ${error instanceof Error ? error.message : "unknown error"}`,
      };
    }
  }
}

// =============================================================================
// EXPRESS ROUTER (for MCRN facilitator integration)
// =============================================================================

/**
 * Creates an Express router with THORChain swap endpoints.
 * Mount this on your MCRN facilitator server.
 *
 * @example
 * ```typescript
 * import express from "express";
 * import { createTHORChainRouter } from "./thorchain-swap-module";
 *
 * const app = express();
 * app.use("/api/swap", createTHORChainRouter());
 * ```
 */
function createTHORChainRouter() {
  // This would use Express in the real implementation
  // Showing the route handlers for documentation
  const module = new THORChainSwapModule();

  const routes = {
    /**
     * GET /api/swap/quote
     * Get a swap quote for converting crypto to USDT on Tron
     *
     * Query params:
     * - from: Asset symbol (BTC, ETH, LTC, DOGE, XRP, etc.)
     * - amount: Amount in native units (e.g., 0.001 for BTC)
     * - destination: Merchant's Tron USDT address
     * - streaming: Enable streaming swaps (default: true)
     * - tolerance_bps: Max slippage (default: 100)
     */
    "GET /quote": async (req: {
      from: string;
      amount: string;
      destination: string;
      streaming?: string;
      tolerance_bps?: string;
    }) => {
      return module.getQuote({
        fromAsset: req.from as keyof typeof SUPPORTED_INBOUND,
        fromAmount: parseFloat(req.amount),
        destinationAddress: req.destination,
        streaming: req.streaming !== "false",
        toleranceBps: req.tolerance_bps ? parseInt(req.tolerance_bps) : undefined,
      });
    },

    /**
     * GET /api/swap/status/:txHash
     * Check swap status by source chain tx hash
     */
    "GET /status/:txHash": async (req: { txHash: string }) => {
      return module.getStatus(req.txHash);
    },

    /**
     * GET /api/swap/assets
     * List all supported inbound assets
     */
    "GET /assets": async () => {
      return {
        supported: Object.entries(SUPPORTED_INBOUND).map(([symbol, info]) => ({
          symbol,
          name: info.name,
          thorchainAsset: info.asset,
          decimals: info.decimals,
        })),
        destination: {
          chain: "TRON",
          asset: "USDT TRC-20",
          thorchainAsset: THORCHAIN_ASSETS.USDT_TRON,
        },
        affiliateFee: `${AFFILIATE_BPS / 100}%`,
      };
    },

    /**
     * GET /api/swap/health
     * Health check for THORChain and Tron chain status
     */
    "GET /health": async () => {
      return module.healthCheck();
    },
  };

  return routes;
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  THORChainSwapModule,
  createTHORChainRouter,
  THORCHAIN_ASSETS,
  SUPPORTED_INBOUND,
  AFFILIATE_NAME,
  AFFILIATE_BPS,
};

export type {
  THORChainQuote,
  SwapRequest,
  SwapInstructions,
  SwapStatus,
};

// =============================================================================
// USAGE EXAMPLE (for MCRN integration)
// =============================================================================

/*
 * Integration into MCRN Facilitator:
 *
 * 1. Copy this file to your MCRN server's src/ directory
 * 2. Import and mount the router:
 *
 *    import { createTHORChainRouter, THORChainSwapModule } from "./thorchain-swap-module";
 *
 *    // In your Express app:
 *    app.use("/api/swap", createTHORChainRouter());
 *
 * 3. Frontend/checkout flow:
 *    a. User selects "Pay with BTC" on merchant checkout
 *    b. Frontend calls GET /api/swap/quote?from=BTC&amount=0.001&destination=TMerchantAddress
 *    c. Frontend displays: deposit address, memo, estimated output
 *    d. User sends BTC to the deposit address with the memo
 *    e. Frontend polls GET /api/swap/status/:txHash until completed
 *    f. Merchant receives USDT on Tron
 *
 * 4. Register a THORName for "ep" (or your chosen ≤4 char name):
 *    - This enables affiliate fee collection
 *    - See: https://dev.thorchain.org/thorname-guide/registration.html
 *
 * 5. Monitor:
 *    - Call healthCheck() before accepting payments
 *    - If Tron is halted, disable THORChain payments temporarily
 *    - Track affiliate earnings via Midgard analytics
 */
