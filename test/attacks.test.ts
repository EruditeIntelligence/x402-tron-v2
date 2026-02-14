/**
 * @module Attack Tests — x402-tron-v2 Red Team
 * @description Adversarial tests attempting to break payment verification.
 *   Every test here represents a real attack vector. If any PASS when they
 *   should FAIL, we have a vulnerability.
 * @author Claude (Anthropic) — Red Team audit
 * @created 2026-02-13
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { toFacilitatorTronSigner } from "../src/signer";
import { ExactTronScheme as FacilitatorScheme } from "../src/exact/facilitator/scheme";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";

// =============================================================================
// Mock TronWeb — simulates the real TronWeb behavior for testing
// =============================================================================

/**
 * Builds a realistic-looking Tron transaction JSON.
 * This is what TronWeb produces after building + signing a transaction.
 */
function buildFakeTronTx(opts: {
  ownerHex: string;
  contractHex: string;
  toHex: string;
  amount: bigint;
  expiration?: number;
  selectorHex?: string;
}) {
  const selector = opts.selectorHex || "a9059cbb";
  // ABI encode: selector + padded address (24 zero bytes + 20 byte address) + padded uint256
  const toPadded = "000000000000000000000000" + opts.toHex.replace(/^41/, "");
  const amountHex = opts.amount.toString(16).padStart(64, "0");
  const data = selector + toPadded + amountHex;

  const rawData = {
    contract: [
      {
        type: "TriggerSmartContract",
        parameter: {
          value: {
            owner_address: opts.ownerHex,
            contract_address: opts.contractHex,
            data,
          },
        },
      },
    ],
    expiration: opts.expiration || Date.now() + 60000,
  };

  // Simulate raw_data_hex — in real TronWeb this is protobuf encoding.
  // For our test we embed the critical fields so the integrity check can find them.
  const rawDataHex = buildFakeProtobuf(opts.ownerHex, opts.contractHex, data);

  // Compute a fake txID (SHA-256 of raw_data_hex)
  // We'll have our mock crypto.sha256 return this
  const txID = "a]fake_txid_" + Date.now().toString(16);

  return {
    tx: {
      txID,
      raw_data: rawData,
      raw_data_hex: rawDataHex,
      signature: ["a".repeat(130)], // 65 bytes = 130 hex chars
    },
    txID,
    rawDataHex,
    data,
    ownerHex: opts.ownerHex,
  };
}

/**
 * Simulate protobuf hex that contains the critical fields.
 * Real protobuf encodes fields with tags, but for the integrity check
 * we just need the hex to contain the data, owner, and contract values.
 */
function buildFakeProtobuf(ownerHex: string, contractHex: string, data: string): string {
  // Embed the fields so rawDataHex.includes(data) etc. will pass
  const padding = "0a0210";
  return (padding + ownerHex + contractHex + data + "ff").toLowerCase();
}

/**
 * Create a mock TronWeb instance
 */
function createMockTronWeb(opts?: {
  ecRecoverReturn?: string; // hex address to return from ecRecover
  sha256Return?: string; // txID to return from sha256
}) {
  const defaultOwnerHex = "41" + "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
  const ecRecoverAddr = opts?.ecRecoverReturn || defaultOwnerHex;

  return {
    defaultAddress: { base58: "TTestAddress1234567890123456789012" },
    defaultPrivateKey: "0000000000000000000000000000000000000000000000000000000000000001",
    fullNode: { host: "https://api.trongrid.io" },
    constructor: class MockTronWeb {
      constructor(_config: Record<string, unknown>) {}
    },
    address: {
      fromHex: (hex: string) => {
        // Simple mock: return "T" + last 20 chars for deterministic mapping
        return "T" + hex.replace(/^41/, "").substring(0, 32);
      },
    },
    utils: {
      crypto: {
        sha256: (_buf: Buffer) => opts?.sha256Return || "computed_txid_match",
        ecRecover: (_buf: Buffer, _sig: string) => ecRecoverAddr,
      },
    },
    trx: {
      sendRawTransaction: vi.fn().mockResolvedValue({ result: true, txid: "broadcast_txid" }),
      getTransactionInfo: vi.fn().mockResolvedValue({
        id: "broadcast_txid",
        receipt: { result: "SUCCESS" },
      }),
      sign: vi.fn(),
    },
    contract: vi.fn().mockReturnValue({
      methods: {
        balanceOf: () => ({
          call: vi.fn().mockResolvedValue("999999999999"),
        }),
      },
    }),
    transactionBuilder: {
      estimateEnergy: vi.fn().mockResolvedValue({ energy_required: 65000 }),
    },
  };
}

