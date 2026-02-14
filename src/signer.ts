/**
 * @module @erudite-intelligence/x402-tron-v2 - Signer
 * @description TronWeb signer abstraction for x402 V2 facilitator and client operations
 * @author Erudite Intelligence LLC (Vector)
 * @created 2026-02-13
 * @purpose Provide a clean signer interface matching x402 V2 patterns (EVM/SVM parity)
 */

import { TRON_RPC_URLS, TRC20_ABI } from "./constants";

// =============================================================================
// Client Signer
// =============================================================================

/**
 * Client-side signer for creating and signing Tron transactions.
 * Wraps a TronWeb instance with a connected wallet.
 */
export type ClientTronSigner = {
  /** The Tron address (base58) of the signer */
  readonly address: string;

  /**
   * Sign a transaction object and return the signed transaction hex
   * @param transaction - The unsigned Tron transaction object
   * @returns Signed transaction object with signature
   */
  signTransaction(transaction: Record<string, unknown>): Promise<Record<string, unknown>>;

  /**
   * Build a TRC-20 transfer transaction (unsigned)
   * @param contractAddress - TRC-20 token contract address
   * @param to - Recipient address
   * @param amount - Amount in smallest unit (e.g., 1000000 for 1 USDT)
   * @returns Unsigned transaction object
   */
  buildTrc20Transfer(
    contractAddress: string,
    to: string,
    amount: string,
  ): Promise<Record<string, unknown>>;
};

// =============================================================================
// Facilitator Signer
// =============================================================================

/**
 * Minimal facilitator signer interface for Tron operations.
 * Supports multiple addresses for load balancing.
 * All implementation details (TronWeb instances, key management) are hidden.
 *
 * Mirrors the FacilitatorSvmSigner and FacilitatorEvmSigner patterns
 * from the official x402 SDK for consistency.
 */
export type FacilitatorTronSigner = {
  /**
   * Get all addresses this facilitator can use for operations.
   * Enables dynamic address selection for load balancing.
   * @returns Array of base58 Tron addresses
   */
  getAddresses(): readonly string[];

  /**
   * Verify a signed transaction without broadcasting.
   * Checks: valid signature, correct format, sender matches claimed address.
   * @param signedTxHex - The signed transaction in hex
   * @param network - CAIP-2 network identifier (e.g., "tron:27Lqcw")
   * @returns Decoded transaction details for further verification
   */
  decodeTransaction(
    signedTxHex: string,
    network: string,
  ): Promise<DecodedTronTransaction>;

  /**
   * Broadcast a signed transaction to the Tron network.
   * @param signedTxHex - The signed transaction in hex
   * @param network - CAIP-2 network identifier
   * @returns Transaction hash (txID) on success
   * @throws Error if broadcast fails
   */
  broadcastTransaction(
    signedTxHex: string,
    network: string,
  ): Promise<string>;

  /**
   * Wait for transaction confirmation on the Tron network.
   * Polls until the transaction is confirmed or timeout.
   * @param txID - Transaction ID to confirm
   * @param network - CAIP-2 network identifier
   * @throws Error if confirmation fails or times out
   */
  confirmTransaction(txID: string, network: string): Promise<void>;

  /**
   * Get the TRC-20 token balance for an address.
   * @param tokenAddress - TRC-20 contract address
   * @param ownerAddress - Address to check balance for
   * @param network - CAIP-2 network identifier
   * @returns Balance in smallest unit (string)
   */
  getTokenBalance(
    tokenAddress: string,
    ownerAddress: string,
    network: string,
  ): Promise<string>;

  /**
   * Estimate the energy cost of a TRC-20 transfer.
   * @param tokenAddress - TRC-20 contract address
   * @param from - Sender address
   * @param to - Recipient address
   * @param amount - Transfer amount
   * @param network - CAIP-2 network identifier
   * @returns Estimated energy cost
   */
  estimateEnergy(
    tokenAddress: string,
    from: string,
    to: string,
    amount: string,
    network: string,
  ): Promise<number>;
};

// =============================================================================
// Decoded Transaction
// =============================================================================

/**
 * Decoded Tron transaction details for verification
 */
