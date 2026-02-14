// src/types.ts
function isSignedTransactionPayload(payload) {
  if (typeof payload !== "object" || payload === null) return false;
  const p = payload;
  return typeof p.signedTransaction === "string" && typeof p.from === "string" && !("method" in p);
}
function isApprovePayload(payload) {
  if (typeof payload !== "object" || payload === null) return false;
  const p = payload;
  return p.method === "approve" && typeof p.signedApproval === "string";
}

// src/exact/facilitator/scheme.ts
var ExactTronScheme = class {
  /**
   * Creates a new ExactTronScheme facilitator instance.
   *
   * @param signer - The Tron signer for facilitator operations
   * @param config - Optional configuration for the facilitator
   */
  constructor(signer, config) {
    this.signer = signer;
    this.config = {
      useWrapperContract: config?.useWrapperContract ?? false,
      maxEnergyFeeSun: config?.maxEnergyFeeSun ?? 1e8,
      // 100 TRX — reserved for future use
      feeDelegation: config?.feeDelegation ?? false
    };
  }
  scheme = "exact";
  caipFamily = "tron:*";
  config;
  /**
   * Get mechanism-specific extra data for the supported kinds endpoint.
   *
   * Currently returns minimal metadata. energyDelegation and wrapperContract
   * will be exposed here once those features are implemented.
   *
   * @param _network - The network identifier (currently unused)
   * @returns Extra data for clients, or undefined if no extra data
   */
  getExtra(_network) {
    return void 0;
  }
  /**
   * Get signer addresses used by this facilitator.
   * @param _network - The network identifier (unused - Tron addresses are network-agnostic)
   * @returns Array of facilitator Tron addresses (base58)
   */
  getSigners(_network) {
    return [...this.signer.getAddresses()];
  }
  /**
   * Verifies a Tron payment payload.
   *
   * Security checks performed:
   * - Scheme and network validation
   * - Transaction format validation (must be a TRC-20 transfer)
   * - Token contract matches required asset
   * - Recipient matches payTo address
   * - Amount meets or exceeds required amount
   * - Sender has sufficient token balance
   * - Transaction has not expired
   * - Facilitator address is NOT the sender (prevent self-transfers)
   *
   * @param payload - The payment payload to verify
   * @param requirements - The payment requirements
   * @returns Promise resolving to verification response
   */
  async verify(payload, requirements) {
    if (payload.accepted.scheme !== "exact" || requirements.scheme !== "exact") {
      return {
        isValid: false,
        invalidReason: "unsupported_scheme",
        payer: ""
      };
    }
    if (payload.accepted.network !== requirements.network) {
      return {
        isValid: false,
        invalidReason: "network_mismatch",
        payer: ""
      };
    }
    const rawPayload = payload.payload;
    if (!isSignedTransactionPayload(rawPayload)) {
      return {
        isValid: false,
        invalidReason: "invalid_tron_payload_type",
        invalidMessage: "Expected signed transaction payload with 'signedTransaction' and 'from' fields",
        payer: ""
      };
    }
    const tronPayload = rawPayload;
    let decoded;
    try {
      decoded = await this.signer.decodeTransaction(
        tronPayload.signedTransaction,
        requirements.network
      );
    } catch (error) {
      return {
        isValid: false,
        invalidReason: "invalid_tron_payload_decode_failed",
        invalidMessage: error instanceof Error ? error.message : "Failed to decode transaction",
        payer: tronPayload.from
      };
    }
    if (decoded.contractType !== "TriggerSmartContract") {
      return {
        isValid: false,
        invalidReason: "invalid_tron_payload_not_smart_contract",
        invalidMessage: `Expected TriggerSmartContract, got ${decoded.contractType}`,
        payer: tronPayload.from
      };
    }
    if (decoded.functionSelector !== "a9059cbb") {
      return {
        isValid: false,
        invalidReason: "invalid_tron_payload_not_transfer",
        invalidMessage: `Expected transfer(address,uint256) selector a9059cbb, got ${decoded.functionSelector}`,
        payer: tronPayload.from
      };
    }
    if (decoded.contractAddress !== requirements.asset) {
      return {
        isValid: false,
        invalidReason: "invalid_tron_payload_asset_mismatch",
        invalidMessage: `Expected asset ${requirements.asset}, transaction targets ${decoded.contractAddress}`,
        payer: tronPayload.from
      };
    }
    if (decoded.parameters.to !== requirements.payTo) {
      return {
        isValid: false,
        invalidReason: "invalid_tron_payload_recipient_mismatch",
        invalidMessage: `Expected recipient ${requirements.payTo}, transaction sends to ${decoded.parameters.to}`,
        payer: tronPayload.from
      };
    }
    const txAmount = BigInt(decoded.parameters.amount || "0");
    const requiredAmount = BigInt(requirements.amount);
    if (txAmount < requiredAmount) {
      return {
        isValid: false,
        invalidReason: "invalid_tron_payload_amount_insufficient",
        invalidMessage: `Required ${requiredAmount.toString()}, transaction sends ${txAmount.toString()}`,
        payer: tronPayload.from
      };
    }
    if (decoded.ownerAddress !== tronPayload.from) {
      return {
        isValid: false,
        invalidReason: "invalid_tron_payload_sender_mismatch",
        invalidMessage: "Transaction owner does not match claimed sender",
        payer: tronPayload.from
      };
    }
    const facilitatorAddresses = this.signer.getAddresses();
    if (facilitatorAddresses.includes(decoded.ownerAddress)) {
      return {
        isValid: false,
        invalidReason: "invalid_tron_payload_facilitator_is_sender",
        invalidMessage: "Facilitator address cannot be the payment sender",
        payer: tronPayload.from
      };
    }
    const now = Date.now();
    if (decoded.expiration && decoded.expiration < now) {
      return {
        isValid: false,
        invalidReason: "invalid_tron_payload_expired",
        invalidMessage: `Transaction expired at ${new Date(decoded.expiration).toISOString()}`,
        payer: tronPayload.from
      };
    }
    try {
      const balance = await this.signer.getTokenBalance(
        requirements.asset,
        decoded.ownerAddress,
        requirements.network
      );
      const balanceBigInt = BigInt(balance);
      if (balanceBigInt < requiredAmount) {
        return {
          isValid: false,
          invalidReason: "invalid_tron_payload_insufficient_balance",
          invalidMessage: `Sender balance ${balance} < required ${requirements.amount}`,
          payer: tronPayload.from
        };
      }
    } catch (error) {
      return {
        isValid: false,
        invalidReason: "invalid_tron_payload_balance_check_failed",
        invalidMessage: error instanceof Error ? error.message : "Balance check failed",
        payer: tronPayload.from
      };
    }
    try {
      const estimatedEnergy = await this.signer.estimateEnergy(
        requirements.asset,
        decoded.ownerAddress,
        decoded.parameters.to || requirements.payTo,
        requirements.amount,
        requirements.network
      );
      const estimatedFeeSun = estimatedEnergy * 420;
      if (estimatedFeeSun > this.config.maxEnergyFeeSun) {
        return {
          isValid: false,
          invalidReason: "invalid_tron_payload_energy_too_expensive",
          invalidMessage: `Estimated energy cost ${estimatedFeeSun} SUN exceeds max ${this.config.maxEnergyFeeSun} SUN`,
          payer: tronPayload.from
        };
      }
    } catch {
    }
    return {
      isValid: true,
      invalidReason: void 0,
      payer: tronPayload.from
    };
  }
  /**
   * Settles a payment by broadcasting the signed transaction to the Tron network.
   *
   * @param payload - The payment payload to settle
   * @param requirements - The payment requirements
   * @returns Promise resolving to settlement response with transaction hash
   */
  async settle(payload, requirements) {
    const verification = await this.verify(payload, requirements);
    if (!verification.isValid) {
      return {
        success: false,
        network: payload.accepted.network,
        transaction: "",
        errorReason: verification.invalidReason ?? "verification_failed",
        errorMessage: verification.invalidMessage,
        payer: verification.payer || ""
      };
    }
    const tronPayload = payload.payload;
    try {
      await this.signer.decodeTransaction(
        tronPayload.signedTransaction,
        requirements.network
      );
      const txID = await this.signer.broadcastTransaction(
        tronPayload.signedTransaction,
        requirements.network
      );
      await this.signer.confirmTransaction(txID, requirements.network);
      return {
        success: true,
        transaction: txID,
        network: payload.accepted.network,
        payer: verification.payer
      };
    } catch (error) {
      console.error("[x402-tron] Settlement failed:", error);
      return {
        success: false,
        errorReason: "transaction_broadcast_failed",
        errorMessage: error instanceof Error ? error.message : "Unknown broadcast error",
        transaction: "",
        network: payload.accepted.network,
        payer: verification.payer || ""
      };
    }
  }
};