// =============================================================================
// ATTACK 1: Forged Transaction (No Valid Signature)
// =============================================================================

describe("ATTACK: Forged transaction with no valid signature", () => {
  it("should reject a transaction with missing signature array", async () => {
    const mockTw = createMockTronWeb({ sha256Return: "fake_txid" });
    const signer = toFacilitatorTronSigner(mockTw);

    const fakeTx = {
      txID: "fake_txid",
      raw_data: { contract: [{ type: "TriggerSmartContract", parameter: { value: {} } }] },
      raw_data_hex: "aabbcc",
      // NO signature field
    };

    await expect(
      signer.decodeTransaction(JSON.stringify(fakeTx), "tron:27Lqcw"),
    ).rejects.toThrow("missing or empty signature array");
  });

  it("should reject a transaction with empty signature array", async () => {
    const mockTw = createMockTronWeb({ sha256Return: "fake_txid" });
    const signer = toFacilitatorTronSigner(mockTw);

    const fakeTx = {
      txID: "fake_txid",
      raw_data: { contract: [{ type: "TriggerSmartContract", parameter: { value: {} } }] },
      raw_data_hex: "aabbcc",
      signature: [],
    };

    await expect(
      signer.decodeTransaction(JSON.stringify(fakeTx), "tron:27Lqcw"),
    ).rejects.toThrow("missing or empty signature array");
  });

  it("should reject a transaction with malformed signature (wrong length)", async () => {
    const mockTw = createMockTronWeb({ sha256Return: "fake_txid" });
    const signer = toFacilitatorTronSigner(mockTw);

    const fakeTx = {
      txID: "fake_txid",
      raw_data: { contract: [{ type: "TriggerSmartContract", parameter: { value: {} } }] },
      raw_data_hex: "aabbcc",
      signature: ["deadbeef"], // Way too short, should be 130 chars
    };

    await expect(
      signer.decodeTransaction(JSON.stringify(fakeTx), "tron:27Lqcw"),
    ).rejects.toThrow("malformed signature");
  });

  it("should reject a signature with non-hex characters", async () => {
    const mockTw = createMockTronWeb({ sha256Return: "fake_txid" });
    const signer = toFacilitatorTronSigner(mockTw);

    const fakeTx = {
      txID: "fake_txid",
      raw_data: { contract: [{ type: "TriggerSmartContract", parameter: { value: {} } }] },
      raw_data_hex: "aabbcc",
      signature: ["z".repeat(130)], // Invalid hex
    };

    await expect(
      signer.decodeTransaction(JSON.stringify(fakeTx), "tron:27Lqcw"),
    ).rejects.toThrow("malformed signature");
  });
});

// =============================================================================
// ATTACK 2: txID Tampering
// =============================================================================

describe("ATTACK: Tampered txID", () => {
  it("should reject when claimed txID doesn't match computed hash", async () => {
    const mockTw = createMockTronWeb({
      sha256Return: "real_computed_txid", // sha256 returns this
    });
    const signer = toFacilitatorTronSigner(mockTw);

    const fakeTx = {
      txID: "ATTACKER_FAKE_TXID", // Doesn't match what sha256 returns
      raw_data: { contract: [{ type: "TriggerSmartContract", parameter: { value: {} } }] },
      raw_data_hex: "aabbcc",
      signature: ["a".repeat(130)],
    };

    await expect(
      signer.decodeTransaction(JSON.stringify(fakeTx), "tron:27Lqcw"),
    ).rejects.toThrow("txID does not match raw_data hash");
  });
});

// =============================================================================
// ATTACK 3: Signature Doesn't Match Owner (Stolen Identity)
// =============================================================================

