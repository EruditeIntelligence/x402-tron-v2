import { x402Client } from '@x402/core/client';
import { Network } from '@x402/core/types';
import { C as ClientTronSigner } from '../../signer-B4A63VxW.js';

/**
 * @module @erudite-intelligence/x402-tron-v2 - Client Registration
 * @author Erudite Intelligence LLC (Vector)
 * @created 2026-02-13
 */

/**
 * Configuration options for registering Tron schemes to an x402Client
 */
interface TronClientConfig {
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
declare function registerExactTronClientScheme(client: x402Client, config: TronClientConfig): x402Client;

export { type TronClientConfig, registerExactTronClientScheme };