export interface DecodedTronTransaction {
  /** Transaction ID */
  txID: string;
  /** The contract type (e.g., "TriggerSmartContract") */
  contractType: string;
  /** The contract address being called */
  contractAddress: string;
  /** The function selector (first 4 bytes of keccak256 of function signature) */
  functionSelector: string;
  /** Decoded function parameters */
  parameters: {
    /** Recipient address (for transfer) */
    to?: string;
    /** Amount (for transfer) */
    amount?: string;
    /** Spender address (for approve) */
    spender?: string;
  };
  /** The sender (owner) address */
  ownerAddress: string;
  /** Transaction expiration timestamp */
  expiration: number;
  /** Raw signed transaction object */
  rawTransaction: Record<string, unknown>;
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a FacilitatorTronSigner from a TronWeb instance.
 *
 * @param tronWeb - TronWeb instance with private key configured
 * @param options - Optional configuration
 * @returns FacilitatorTronSigner ready for x402 V2 operations
 *
 * @example
 * ```typescript
 * import TronWeb from "tronweb";
 * import { toFacilitatorTronSigner } from "@erudite-intelligence/x402-tron-v2";
 *
 * const tronWeb = new TronWeb({
 *   fullHost: "https://api.trongrid.io",
 *   privateKey: process.env.TRON_PRIVATE_KEY,
 * });
 *
 * const signer = toFacilitatorTronSigner(tronWeb);
 * ```
 */
export function toFacilitatorTronSigner(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tronWeb: any,
  options?: { additionalRpcUrls?: Record<string, string> },
): FacilitatorTronSigner {
  const rpcUrls = { ...TRON_RPC_URLS, ...options?.additionalRpcUrls };

  /**
   * Get or create a TronWeb instance for a specific network.
   * Reuses the provided instance for the matching network,
   * creates new instances for other networks.
   */
  const getTronWebForNetwork = (network: string) => {
    const rpcUrl = rpcUrls[network];
    if (!rpcUrl) {
      throw new Error(`No RPC URL configured for network: ${network}`);
    }
    // If the current TronWeb instance points to the same host, reuse it
    if (tronWeb.fullNode?.host === rpcUrl || tronWeb.fullNode?.host === rpcUrl + "/") {
      return tronWeb;
    }
    // Create a new instance for a different network
    const TronWebClass = tronWeb.constructor;
    return new TronWebClass({
      fullHost: rpcUrl,
      privateKey: tronWeb.defaultPrivateKey,
    });
  };

  return {
    getAddresses: () => {
      return [tronWeb.defaultAddress?.base58 || tronWeb.address?.toBase58()];
    },

    decodeTransaction: async (signedTxHex: string, network: string) => {
      const tw = getTronWebForNetwork(network);
      let tx: Record<string, unknown>;

      try {
        tx = JSON.parse(signedTxHex);
      } catch {
        // If it's not JSON, try treating it as raw hex
        // TronWeb transactions are typically JSON objects
        throw new Error("Invalid transaction format: expected JSON-serialized Tron transaction");
      }

      // =====================================================================
      // CRITICAL: Verify the transaction signature BEFORE parsing anything.
      // Without this, an attacker can forge a transaction JSON with a rich
      // victim's address, pass all verification checks, get resource access,
      // and the settle() broadcast would fail (bad signature) — but the
      // damage (free service) is already done.
      // =====================================================================

      // Step 1: Verify signature array exists and is non-empty
      const signature = tx.signature as string[] | undefined;
      if (!signature || !Array.isArray(signature) || signature.length === 0) {
        throw new Error("Invalid transaction: missing or empty signature array");
      }

      // Step 2: Verify each signature is a valid hex string (65 bytes = 130 hex chars)
      for (const sig of signature) {
        if (typeof sig !== "string" || !/^[0-9a-fA-F]{130}$/.test(sig)) {
          throw new Error("Invalid transaction: malformed signature");
        }
      }

      // Step 3: Recompute the txID from raw_data to prevent txID tampering
      const rawDataHex = tx.raw_data_hex as string;
      if (!rawDataHex || typeof rawDataHex !== "string") {
        throw new Error("Invalid transaction: missing raw_data_hex");
      }

      // Validate raw_data_hex is actually valid hex
      if (!/^[0-9a-fA-F]+$/.test(rawDataHex)) {
        throw new Error("Invalid transaction: raw_data_hex contains non-hex characters");
      }

      const computedTxID = tw.utils.crypto.sha256(
        Buffer.from(rawDataHex, "hex"),
      );
      if (computedTxID !== tx.txID) {
        throw new Error(
          "Invalid transaction: txID does not match raw_data hash (possible tampering)",
        );
      }

      // Step 4: Verify the signature using TronWeb's public verification.
      // ECRecover the signer address to confirm it matches the transaction owner.
      // We use the raw transaction object (which includes raw_data + signature)
      // and let TronWeb handle the recovery ID and signing format internally.
      let recoveredBase58: string;
      try {
        // TronWeb.trx.verifyMessage or manual ECRecover from txID + signature.
        // The most reliable approach: recompute expected address from signature
        // using the transaction's own verification method.
        const messageBytes = Buffer.from(computedTxID, "hex");

        // Use Trx.ecRecover which handles Tron's signing format correctly
        // including the recovery ID (v value) in the 65th byte of the signature.
        const sigBytes = Buffer.from(signature[0], "hex");
        const v = sigBytes[64]; // Recovery ID
        const r = sigBytes.subarray(0, 32);
        const s = sigBytes.subarray(32, 64);

        // TronWeb uses secp256k1 recovery: recover pubkey from (r, s, v, hash)
        const recoveredHex = tw.utils.crypto.ecRecover(messageBytes, {
          r: r.toString("hex"),
          s: s.toString("hex"),
          v,
        });
        recoveredBase58 = tw.address.fromHex(recoveredHex);
      } catch (sigError) {
        throw new Error(
          `Signature recovery failed: ${sigError instanceof Error ? sigError.message : "unknown error"}`,
        );
      }

      const rawData = tx.raw_data as Record<string, unknown>;
      if (!rawData || !rawData.contract) {
        throw new Error("Invalid transaction: missing raw_data.contract");
      }

      const contracts = rawData.contract as Array<Record<string, unknown>>;
      if (!contracts || contracts.length === 0) {
        throw new Error("Invalid transaction: empty contract array");
      }

      const contract = contracts[0];
      const contractType = contract.type as string;
      const parameter = contract.parameter as Record<string, unknown>;
      const value = parameter?.value as Record<string, unknown>;

      // Handle TriggerSmartContract (TRC-20 transfers)
      if (contractType === "TriggerSmartContract") {
        const contractAddress = tw.address.fromHex(value.contract_address as string);
        const ownerAddress = tw.address.fromHex(value.owner_address as string);

        // Step 5: Verify the recovered signer matches the claimed owner
        if (recoveredBase58 !== ownerAddress) {
          throw new Error(
            `Signature verification failed: recovered ${recoveredBase58} but owner_address is ${ownerAddress}`,
          );
        }

        const data = value.data as string;

        // Validate data field exists and has minimum length for function selector
        if (!data || typeof data !== "string" || data.length < 8) {
          throw new Error("Invalid transaction: missing or malformed data field");
        }

        // =====================================================================
        // CRITICAL: Verify raw_data consistency with raw_data_hex.
        //
        // raw_data_hex is protobuf-encoded and is what the signature covers.
        // raw_data is a JSON representation that SHOULD match but is NOT
        // cryptographically bound to the signature. An attacker can:
        //   1. Create a real tx for 1 USDT, sign it properly
        //   2. Keep raw_data_hex and signature (which encode 1 USDT)
        //   3. Modify raw_data JSON to say 1,000,000 USDT
        //   4. verify() reads amount from raw_data → passes
        //   5. On-chain, raw_data_hex says 1 USDT → underpayment
        //
        // Defense: Verify that critical fields from raw_data (the ABI call
        // data, contract address, owner address) appear in raw_data_hex.
        // These fields are embedded in the protobuf encoding and must be
        // present. If an attacker tampers with raw_data, the values won't
        // appear in raw_data_hex.
        // =====================================================================

        // The ABI call data (contains function selector + recipient + amount)
        // must appear in raw_data_hex since protobuf stores it as raw bytes.
        const dataLower = data.toLowerCase();
        const rawDataHexLower = rawDataHex.toLowerCase();

        if (!rawDataHexLower.includes(dataLower)) {
          throw new Error(
            "Transaction integrity check failed: ABI call data in raw_data " +
            "does not match raw_data_hex (possible raw_data tampering)",
          );
        }

        // The contract address (hex, without 41 prefix) must appear in raw_data_hex
        const contractAddrHex = (value.contract_address as string).toLowerCase();
        if (!rawDataHexLower.includes(contractAddrHex)) {
          throw new Error(
            "Transaction integrity check failed: contract_address in raw_data " +
            "does not match raw_data_hex (possible raw_data tampering)",
          );
        }

        // The owner address (hex, without 41 prefix or with it) must appear
        const ownerAddrHex = (value.owner_address as string).toLowerCase();
        if (!rawDataHexLower.includes(ownerAddrHex)) {
          throw new Error(
            "Transaction integrity check failed: owner_address in raw_data " +
            "does not match raw_data_hex (possible raw_data tampering)",
          );
        }

        // Parse the function selector and parameters from the data field
        const functionSelector = data.substring(0, 8);
        const params: DecodedTronTransaction["parameters"] = {};

        // Validate data field is valid hex before parsing
        if (!/^[0-9a-fA-F]+$/.test(data)) {
          throw new Error("Invalid transaction: data field contains non-hex characters");
        }

        // transfer(address,uint256) selector: a9059cbb
        // Expected data layout: 8 (selector) + 64 (address padded) + 64 (uint256) = 136 chars
        if (functionSelector === "a9059cbb") {
          if (data.length < 136) {
            throw new Error(
              `Invalid transfer data: expected 136+ hex chars, got ${data.length}`,
            );
          }
          // Validate address padding (bytes 4-15 should be zero in ABI encoding)
          const addressPadding = data.substring(8, 32);
          if (!/^0+$/.test(addressPadding)) {
            throw new Error(
              "Invalid transfer data: non-zero padding in address parameter",
            );
          }
          const toHex = "41" + data.substring(32, 72);
          params.to = tw.address.fromHex(toHex);
          params.amount = BigInt("0x" + data.substring(72, 136)).toString();
        }
        // approve(address,uint256) selector: 095ea7b3
        else if (functionSelector === "095ea7b3") {
          if (data.length < 136) {
            throw new Error(
              `Invalid approve data: expected 136+ hex chars, got ${data.length}`,
            );
          }
          const addressPadding = data.substring(8, 32);
          if (!/^0+$/.test(addressPadding)) {
            throw new Error(
              "Invalid approve data: non-zero padding in address parameter",
            );
          }
          const spenderHex = "41" + data.substring(32, 72);
          params.spender = tw.address.fromHex(spenderHex);
          params.amount = BigInt("0x" + data.substring(72, 136)).toString();
        }

        return {
          txID: computedTxID, // Use the COMPUTED txID, not the claimed one
          contractType,
          contractAddress,
          functionSelector,
          parameters: params,
          ownerAddress,
          expiration: rawData.expiration as number,
          rawTransaction: tx,
        };
      }

      throw new Error(`Unsupported contract type: ${contractType}`);
    },

    broadcastTransaction: async (signedTxHex: string, network: string) => {
      const tw = getTronWebForNetwork(network);
      let signedTx: Record<string, unknown>;

      try {
        signedTx = JSON.parse(signedTxHex);
      } catch {
        throw new Error("Invalid transaction format for broadcast");
      }

      const result = await tw.trx.sendRawTransaction(signedTx);

      if (result.result === true || result.code === "SUCCESS") {
        return result.txid || (signedTx.txID as string);
      }

      const errorMsg = result.message
        ? Buffer.from(result.message, "hex").toString("utf8")
        : result.code || "Unknown broadcast error";
      throw new Error(`Broadcast failed: ${errorMsg}`);
    },

    confirmTransaction: async (txID: string, network: string) => {
      const tw = getTronWebForNetwork(network);
      const maxAttempts = 30;
      const pollInterval = 3000; // 3 seconds (Tron block time ~3s)

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const txInfo = await tw.trx.getTransactionInfo(txID);
          if (txInfo && txInfo.id) {
            // Transaction found in a block — check execution result.
            // For TRC-20 calls, the receipt.result indicates whether the
            // smart contract execution succeeded. Possible values:
            //   SUCCESS, REVERT, OUT_OF_ENERGY, OUT_OF_TIME, OTHER_ERROR
            //
            // We ONLY accept SUCCESS. Any other result means the USDT
            // transfer did not execute, even though the tx is on-chain.
            const receiptResult = txInfo.receipt?.result;

            if (receiptResult === "SUCCESS") {
              return; // Smart contract execution confirmed successful
            }

            if (receiptResult) {
              // Transaction is on-chain but execution FAILED.
              // The USDT did NOT move. This is NOT a successful payment.
              throw new Error(
                `Transaction on-chain but execution failed: ${receiptResult}` +
                (txInfo.resMessage ? ` — ${txInfo.resMessage}` : ""),
              );
            }

            // If no receipt yet, the transaction might still be processing.
            // For TriggerSmartContract txs, receipt should appear within
            // the same block. If txInfo has the id but no receipt after
            // multiple attempts, something is wrong.
            if (attempt > 5 && !receiptResult) {
              throw new Error(
                "Transaction found on-chain but missing execution receipt after multiple checks",
              );
            }
          }
        } catch (e) {
          // If this is our own thrown error (not a network error), rethrow
          if (e instanceof Error && (
            e.message.includes("execution failed") ||
            e.message.includes("missing execution receipt")
          )) {
            throw e;
          }
          // Transaction not yet indexed, keep polling
          if (attempt === maxAttempts - 1) throw e;
        }
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      }

      throw new Error(`Transaction confirmation timeout after ${maxAttempts * pollInterval / 1000}s`);
    },