describe("ATTACK: Signature from different address than claimed owner", () => {
  it("should reject when ECRecover returns different address than owner_address", async () => {
    const ownerHex = "41aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const attackerHex = "41bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const contractHex = "41cccccccccccccccccccccccccccccccccccccccc";
    const toHex = "41dddddddddddddddddddddddddddddddddddddddd";

    const { tx, rawDataHex } = buildFakeTronTx({
      ownerHex,
      contractHex,
      toHex,
      amount: 1000000n,
    });

    // ECRecover returns ATTACKER address, but tx claims OWNER
    const mockTw = createMockTronWeb({
      sha256Return: tx.txID,
      ecRecoverReturn: attackerHex, // Attacker signed it, not the owner
    });
    const signer = toFacilitatorTronSigner(mockTw);

    await expect(
      signer.decodeTransaction(JSON.stringify(tx), "tron:27Lqcw"),
    ).rejects.toThrow("Signature verification failed");
  });
});

// =============================================================================
// ATTACK 4: raw_data / raw_data_hex DESYNC (Underpayment Bypass)
// This is the attack Claude found that Grok missed.
// =============================================================================

describe("ATTACK: raw_data / raw_data_hex desync (underpayment bypass)", () => {
  it("should reject when ABI data in raw_data doesn't appear in raw_data_hex", async () => {
    const ownerHex = "41aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const contractHex = "41cccccccccccccccccccccccccccccccccccccccc";
    const toHex = "41dddddddddddddddddddddddddddddddddddddddd";

    // Build a REAL tx for 1 USDT (1000000)
    const realTx = buildFakeTronTx({
      ownerHex,
      contractHex,
      toHex,
      amount: 1000000n, // 1 USDT
    });

    // Now tamper: change raw_data to say 1,000,000 USDT but keep raw_data_hex
    const tamperedTx = JSON.parse(JSON.stringify(realTx.tx));

    // Build a DIFFERENT ABI data string for 1,000,000 USDT
    const fakeToPadded = "000000000000000000000000" + toHex.replace(/^41/, "");
    const fakeAmountHex = (1000000000000n).toString(16).padStart(64, "0");
    const fakeData = "a9059cbb" + fakeToPadded + fakeAmountHex;

    // Replace the data in raw_data but NOT in raw_data_hex
    tamperedTx.raw_data.contract[0].parameter.value.data = fakeData;

    const mockTw = createMockTronWeb({
      sha256Return: tamperedTx.txID,
      ecRecoverReturn: ownerHex,
    });
    const signer = toFacilitatorTronSigner(mockTw);

    await expect(
      signer.decodeTransaction(JSON.stringify(tamperedTx), "tron:27Lqcw"),
    ).rejects.toThrow("does not match raw_data_hex");
  });

  it("should reject when contract_address is tampered in raw_data", async () => {
    const ownerHex = "41aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const realContractHex = "41cccccccccccccccccccccccccccccccccccccccc";
    const fakeContractHex = "41eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
    const toHex = "41dddddddddddddddddddddddddddddddddddddddd";

    const realTx = buildFakeTronTx({
      ownerHex,
      contractHex: realContractHex,
      toHex,
      amount: 1000000n,
    });

    // Tamper: swap contract address in raw_data
    const tamperedTx = JSON.parse(JSON.stringify(realTx.tx));
    tamperedTx.raw_data.contract[0].parameter.value.contract_address = fakeContractHex;

    const mockTw = createMockTronWeb({
      sha256Return: tamperedTx.txID,
      ecRecoverReturn: ownerHex,
    });
    const signer = toFacilitatorTronSigner(mockTw);

    await expect(
      signer.decodeTransaction(JSON.stringify(tamperedTx), "tron:27Lqcw"),
    ).rejects.toThrow("does not match raw_data_hex");
  });

  it("should reject when owner_address is tampered in raw_data", async () => {
    const realOwnerHex = "41aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const fakeOwnerHex = "41ffffffffffffffffffffffffffffffffffffffff";
    const contractHex = "41cccccccccccccccccccccccccccccccccccccccc";
    const toHex = "41dddddddddddddddddddddddddddddddddddddddd";

    const realTx = buildFakeTronTx({
      ownerHex: realOwnerHex,
      contractHex,
      toHex,
      amount: 1000000n,
    });

    // Tamper: swap owner in raw_data to a rich address
    const tamperedTx = JSON.parse(JSON.stringify(realTx.tx));
    tamperedTx.raw_data.contract[0].parameter.value.owner_address = fakeOwnerHex;

    // ECRecover still returns the REAL owner (who actually signed)
    const mockTw = createMockTronWeb({
      sha256Return: tamperedTx.txID,
      ecRecoverReturn: realOwnerHex,
    });
    const signer = toFacilitatorTronSigner(mockTw);

    // Should fail either on sig mismatch OR on owner not in raw_data_hex
    await expect(
      signer.decodeTransaction(JSON.stringify(tamperedTx), "tron:27Lqcw"),
    ).rejects.toThrow();
  });
});

