export { ExactTronScheme as ExactTronFacilitatorScheme } from './exact/facilitator/index.mjs';
export { E as ExactTronApprovePayloadV2, a as ExactTronPayload, b as ExactTronPayloadV2, T as TronBroadcastResult, c as TronFacilitatorConfig, d as TronFacilitatorRegistrationConfig, i as isApprovePayload, e as isSignedTransactionPayload, r as registerExactTronScheme } from './register-BnsSDUm5.mjs';
export { ExactTronScheme as ExactTronClientScheme } from './exact/client/index.mjs';
export { TronClientConfig, registerExactTronClientScheme } from './exact/client/register.mjs';
export { ExactTronScheme as ExactTronServerScheme } from './exact/server/index.mjs';
export { TronServerConfig, registerExactTronServerScheme } from './exact/server/register.mjs';
export { C as ClientTronSigner, D as DecodedTronTransaction, F as FacilitatorTronSigner, t as toClientTronSigner, a as toFacilitatorTronSigner } from './signer-B4A63VxW.mjs';
import '@x402/core/types';
import '@x402/core/facilitator';
import '@x402/core/client';
import '@x402/core/server';

/**
 * @module @erudite-intelligence/x402-tron-v2 - Constants
 * @description Tron network constants for x402 V2 plugin
 * @author Erudite Intelligence LLC (Vector)
 * @created 2026-02-13
 * @purpose Define CAIP-2 identifiers, asset addresses, and network configuration for Tron
 */
/** Tron Mainnet CAIP-2 identifier */
declare const TRON_MAINNET: "tron:27Lqcw";
/** Tron Shasta Testnet CAIP-2 identifier */
declare const TRON_SHASTA: "tron:4oPwXB";
/** Tron Nile Testnet CAIP-2 identifier */
declare const TRON_NILE: "tron:6FhfKq";
/** CAIP-2 family pattern for Tron networks */
declare const TRON_CAIP_FAMILY: "tron:*";
/** All supported Tron networks for V2 registration */
declare const TRON_NETWORKS: readonly ["tron:27Lqcw", "tron:4oPwXB", "tron:6FhfKq"];
/** Default RPC endpoints per CAIP-2 network identifier */
declare const TRON_RPC_URLS: Record<string, string>;
/** USDT TRC-20 contract addresses by CAIP-2 network */
declare const USDT_ADDRESSES: Record<string, string>;
/** USDC TRC-20 contract addresses by CAIP-2 network */
declare const USDC_ADDRESSES: Record<string, string>;
/** USDT decimals (6) - same across all TRC-20 USDT deployments */
declare const USDT_DECIMALS = 6;
/** USDC decimals (6) */
declare const USDC_DECIMALS = 6;
/** EruditePay wrapper contract address on Tron mainnet */
declare const ERUDITEPAY_WRAPPER_CONTRACT = "THGkLBrLY1G5VovZjjK1jP9upyxRdMNL3b";
/** EruditePay facilitator fee: 0.25% (25 basis points) */
declare const ERUDITEPAY_FEE_BPS = 25;
/** Minimal TRC-20 ABI for transfer and balance operations */
declare const TRC20_ABI: readonly [{
    readonly constant: false;
    readonly inputs: readonly [{
        readonly name: "_to";
        readonly type: "address";
    }, {
        readonly name: "_value";
        readonly type: "uint256";
    }];
    readonly name: "transfer";
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "bool";
    }];
    readonly type: "Function";
}, {
    readonly constant: true;
    readonly inputs: readonly [{
        readonly name: "_owner";
        readonly type: "address";
    }];
    readonly name: "balanceOf";
    readonly outputs: readonly [{
        readonly name: "balance";
        readonly type: "uint256";
    }];
    readonly type: "Function";
}, {
    readonly constant: true;
    readonly inputs: readonly [{
        readonly name: "_owner";
        readonly type: "address";
    }, {
        readonly name: "_spender";
        readonly type: "address";
    }];
    readonly name: "allowance";
    readonly outputs: readonly [{
        readonly name: "remaining";
        readonly type: "uint256";
    }];
    readonly type: "Function";
}, {
    readonly constant: false;
    readonly inputs: readonly [{
        readonly name: "_spender";
        readonly type: "address";
    }, {
        readonly name: "_value";
        readonly type: "uint256";
    }];
    readonly name: "approve";
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "bool";
    }];
    readonly type: "Function";
}, {
    readonly constant: true;
    readonly inputs: readonly [];
    readonly name: "decimals";
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint8";
    }];
    readonly type: "Function";
}];

/**
 * @module @erudite-intelligence/x402-tron-v2
 * @description x402 Payment Protocol V2 - Tron Network Plugin
 *
 * The first and only x402 V2 implementation for the TRON blockchain.
 * Enables USDT TRC-20 payments for AI agents, web services, and merchants
 * through the x402 payment protocol.
 *
 * @author Erudite Intelligence LLC (Vector)
 * @created 2026-02-13
 * @license MIT
 *
 * @example
 * ```typescript
 * // Facilitator setup (processing payments)
 * import { x402Facilitator } from "@x402/core/facilitator";
 * import { registerExactTronScheme, toFacilitatorTronSigner } from "@erudite-intelligence/x402-tron-v2";
 * import TronWeb from "tronweb";
 *
 * const tronWeb = new TronWeb({ fullHost: "https://api.trongrid.io", privateKey: "..." });
 * const facilitator = new x402Facilitator();
 * registerExactTronScheme(facilitator, {
 *   signer: toFacilitatorTronSigner(tronWeb),
 *   networks: "tron:27Lqcw", // Tron mainnet
 * });
 * ```
 */

/**
 * Helper to get the USDT address for a given Tron CAIP-2 network.
 * @param network - CAIP-2 network identifier (e.g., "tron:27Lqcw")
 * @returns USDT TRC-20 contract address or undefined
 */
declare function getUsdtAddress(network: string): string | undefined;
/**
 * Helper to convert a decimal USD amount to USDT smallest unit.
 * @param usdAmount - Amount in USD (e.g., 1.50)
 * @returns Amount in USDT smallest unit (e.g., "1500000")
 */
declare function usdToUsdt(usdAmount: number): string;

export { ERUDITEPAY_FEE_BPS, ERUDITEPAY_WRAPPER_CONTRACT, TRC20_ABI, TRON_CAIP_FAMILY, TRON_MAINNET, TRON_NETWORKS, TRON_NILE, TRON_RPC_URLS, TRON_SHASTA, USDC_ADDRESSES, USDC_DECIMALS, USDT_ADDRESSES, USDT_DECIMALS, getUsdtAddress, usdToUsdt };