// src/constants.ts
var TRON_MAINNET = "tron:27Lqcw";
var TRON_SHASTA = "tron:4oPwXB";
var TRON_NILE = "tron:6FhfKq";
var TRON_CAIP_FAMILY = "tron:*";
var TRON_NETWORKS = [TRON_MAINNET, TRON_SHASTA, TRON_NILE];
var TRON_RPC_URLS = {
  [TRON_MAINNET]: "https://api.trongrid.io",
  [TRON_SHASTA]: "https://api.shasta.trongrid.io",
  [TRON_NILE]: "https://nile.trongrid.io"
};
var USDT_ADDRESSES = {
  [TRON_MAINNET]: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
  [TRON_SHASTA]: "TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs",
  // Shasta USDT
  [TRON_NILE]: "TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj"
  // Nile USDT
};
var USDC_ADDRESSES = {
  [TRON_MAINNET]: "TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8"
};
var USDT_DECIMALS = 6;
var USDC_DECIMALS = 6;
var ERUDITEPAY_WRAPPER_CONTRACT = "THGkLBrLY1G5VovZjjK1jP9upyxRdMNL3b";
var ERUDITEPAY_FEE_BPS = 25;
var TRC20_ABI = [
  {
    constant: false,
    inputs: [
      { name: "_to", type: "address" },
      { name: "_value", type: "uint256" }
    ],
    name: "transfer",
    outputs: [{ name: "", type: "bool" }],
    type: "Function"
  },
  {
    constant: true,
    inputs: [{ name: "_owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "balance", type: "uint256" }],
    type: "Function"
  },
  {
    constant: true,
    inputs: [
      { name: "_owner", type: "address" },
      { name: "_spender", type: "address" }
    ],
    name: "allowance",
    outputs: [{ name: "remaining", type: "uint256" }],
    type: "Function"
  },
  {
    constant: false,
    inputs: [
      { name: "_spender", type: "address" },
      { name: "_value", type: "uint256" }
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    type: "Function"
  },
  {
    constant: true,
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    type: "Function"
  }
];

// src/exact/facilitator/register.ts
function registerExactTronScheme(facilitator, config) {
  const networks = config.networks ? Array.isArray(config.networks) ? config.networks : [config.networks] : [...TRON_NETWORKS];
  facilitator.register(
    networks,
    new ExactTronScheme(config.signer, config.config)
  );
  return facilitator;
}

// src/exact/client/scheme.ts
var ExactTronScheme2 = class {
  /**
   * Creates a new ExactTronScheme client instance.
   *
   * @param signer - The Tron signer for client operations
   */
  constructor(signer) {
    this.signer = signer;
  }
  scheme = "exact";
  /**
   * Creates a payment payload for the Exact scheme on Tron.
   *
   * Builds a TRC-20 transfer transaction targeting the merchant's (payTo) address
   * for the required amount, signs it, and packages it as an x402 payload.
   *
   * @param x402Version - The x402 protocol version
   * @param paymentRequirements - The payment requirements from the resource server
   * @returns Promise resolving to a payment payload result
   *
   * @example
   * ```typescript
   * const client = new ExactTronScheme(signer);
   * const payload = await client.createPaymentPayload(2, {
   *   scheme: "exact",
   *   network: "tron:27Lqcw",
   *   asset: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", // USDT
   *   amount: "1000000", // 1 USDT
   *   payTo: "TRecipientAddress...",
   *   maxTimeoutSeconds: 300,
   *   extra: {},
   * });
   * ```
   */
  async createPaymentPayload(x402Version, paymentRequirements) {
    const unsignedTx = await this.signer.buildTrc20Transfer(
      paymentRequirements.asset,
      // Token contract (e.g., USDT TRC-20)
      paymentRequirements.payTo,
      // Merchant address
      paymentRequirements.amount
      // Amount in smallest unit
    );
    const signedTx = await this.signer.signTransaction(unsignedTx);
    return {
      x402Version,
      payload: {
        signedTransaction: JSON.stringify(signedTx),
        from: this.signer.address,
        txID: signedTx.txID
      }
    };
  }
};

// src/exact/client/register.ts
function registerExactTronClientScheme(client, config) {
  const networks = config.networks ? Array.isArray(config.networks) ? config.networks : [config.networks] : [...TRON_NETWORKS];
  const scheme = new ExactTronScheme2(config.signer);
  for (const network of networks) {
    client.register(network, scheme);
  }
  return client;
}

// src/exact/server/scheme.ts
var ExactTronScheme3 = class {
  scheme = "exact";
  moneyParsers = [];
  /**
   * Register a custom money parser in the parser chain.
   * Multiple parsers can be registered - they are tried in registration order.
   * If a parser returns null, the next parser is tried.
   * The default USDT parser is always the final fallback.
   *
   * @param parser - Custom function to convert amount to AssetAmount (or null to skip)
   * @returns The service instance for chaining
   */
  registerMoneyParser(parser) {
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
  async parsePrice(price, network) {
    if (typeof price === "object" && price !== null && "amount" in price) {
      if (!price.asset) {
        throw new Error(`Asset address must be specified for AssetAmount on network ${network}`);
      }
      return {
        amount: price.amount,
        asset: price.asset,
        extra: price.extra || {}
      };
    }
    const amount = this.parseMoneyToDecimal(price);
    for (const parser of this.moneyParsers) {
      const result = await parser(amount, network);
      if (result !== null) {
        return result;
      }
    }
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
  enhancePaymentRequirements(paymentRequirements, supportedKind, extensionKeys) {
    void extensionKeys;
    const extraData = {
      ...paymentRequirements.extra
    };
    if (supportedKind.extra) {
      for (const [key, val] of Object.entries(supportedKind.extra)) {
        if (val !== void 0) {
          extraData[key] = val;
        }
      }
    }
    return Promise.resolve({
      ...paymentRequirements,
      extra: extraData
    });
  }
  /**
   * Parse Money (string | number) to a decimal number.
   * Handles formats like "$1.50", "1.50", 1.50, etc.
   */
  parseMoneyToDecimal(money) {
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
  defaultMoneyConversion(amount, network) {
    const usdtAddress = USDT_ADDRESSES[network];
    if (!usdtAddress) {
      throw new Error(
        `No default USDT address configured for network ${network}. Provide an explicit AssetAmount or register a custom MoneyParser.`
      );
    }
    const tokenAmount = Math.round(amount * 10 ** USDT_DECIMALS).toString();
    return {
      amount: tokenAmount,
      asset: usdtAddress,
      extra: {}
    };
  }
};

// src/exact/server/register.ts
function registerExactTronServerScheme(server, config) {
  const networks = config?.networks ? Array.isArray(config.networks) ? config.networks : [config.networks] : [...TRON_NETWORKS];
  const scheme = new ExactTronScheme3();
  for (const network of networks) {
    server.register(network, scheme);
  }
  return server;
}

// src/signer.ts
function toFacilitatorTronSigner(tronWeb, options) {
  const rpcUrls = { ...TRON_RPC_URLS, ...options?.additionalRpcUrls };
  const getTronWebForNetwork = (network) => {
    const rpcUrl = rpcUrls[network];
    if (!rpcUrl) {
      throw new Error(`No RPC URL configured for network: ${network}`);
    }
    if (tronWeb.fullNode?.host === rpcUrl || tronWeb.fullNode?.host === rpcUrl + "/") {
      return tronWeb;
    }
    const TronWebClass = tronWeb.constructor;
    return new TronWebClass({
      fullHost: rpcUrl,
      privateKey: tronWeb.defaultPrivateKey
    });
  };
  return {
    getAddresses: () => {
      return [tronWeb.defaultAddress?.base58 || tronWeb.address?.toBase58()];
    },
    decodeTransaction: async (signedTxHex, network) => {
      const tw = getTronWebForNetwork(network);
      let tx;
      try {
        tx = JSON.parse(signedTxHex);
      } catch {
        throw new Error("Invalid transaction format: expected JSON-serialized Tron transaction");
      }
      const signature = tx.signature;
      if (!signature || !Array.isArray(signature) || signature.length === 0) {
        throw new Error("Invalid transaction: missing or empty signature array");
      }
      for (const sig of signature) {
        if (typeof sig !== "string" || !/^[0-9a-fA-F]{130}$/.test(sig)) {
          throw new Error("Invalid transaction: malformed signature");
        }
      }
      const rawDataHex = tx.raw_data_hex;
      if (!rawDataHex || typeof rawDataHex !== "string") {
        throw new Error("Invalid transaction: missing raw_data_hex");
      }
      if (!/^[0-9a-fA-F]+$/.test(rawDataHex)) {
        throw new Error("Invalid transaction: raw_data_hex contains non-hex characters");
      }
      const computedTxID = tw.utils.crypto.sha256(
        Buffer.from(rawDataHex, "hex")
      );
      if (computedTxID !== tx.txID) {
        throw new Error(
          "Invalid transaction: txID does not match raw_data hash (possible tampering)"
        );
      }
      let recoveredBase58;
      try {
        const messageBytes = Buffer.from(computedTxID, "hex");
        const sigBytes = Buffer.from(signature[0], "hex");
        const v = sigBytes[64];
        const r = sigBytes.subarray(0, 32);
        const s = sigBytes.subarray(32, 64);
        const recoveredHex = tw.utils.crypto.ecRecover(messageBytes, {
          r: r.toString("hex"),
          s: s.toString("hex"),
          v
        });
        recoveredBase58 = tw.address.fromHex(recoveredHex);
      } catch (sigError) {
        throw new Error(
          `Signature recovery failed: ${sigError instanceof Error ? sigError.message : "unknown error"}`
        );
      }
      const rawData = tx.raw_data;
      if (!rawData || !rawData.contract) {
        throw new Error("Invalid transaction: missing raw_data.contract");
      }
      const contracts = rawData.contract;
      if (!contracts || contracts.length === 0) {
        throw new Error("Invalid transaction: empty contract array");
      }
      const contract = contracts[0];
      const contractType = contract.type;
      const parameter = contract.parameter;
      const value = parameter?.value;
      if (contractType === "TriggerSmartContract") {
        const contractAddress = tw.address.fromHex(value.contract_address);
        const ownerAddress = tw.address.fromHex(value.owner_address);
        if (recoveredBase58 !== ownerAddress) {
          throw new Error(
            `Signature verification failed: recovered ${recoveredBase58} but owner_address is ${ownerAddress}`
          );
        }
        const data = value.data;
        if (!data || typeof data !== "string" || data.length < 8) {
          throw new Error("Invalid transaction: missing or malformed data field");
        }
        const dataLower = data.toLowerCase();
        const rawDataHexLower = rawDataHex.toLowerCase();
        if (!rawDataHexLower.includes(dataLower)) {
          throw new Error(
            "Transaction integrity check failed: ABI call data in raw_data does not match raw_data_hex (possible raw_data tampering)"
          );
        }
        const contractAddrHex = value.contract_address.toLowerCase();
        if (!rawDataHexLower.includes(contractAddrHex)) {
          throw new Error(
            "Transaction integrity check failed: contract_address in raw_data does not match raw_data_hex (possible raw_data tampering)"
          );
        }
        const ownerAddrHex = value.owner_address.toLowerCase();
        if (!rawDataHexLower.includes(ownerAddrHex)) {
          throw new Error(
            "Transaction integrity check failed: owner_address in raw_data does not match raw_data_hex (possible raw_data tampering)"
          );
        }
        const functionSelector = data.substring(0, 8);
        const params = {};
        if (!/^[0-9a-fA-F]+$/.test(data)) {
          throw new Error("Invalid transaction: data field contains non-hex characters");
        }
        if (functionSelector === "a9059cbb") {
          if (data.length < 136) {
            throw new Error(
              `Invalid transfer data: expected 136+ hex chars, got ${data.length}`
            );
          }
          const addressPadding = data.substring(8, 32);
          if (!/^0+$/.test(addressPadding)) {
            throw new Error(
              "Invalid transfer data: non-zero padding in address parameter"
            );
          }
          const toHex = "41" + data.substring(32, 72);
          params.to = tw.address.fromHex(toHex);
          params.amount = BigInt("0x" + data.substring(72, 136)).toString();
        } else if (functionSelector === "095ea7b3") {
          if (data.length < 136) {
            throw new Error(
              `Invalid approve data: expected 136+ hex chars, got ${data.length}`
            );
          }
          const addressPadding = data.substring(8, 32);
          if (!/^0+$/.test(addressPadding)) {
            throw new Error(
              "Invalid approve data: non-zero padding in address parameter"
            );
          }
          const spenderHex = "41" + data.substring(32, 72);
          params.spender = tw.address.fromHex(spenderHex);
          params.amount = BigInt("0x" + data.substring(72, 136)).toString();
        }
        return {
          txID: computedTxID,
          // Use the COMPUTED txID, not the claimed one
          contractType,
          contractAddress,
          functionSelector,
          parameters: params,
          ownerAddress,
          expiration: rawData.expiration,
          rawTransaction: tx
        };
      }
      throw new Error(`Unsupported contract type: ${contractType}`);
    },
    broadcastTransaction: async (signedTxHex, network) => {
      const tw = getTronWebForNetwork(network);
      let signedTx;
      try {
        signedTx = JSON.parse(signedTxHex);
      } catch {
        throw new Error("Invalid transaction format for broadcast");
      }
      const result = await tw.trx.sendRawTransaction(signedTx);
      if (result.result === true || result.code === "SUCCESS") {
        return result.txid || signedTx.txID;
      }
      const errorMsg = result.message ? Buffer.from(result.message, "hex").toString("utf8") : result.code || "Unknown broadcast error";
      throw new Error(`Broadcast failed: ${errorMsg}`);
    },
    confirmTransaction: async (txID, network) => {
      const tw = getTronWebForNetwork(network);
      const maxAttempts = 30;
      const pollInterval = 3e3;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const txInfo = await tw.trx.getTransactionInfo(txID);
          if (txInfo && txInfo.id) {
            const receiptResult = txInfo.receipt?.result;
            if (receiptResult === "SUCCESS") {
              return;
            }
            if (receiptResult) {
              throw new Error(
                `Transaction on-chain but execution failed: ${receiptResult}` + (txInfo.resMessage ? ` \u2014 ${txInfo.resMessage}` : "")
              );
            }
            if (attempt > 5 && !receiptResult) {
              throw new Error(
                "Transaction found on-chain but missing execution receipt after multiple checks"
              );
            }
          }
        } catch (e) {
          if (e instanceof Error && (e.message.includes("execution failed") || e.message.includes("missing execution receipt"))) {
            throw e;
          }
          if (attempt === maxAttempts - 1) throw e;
        }
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      }
      throw new Error(`Transaction confirmation timeout after ${maxAttempts * pollInterval / 1e3}s`);
    },
    getTokenBalance: async (tokenAddress, ownerAddress, network) => {
      const tw = getTronWebForNetwork(network);
      const contract = await tw.contract(TRC20_ABI, tokenAddress);
      const balance = await contract.methods.balanceOf(ownerAddress).call();
      return balance.toString();
    },
    estimateEnergy: async (tokenAddress, from, to, amount, network) => {
      const tw = getTronWebForNetwork(network);
      try {
        const result = await tw.transactionBuilder.estimateEnergy(
          tokenAddress,
          "transfer(address,uint256)",
          {},
          [
            { type: "address", value: to },
            { type: "uint256", value: amount }
          ],
          from
        );
        return result.energy_required || 65e3;
      } catch {
        return 65e3;
      }
    }
  };
}
function toClientTronSigner(tronWeb) {
  return {
    address: tronWeb.defaultAddress?.base58 || tronWeb.address?.toBase58(),
    signTransaction: async (transaction) => {
      return await tronWeb.trx.sign(transaction);
    },
    buildTrc20Transfer: async (contractAddress, to, amount) => {
      const functionSelector = "transfer(address,uint256)";
      const parameter = [
        { type: "address", value: to },
        { type: "uint256", value: amount }
      ];
      const tx = await tronWeb.transactionBuilder.triggerSmartContract(
        contractAddress,
        functionSelector,
        { feeLimit: 8e7 },
        // 80 TRX max fee (typical USDT transfer ~30-50 TRX)
        parameter
      );
      return tx.transaction;
    }
  };
}

// src/index.ts
function getUsdtAddress(network) {
  return USDT_ADDRESSES[network];
}
function usdToUsdt(usdAmount) {
  return Math.round(usdAmount * 10 ** USDT_DECIMALS).toString();
}
export {
  ERUDITEPAY_FEE_BPS,
  ERUDITEPAY_WRAPPER_CONTRACT,
  ExactTronScheme2 as ExactTronClientScheme,
  ExactTronScheme as ExactTronFacilitatorScheme,
  ExactTronScheme3 as ExactTronServerScheme,
  TRC20_ABI,
  TRON_CAIP_FAMILY,
  TRON_MAINNET,
  TRON_NETWORKS,
  TRON_NILE,
  TRON_RPC_URLS,
  TRON_SHASTA,
  USDC_ADDRESSES,
  USDC_DECIMALS,
  USDT_ADDRESSES,
  USDT_DECIMALS,
  getUsdtAddress,
  isApprovePayload,
  isSignedTransactionPayload,
  registerExactTronClientScheme,
  registerExactTronScheme,
  registerExactTronServerScheme,
  toClientTronSigner,
  toFacilitatorTronSigner,
  usdToUsdt
};
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
//# sourceMappingURL=index.mjs.map