// =============================================================================
// ATTACK 5: Malformed ABI Data
// =============================================================================

describe("ATTACK: Malformed ABI data", () => {
  it("should reject transfer data shorter than 136 chars", async () => {
    const ownerHex = "41aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const contractHex = "41cccccccccccccccccccccccccccccccccccccccc";

    // Build tx with truncated data
    const shortData = "a9059cbb" + "00".repeat(20); // Too short

    const rawDataHex = buildFakeProtobuf(ownerHex, contractHex, shortData);
    const mockTw = createMockTronWeb({
      sha256Return: "test_txid",
      ecRecoverReturn: ownerHex,
    });

    const tx = {
      txID: "test_txid",
      raw_data: {
        contract: [{
          type: "TriggerSmartContract",
          parameter: {
            value: {
              owner_address: ownerHex,
              contract_address: contractHex,
              data: shortData,
            },
          },
        }],
        expiration: Date.now() + 60000,
      },
      raw_data_hex: rawDataHex,
      signature: ["a".repeat(130)],
    };

    const signer = toFacilitatorTronSigner(mockTw);

    await expect(
      signer.decodeTransaction(JSON.stringify(tx), "tron:27Lqcw"),
    ).rejects.toThrow("expected 136+ hex chars");
  });

  it("should reject data with non-zero address padding (dirty bits attack)", async () => {
    const ownerHex = "41aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const contractHex = "41cccccccccccccccccccccccccccccccccccccccc";
    const toAddr = "dddddddddddddddddddddddddddddddddddddddd";

    // Stuff non-zero bytes into the padding area
    const dirtyPadding = "deadbeefdeadbeefdeadbeef"; // 24 chars, should be zeros
    const amountHex = (1000000n).toString(16).padStart(64, "0");
    const dirtyData = "a9059cbb" + dirtyPadding + toAddr + amountHex;

    const rawDataHex = buildFakeProtobuf(ownerHex, contractHex, dirtyData);
    const mockTw = createMockTronWeb({
      sha256Return: "test_txid",
      ecRecoverReturn: ownerHex,
    });

    const tx = {
      txID: "test_txid",
      raw_data: {
        contract: [{
          type: "TriggerSmartContract",
          parameter: {
            value: {
              owner_address: ownerHex,
              contract_address: contractHex,
              data: dirtyData,
            },
          },
        }],
        expiration: Date.now() + 60000,
      },
      raw_data_hex: rawDataHex,
      signature: ["a".repeat(130)],
    };

    const signer = toFacilitatorTronSigner(mockTw);

    await expect(
      signer.decodeTransaction(JSON.stringify(tx), "tron:27Lqcw"),
    ).rejects.toThrow("non-zero padding");
  });

  it("should reject raw_data_hex with non-hex characters", async () => {
    const mockTw = createMockTronWeb({ sha256Return: "test_txid" });
    const signer = toFacilitatorTronSigner(mockTw);

    const tx = {
      txID: "test_txid",
      raw_data: { contract: [] },
      raw_data_hex: "not_valid_hex!!!",
      signature: ["a".repeat(130)],
    };

    await expect(
      signer.decodeTransaction(JSON.stringify(tx), "tron:27Lqcw"),
    ).rejects.toThrow("non-hex characters");
  });
});

// =============================================================================
// ATTACK 6: Expired Transaction
// =============================================================================

