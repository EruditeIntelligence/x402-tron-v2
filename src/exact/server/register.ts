/**
 * @module @erudite-intelligence/x402-tron-v2 - Server Registration
 * @author Erudite Intelligence LLC (Vector)
 * @created 2026-02-13
 */

import { x402ResourceServer } from "@x402/core/server";
import type { Network } from "@x402/core/types";
import { ExactTronScheme } from "./scheme";
import { TRON_NETWORKS } from "../../constants";

/**
 * Configuration options for registering Tron schemes to an x402ResourceServer
 */
export interface TronServerConfig {
  networks?: Network | Network[];
}

/**
 * Registers Tron exact payment schemes to an x402ResourceServer instance.
 *
 * @param server - The x402ResourceServer instance to register schemes to
 * @param config - Optional configuration for Tron server registration
 * @returns The server instance for chaining
 */
export function registerExactTronServerScheme(
  server: x402ResourceServer,
  config?: TronServerConfig,
): x402ResourceServer {
  const networks = config?.networks
    ? (Array.isArray(config.networks) ? config.networks : [config.networks])
    : ([...TRON_NETWORKS] as Network[]);

  const scheme = new ExactTronScheme();

  // x402ResourceServer.register() takes a single Network per call
  for (const network of networks) {
    server.register(network, scheme);
  }

  return server;
}