    getTokenBalance: async (
      tokenAddress: string,
      ownerAddress: string,
      network: string,
    ) => {
      const tw = getTronWebForNetwork(network);
      const contract = await tw.contract(TRC20_ABI, tokenAddress);
      const balance = await contract.methods.balanceOf(ownerAddress).call();
      return balance.toString();
    },

    estimateEnergy: async (
      tokenAddress: string,
      from: string,
      to: string,
      amount: string,
      network: string,
    ) => {
      const tw = getTronWebForNetwork(network);
      try {
        const result = await tw.transactionBuilder.estimateEnergy(
          tokenAddress,
          "transfer(address,uint256)",
          {},
          [
            { type: "address", value: to },
            { type: "uint256", value: amount },
          ],
          from,
        );
        return result.energy_required || 65000;
      } catch {
        // Fallback to conservative estimate
        return 65000;
      }
    },
  };
}

/**
 * Create a ClientTronSigner from a TronWeb instance.
 *
 * @param tronWeb - TronWeb instance with private key configured
 * @returns ClientTronSigner for creating payment payloads
 *
 * @example
 * ```typescript
 * import TronWeb from "tronweb";
 * import { toClientTronSigner } from "@erudite-intelligence/x402-tron-v2";
 *
 * const tronWeb = new TronWeb({
 *   fullHost: "https://api.trongrid.io",
 *   privateKey: process.env.TRON_PRIVATE_KEY,
 * });
 *
 * const signer = toClientTronSigner(tronWeb);
 * ```
 */
export function toClientTronSigner(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tronWeb: any,
): ClientTronSigner {
  return {
    address: tronWeb.defaultAddress?.base58 || tronWeb.address?.toBase58(),

    signTransaction: async (transaction: Record<string, unknown>) => {
      return await tronWeb.trx.sign(transaction);
    },

    buildTrc20Transfer: async (
      contractAddress: string,
      to: string,
      amount: string,
    ) => {
      const functionSelector = "transfer(address,uint256)";
      const parameter = [
        { type: "address", value: to },
        { type: "uint256", value: amount },
      ];

      const tx = await tronWeb.transactionBuilder.triggerSmartContract(
        contractAddress,
        functionSelector,
        { feeLimit: 80_000_000 }, // 80 TRX max fee (typical USDT transfer ~30-50 TRX)
        parameter,
      );

      return tx.transaction;
    },
  };
}