describe("ATTACK: Expired transaction reuse", () => {
  it("should reject a transaction that has expired", async () => {
    const ownerHex = "41aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const contractHex = "41cccccccccccccccccccccccccccccccccccccccc";
    const toHex = "41dddddddddddddddddddddddddddddddddddddddd";

    const { tx } = buildFakeTronTx({
      ownerHex,
      contractHex,
      toHex,
      amount: 1000000n,
      expiration: Date.now() - 10000, // Expired 10 seconds ago
    });

    const mockTw = createMockTronWeb({
      sha256Return: tx.txID,
      ecRecoverReturn: ownerHex,
    });
    const signer = toFacilitatorTronSigner(mockTw);

    // decodeTransaction itself doesn't check expiration — verify() does
    const decoded = await signer.decodeTransaction(JSON.stringify(tx), "tron:27Lqcw");

    // Build facilitator and test verify
    const facilitator = new FacilitatorScheme(signer);

    // Use the base58 addresses that the mock's fromHex produces
    const assetBase58 = "T" + contractHex.replace(/^41/, "").substring(0, 32);

    const payload: PaymentPayload = {
      x402Version: 2,
      resource: { url: "https://test.com", description: "test", mimeType: "text/plain" },
      accepted: { scheme: "exact", network: "tron:27Lqcw", asset: assetBase58, amount: "1000000", payTo: decoded.parameters.to!, maxTimeoutSeconds: 300, extra: {} },
      payload: { signedTransaction: JSON.stringify(tx), from: decoded.ownerAddress },
    };

    const requirements: PaymentRequirements = {
      scheme: "exact",
      network: "tron:27Lqcw",
      asset: assetBase58,
      amount: "1000000",
      payTo: decoded.parameters.to!,
      maxTimeoutSeconds: 300,
      extra: {},
    };

    const result = await facilitator.verify(payload, requirements);
    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toContain("expired");
  });
});

// =============================================================================
// ATTACK 7: Self-Transfer (Facilitator as Sender)
// =============================================================================

describe("ATTACK: Facilitator tries to self-deal", () => {
  it("should reject when sender is the facilitator address", async () => {
    const facilitatorHex = "41aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const contractHex = "41cccccccccccccccccccccccccccccccccccccccc";
    const toHex = "41dddddddddddddddddddddddddddddddddddddddd";

    const { tx } = buildFakeTronTx({
      ownerHex: facilitatorHex,
      contractHex,
      toHex,
      amount: 1000000n,
    });

    const mockTw = createMockTronWeb({
      sha256Return: tx.txID,
      ecRecoverReturn: facilitatorHex,
    });
    // Mock the default address to match the sender
    mockTw.defaultAddress.base58 = "T" + facilitatorHex.replace(/^41/, "").substring(0, 32);

    const signer = toFacilitatorTronSigner(mockTw);
    const decoded = await signer.decodeTransaction(JSON.stringify(tx), "tron:27Lqcw");
    const facilitator = new FacilitatorScheme(signer);

    const assetBase58 = "T" + contractHex.replace(/^41/, "").substring(0, 32);

    const payload: PaymentPayload = {
      x402Version: 2,
      resource: { url: "https://test.com", description: "test", mimeType: "text/plain" },
      accepted: { scheme: "exact", network: "tron:27Lqcw", asset: assetBase58, amount: "1000000", payTo: decoded.parameters.to!, maxTimeoutSeconds: 300, extra: {} },
      payload: { signedTransaction: JSON.stringify(tx), from: decoded.ownerAddress },
    };

    const requirements: PaymentRequirements = {
      scheme: "exact",
      network: "tron:27Lqcw",
      asset: assetBase58,
      amount: "1000000",
      payTo: decoded.parameters.to!,
      maxTimeoutSeconds: 300,
      extra: {},
    };

    const result = await facilitator.verify(payload, requirements);
    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toContain("facilitator_is_sender");
  });
});

// =============================================================================
// ATTACK 8: Insufficient Amount (Underpayment)
// =============================================================================

describe("ATTACK: Underpayment — tx amount less than required", () => {
  it("should reject when tx sends less than required amount", async () => {
    const ownerHex = "41aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const contractHex = "41cccccccccccccccccccccccccccccccccccccccc";
    const toHex = "41dddddddddddddddddddddddddddddddddddddddd";

    const { tx } = buildFakeTronTx({
      ownerHex,
      contractHex,
      toHex,
      amount: 500000n, // Only 0.50 USDT
    });

    const mockTw = createMockTronWeb({
      sha256Return: tx.txID,
      ecRecoverReturn: ownerHex,
    });
    const signer = toFacilitatorTronSigner(mockTw);
    const decoded = await signer.decodeTransaction(JSON.stringify(tx), "tron:27Lqcw");
    const facilitator = new FacilitatorScheme(signer);

    const assetBase58 = "T" + contractHex.replace(/^41/, "").substring(0, 32);

    const payload: PaymentPayload = {
      x402Version: 2,
      resource: { url: "https://test.com", description: "test", mimeType: "text/plain" },
      accepted: { scheme: "exact", network: "tron:27Lqcw", asset: assetBase58, amount: "500000", payTo: decoded.parameters.to!, maxTimeoutSeconds: 300, extra: {} },
      payload: { signedTransaction: JSON.stringify(tx), from: decoded.ownerAddress },
    };

    const requirements: PaymentRequirements = {
      scheme: "exact",
      network: "tron:27Lqcw",
      asset: assetBase58,
      amount: "1000000", // Requires 1.00 USDT
      payTo: decoded.parameters.to!,
      maxTimeoutSeconds: 300,
      extra: {},
    };

    const result = await facilitator.verify(payload, requirements);
    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toContain("amount_insufficient");
  });
});

