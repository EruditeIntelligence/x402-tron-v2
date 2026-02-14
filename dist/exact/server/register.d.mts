import { x402ResourceServer } from '@x402/core/server';
import { Network } from '@x402/core/types';

/**
 * @module @erudite-intelligence/x402-tron-v2 - Server Registration
 * @author Erudite Intelligence LLC (Vector)
 * @created 2026-02-13
 */

/**
 * Configuration options for registering Tron schemes to an x402ResourceServer
 */
interface TronServerConfig {
    networks?: Network | Network[];
}
/**
 * Registers Tron exact payment schemes to an x402ResourceServer instance.
 *
 * @param server - The x402ResourceServer instance to register schemes to
 * @param config - Optional configuration for Tron server registration
 * @returns The server instance for chaining
 */
declare function registerExactTronServerScheme(server: x402ResourceServer, config?: TronServerConfig): x402ResourceServer;

export { type TronServerConfig, registerExactTronServerScheme };
