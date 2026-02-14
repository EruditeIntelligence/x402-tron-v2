/**
 * @module @erudite-intelligence/x402-tron-v2 - Facilitator Registration
 * @description Registration helper to add Tron support to any x402 V2 facilitator
 * @author Erudite Intelligence LLC (Vector)
 * @created 2026-02-13
 * @purpose One-line registration of Tron exact scheme into x402Facilitator
 *
 * CHANGELOG:
 * - 2026-02-13: Initial implementation. Mirrors registerExactEvmScheme/registerExactSvmScheme patterns.
 */

import { x402Facilitator } from "@x402/core/facilitator";
import type { Network } from "@x402/core/types";
import type { FacilitatorTronSigner } from "../../signer";
import type { TronFacilitatorConfig } from "../../types";
import { ExactTronScheme } from "./scheme";
import { TRON_NETWORKS } from "../../constants";

/**
 * Configuration options for registering Tron schemes to an x402Facilitator
 */
export interface TronFacilitatorRegistrationConfig {
  /**
   * The Tron signer for facilitator operations (verify and settle)
   */
  signer: FacilitatorTronSigner;

  /**
   * Networks to register (single network or array of networks).
   * Defaults to all Tron networks (mainnet, Shasta, Nile).
   *
   * @example
   * // Single network
   * networks: "tron:27Lqcw"
   *
   * @example
   * // Multiple networks
   * networks: ["tron:27Lqcw", "tron:4oPwXB"]
   *
   * @default TRON_NETWORKS (all supported Tron networks)
   */
  networks?: Network | Network[];

  /**
   * Optional scheme-level configuration
   */
  config?: TronFacilitatorConfig;
}

/**
 * Registers Tron exact payment schemes to an x402Facilitator instance.
 *
 * This is the primary integration point for adding Tron support to any
 * x402 V2 facilitator. Call this alongside registerExactEvmScheme and
 * registerExactSvmScheme to build a multi-chain facilitator.
 *
 * @param facilitator - The x402Facilitator instance to register schemes to
 * @param config - Configuration for Tron facilitator registration
 * @returns The facilitator instance for chaining
 *
 * @example
 * ```typescript
 * import { x402Facilitator } from "@x402/core/facilitator";
 * import { registerExactEvmScheme } from "@x402/evm/exact/facilitator/register";
 * import { registerExactTronScheme } from "@erudite-intelligence/x402-tron-v2/exact/facilitator/register";
 * import { toFacilitatorTronSigner } from "@erudite-intelligence/x402-tron-v2";
 * import TronWeb from "tronweb";
 *
 * const facilitator = new x402Facilitator();
 *
 * // Register EVM chains (Base, Ethereum, etc.)
 * registerExactEvmScheme(facilitator, { signer: evmSigner, networks: "eip155:8453" });
 *
 * // Register Tron (USDT TRC-20)
 * const tronWeb = new TronWeb({ fullHost: "https://api.trongrid.io", privateKey: "..." });
 * const tronSigner = toFacilitatorTronSigner(tronWeb);
 * registerExactTronScheme(facilitator, { signer: tronSigner });
 *
 * // Facilitator now handles both Base USDC and Tron USDT!
 * ```
 */
export function registerExactTronScheme(
  facilitator: x402Facilitator,
  config: TronFacilitatorRegistrationConfig,
): x402Facilitator {
  const networks = config.networks
    ? (Array.isArray(config.networks) ? config.networks : [config.networks])
    : [...TRON_NETWORKS] as Network[];

  // Register V2 scheme with specified networks
  facilitator.register(
    networks as Network[],
    new ExactTronScheme(config.signer, config.config),
  );

  // Note: V1 backwards compatibility is not registered for Tron because
  // Tron was never part of the x402 V1 spec. This is a V2-only chain.
  // If V1 support is needed in the future, it can be added here.

  return facilitator;
}