// =============================================================================
// ATTACK 9: Wrong Network
// =============================================================================

describe("ATTACK: Network mismatch", () => {
  it("should reject when payload network doesn't match requirements", async () => {
    const ownerHex = "41aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const contractHex = "41cccccccccccccccccccccccccccccccccccccccc";
    const toHex = "41dddddddddddddddddddddddddddddddddddddddd";

    const { tx } = buildFakeTronTx({ ownerHex, contractHex, toHex, amount: 1000000n });

    const mockTw = createMockTronWeb({
      sha256Return: tx.txID,
      ecRecoverReturn: ownerHex,
    });
    const signer = toFacilitatorTronSigner(mockTw);
    const facilitator = new FacilitatorScheme(signer);
    const decoded = await signer.decodeTransaction(JSON.stringify(tx), "tron:27Lqcw");

    const payload: PaymentPayload = {
      x402Version: 2,
      resource: { url: "https://test.com", description: "test", mimeType: "text/plain" },
      accepted: { scheme: "exact", network: "tron:4oPwXB", asset: contractHex, amount: "1000000", payTo: decoded.parameters.to!, maxTimeoutSeconds: 300, extra: {} },
      payload: { signedTransaction: JSON.stringify(tx), from: decoded.ownerAddress },
    };

    const requirements: PaymentRequirements = {
      scheme: "exact",
      network: "tron:27Lqcw", // Mainnet
      asset: contractHex,
      amount: "1000000",
      payTo: decoded.parameters.to!,
      maxTimeoutSeconds: 300,
      extra: {},
    };

    const result = await facilitator.verify(payload, requirements);
    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toContain("network_mismatch");
  });
});

// =============================================================================
// HAPPY PATH: Valid transaction should pass
// =============================================================================

describe("VALID: Properly signed legitimate transaction", () => {
  it("should accept a valid, properly formed transaction", async () => {
    const ownerHex = "41aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const contractHex = "41cccccccccccccccccccccccccccccccccccccccc";
    const toHex = "41dddddddddddddddddddddddddddddddddddddddd";

    const { tx } = buildFakeTronTx({
      ownerHex,
      contractHex,
      toHex,
      amount: 1000000n,
    });

    const mockTw = createMockTronWeb({
      sha256Return: tx.txID,
      ecRecoverReturn: ownerHex,
    });
    const signer = toFacilitatorTronSigner(mockTw);
    const decoded = await signer.decodeTransaction(JSON.stringify(tx), "tron:27Lqcw");
    const facilitator = new FacilitatorScheme(signer);

    const payload: PaymentPayload = {
      x402Version: 2,
      resource: { url: "https://test.com", description: "test", mimeType: "text/plain" },
      accepted: { scheme: "exact", network: "tron:27Lqcw", asset: "T" + contractHex.replace(/^41/, "").substring(0, 32), amount: "1000000", payTo: decoded.parameters.to!, maxTimeoutSeconds: 300, extra: {} },
      payload: { signedTransaction: JSON.stringify(tx), from: decoded.ownerAddress },
    };

    const requirements: PaymentRequirements = {
      scheme: "exact",
      network: "tron:27Lqcw",
      asset: "T" + contractHex.replace(/^41/, "").substring(0, 32),
      amount: "1000000",
      payTo: decoded.parameters.to!,
      maxTimeoutSeconds: 300,
      extra: {},
    };

    const result = await facilitator.verify(payload, requirements);
    expect(result.isValid).toBe(true);
    expect(result.payer).toBe(decoded.ownerAddress);
  });
});
