/**
 * @module @erudite-intelligence/x402-tron-v2 - Client Registration
 * @author Erudite Intelligence LLC (Vector)
 * @created 2026-02-13
 */

import { x402Client } from "@x402/core/client";
import type { Network } from "@x402/core/types";
import type { ClientTronSigner } from "../../signer";
import { ExactTronScheme } from "./scheme";
import { TRON_NETWORKS } from "../../constants";

/**
 * Configuration options for registering Tron schemes to an x402Client
 */
export interface TronClientConfig {
  signer: ClientTronSigner;
  networks?: Network | Network[];
}

/**
 * Registers Tron exact payment schemes to an x402Client instance.
 *
 * @param client - The x402Client instance to register schemes to
 * @param config - Configuration for Tron client registration
 * @returns The client instance for chaining
 */
export function registerExactTronClientScheme(
  client: x402Client,
  config: TronClientConfig,
): x402Client {
  const networks = config.networks
    ? (Array.isArray(config.networks) ? config.networks : [config.networks])
    : ([...TRON_NETWORKS] as Network[]);

  const scheme = new ExactTronScheme(config.signer);

  // x402Client.register() takes a single Network per call (unlike x402Facilitator)
  for (const network of networks) {
    client.register(network, scheme);
  }

  return client;
}
