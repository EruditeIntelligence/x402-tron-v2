/**
 * @title EruditePayV2 Deployment Script
 * @author Erudite Intelligence LLC (Vector)
 * @date 2026-02-13
 * @purpose Deploy EruditePayV2 wrapper contract to TRON Mainnet
 *
 * USAGE (with tronbox):
 *   tronbox migrate --network mainnet
 *
 * USAGE (standalone with TronWeb - paste into Node.js):
 *   node deploy-eruditepay-v2.js
 *
 * PREREQUISITES:
 *   - TRON_PRIVATE_KEY env var set (deployer wallet)
 *   - TREASURY_ADDRESS env var set (Kraken deposit address for fee collection)
 *   - Deployer wallet needs ~100-500 TRX for deployment energy
 *
 * AFTER DEPLOYMENT:
 *   1. Note the deployed contract address
 *   2. Call addFacilitator() for each MCRN server wallet address
 *   3. Update WRAPPER_CONTRACT_ADDRESS in x402-tron-v2 constants.ts
 *   4. Verify contract on Tronscan
 *
 * CHANGELOG:
 * - 2026-02-13: Initial deployment script
 */

const TronWeb = require('tronweb');
const fs = require('fs');
const path = require('path');

// ============ Configuration ============

const CONFIG = {
  // Network endpoints
  mainnet: {
    fullHost: 'https://api.trongrid.io',
    name: 'TRON Mainnet',
  },
  shasta: {
    fullHost: 'https://api.shasta.trongrid.io',
    name: 'TRON Shasta Testnet',
  },
  nile: {
    fullHost: 'https://nile.trongrid.io',
    name: 'TRON Nile Testnet',
  },

  // Contract parameters
  feeBasisPoints: 25, // 0.25% fee

  // Energy parameters for deployment
  feeLimit: 1_000_000_000, // 1000 TRX max fee for deployment
};

// ============ Contract Bytecode ============
// NOTE: You need to compile EruditePayV2.sol first using:
//   solc --optimize --bin contracts/EruditePayV2.sol
// Or use TronIDE: https://www.tronide.io/
// Then paste the bytecode below.

const CONTRACT_ABI = [
  // Constructor
  {
    "inputs": [
      {"name": "_treasury", "type": "address"},
      {"name": "_feeBasisPoints", "type": "uint256"}
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  // executePayment
  {
    "inputs": [
      {"name": "token", "type": "address"},
      {"name": "payer", "type": "address"},
      {"name": "merchant", "type": "address"},
      {"name": "amount", "type": "uint256"},
      {"name": "nonce", "type": "bytes32"}
    ],
    "name": "executePayment",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // executeBatchPayment
  {
    "inputs": [
      {"name": "tokens", "type": "address[]"},
      {"name": "payers", "type": "address[]"},
      {"name": "merchants", "type": "address[]"},
      {"name": "amounts", "type": "uint256[]"},
      {"name": "nonces", "type": "bytes32[]"}
    ],
    "name": "executeBatchPayment",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // addFacilitator
  {
    "inputs": [{"name": "facilitator", "type": "address"}],
    "name": "addFacilitator",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // setFacilitator
  {
    "inputs": [
      {"name": "facilitator", "type": "address"},
      {"name": "active", "type": "bool"}
    ],
    "name": "setFacilitator",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // setFee
  {
    "inputs": [{"name": "_feeBasisPoints", "type": "uint256"}],
    "name": "setFee",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // setTreasury
  {
    "inputs": [{"name": "_treasury", "type": "address"}],
    "name": "setTreasury",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // setPaused
  {
    "inputs": [{"name": "_paused", "type": "bool"}],
    "name": "setPaused",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // transferOwnership
  {
    "inputs": [{"name": "newOwner", "type": "address"}],
    "name": "transferOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // rescueTokens
  {
    "inputs": [
      {"name": "token", "type": "address"},
      {"name": "to", "type": "address"},
      {"name": "amount", "type": "uint256"}
    ],
    "name": "rescueTokens",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // View: previewPayment
  {
    "inputs": [{"name": "amount", "type": "uint256"}],
    "name": "previewPayment",
    "outputs": [
      {"name": "feeAmount", "type": "uint256"},
      {"name": "netAmount", "type": "uint256"}
    ],
    "stateMutability": "view",
    "type": "function"
  },
  // View: isNonceUsed
  {
    "inputs": [
      {"name": "payer", "type": "address"},
      {"name": "nonce", "type": "bytes32"}
    ],
    "name": "isNonceUsed",
    "outputs": [{"name": "", "type": "bool"}],
    "stateMutability": "view",
    "type": "function"
  },
  // View: isFacilitator
  {
    "inputs": [{"name": "", "type": "address"}],
    "name": "isFacilitator",
    "outputs": [{"name": "", "type": "bool"}],
    "stateMutability": "view",
    "type": "function"
  },
  // View: owner, treasury, feeBasisPoints, paused
  {"inputs": [], "name": "owner", "outputs": [{"name": "", "type": "address"}], "stateMutability": "view", "type": "function"},
  {"inputs": [], "name": "treasury", "outputs": [{"name": "", "type": "address"}], "stateMutability": "view", "type": "function"},
  {"inputs": [], "name": "feeBasisPoints", "outputs": [{"name": "", "type": "uint256"}], "stateMutability": "view", "type": "function"},
  {"inputs": [], "name": "paused", "outputs": [{"name": "", "type": "bool"}], "stateMutability": "view", "type": "function"},
  // Events
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "name": "payer", "type": "address"},
      {"indexed": true, "name": "merchant", "type": "address"},
      {"indexed": true, "name": "token", "type": "address"},
      {"indexed": false, "name": "grossAmount", "type": "uint256"},
      {"indexed": false, "name": "feeAmount", "type": "uint256"},
      {"indexed": false, "name": "netAmount", "type": "uint256"},
      {"indexed": false, "name": "nonce", "type": "bytes32"}
    ],
    "name": "PaymentExecuted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "name": "facilitator", "type": "address"},
      {"indexed": false, "name": "active", "type": "bool"}
    ],
    "name": "FacilitatorUpdated",
    "type": "event"
  },
];

// ============ Deployment Function ============

async function deploy(network = 'mainnet') {
  const privateKey = process.env.TRON_PRIVATE_KEY;
  const treasuryAddress = process.env.TREASURY_ADDRESS;

  if (!privateKey) {
    console.error('ERROR: TRON_PRIVATE_KEY env var not set');
    process.exit(1);
  }
  if (!treasuryAddress) {
    console.error('ERROR: TREASURY_ADDRESS env var not set (your Kraken deposit address)');
    process.exit(1);
  }

  const networkConfig = CONFIG[network];
  if (!networkConfig) {
    console.error(`ERROR: Unknown network "${network}". Use: mainnet, shasta, nile`);
    process.exit(1);
  }

  console.log(`\n========================================`);
  console.log(`  EruditePayV2 Deployment`);
  console.log(`  Network:  ${networkConfig.name}`);
  console.log(`  Treasury: ${treasuryAddress}`);
  console.log(`  Fee:      ${CONFIG.feeBasisPoints} bps (${CONFIG.feeBasisPoints / 100}%)`);
  console.log(`========================================\n`);

  const tronWeb = new TronWeb({
    fullHost: networkConfig.fullHost,
    privateKey: privateKey,
  });

  const deployerAddress = tronWeb.defaultAddress.base58;
  console.log(`Deployer: ${deployerAddress}`);

  // Check deployer balance
  const balance = await tronWeb.trx.getBalance(deployerAddress);
  console.log(`Balance:  ${balance / 1e6} TRX`);

  if (balance < 100_000_000) {
    console.error('WARNING: Low balance. Deployment requires ~100-500 TRX for energy.');
  }

  // Read compiled bytecode
  // OPTION A: From file (if you compiled with solc)
  let bytecode;
  const bytecodePath = path.join(__dirname, 'EruditePayV2.bin');
  if (fs.existsSync(bytecodePath)) {
    bytecode = fs.readFileSync(bytecodePath, 'utf8').trim();
    console.log(`Bytecode: loaded from ${bytecodePath} (${bytecode.length / 2} bytes)`);
  } else {
    console.error(`\nERROR: Bytecode not found at ${bytecodePath}`);
    console.error('Compile the contract first:');
    console.error('  OPTION 1: TronIDE (https://www.tronide.io/)');
    console.error('    - Paste EruditePayV2.sol');
    console.error('    - Compile with Solidity 0.8.20');
    console.error('    - Deploy directly from TronIDE');
    console.error('');
    console.error('  OPTION 2: solc command line');
    console.error('    - solc --optimize --optimize-runs 200 --bin contracts/EruditePayV2.sol -o build/');
    console.error('    - Copy build/EruditePayV2.bin to this directory');
    console.error('');
    console.error('  OPTION 3: tronbox');
    console.error('    - tronbox compile');
    console.error('    - tronbox migrate --network mainnet');
    process.exit(1);
  }

  // Deploy
  console.log('\nDeploying...');

  try {
    const contract = await tronWeb.contract().new({
      abi: CONTRACT_ABI,
      bytecode: bytecode,
      feeLimit: CONFIG.feeLimit,
      callValue: 0,
      parameters: [treasuryAddress, CONFIG.feeBasisPoints],
    });

    const contractAddress = tronWeb.address.fromHex(contract.address);
    console.log(`\n✅ DEPLOYED SUCCESSFULLY`);
    console.log(`   Contract: ${contractAddress}`);
    console.log(`   Hex:      ${contract.address}`);
    console.log(`   Treasury: ${treasuryAddress}`);
    console.log(`   Fee:      ${CONFIG.feeBasisPoints} bps`);
    console.log(`   Owner:    ${deployerAddress}`);

    // Save deployment info
    const deploymentInfo = {
      network: network,
      contractAddress: contractAddress,
      contractAddressHex: contract.address,
      treasury: treasuryAddress,
      feeBasisPoints: CONFIG.feeBasisPoints,
      deployer: deployerAddress,
      deployedAt: new Date().toISOString(),
      txId: contract.transactionHash || 'N/A',
    };

    const infoPath = path.join(__dirname, `deployment-${network}.json`);
    fs.writeFileSync(infoPath, JSON.stringify(deploymentInfo, null, 2));
    console.log(`\n   Deployment info saved to: ${infoPath}`);

    console.log(`\n========================================`);
    console.log(`  NEXT STEPS:`);
    console.log(`  1. Verify on Tronscan: https://tronscan.org/#/contract/${contractAddress}`);
    console.log(`  2. Add MCRN facilitator wallets:`);
    console.log(`     await contract.addFacilitator('MCRN1_ADDRESS').send()`);
    console.log(`     await contract.addFacilitator('MCRN2_ADDRESS').send()`);
    console.log(`  3. Update constants.ts:`);
    console.log(`     WRAPPER_CONTRACT_ADDRESS = '${contractAddress}'`);
    console.log(`========================================\n`);

    return deploymentInfo;
  } catch (error) {
    console.error('\n❌ DEPLOYMENT FAILED:', error.message || error);
    process.exit(1);
  }
}

// ============ Post-Deployment Setup ============

async function addFacilitators(contractAddress, facilitatorAddresses, network = 'mainnet') {
  const privateKey = process.env.TRON_PRIVATE_KEY;
  const networkConfig = CONFIG[network];

  const tronWeb = new TronWeb({
    fullHost: networkConfig.fullHost,
    privateKey: privateKey,
  });

  const contract = await tronWeb.contract(CONTRACT_ABI, contractAddress);

  for (const addr of facilitatorAddresses) {
    console.log(`Adding facilitator: ${addr}...`);
    try {
      const result = await contract.addFacilitator(addr).send({ feeLimit: 100_000_000 });
      console.log(`  ✅ Added. TxID: ${result}`);
    } catch (error) {
      console.error(`  ❌ Failed: ${error.message || error}`);
    }
  }
}

// ============ CLI ============

const network = process.argv[2] || 'mainnet';
const action = process.argv[3] || 'deploy';

if (action === 'deploy') {
  deploy(network);
} else if (action === 'add-facilitators') {
  const contractAddress = process.argv[4];
  const facilitators = process.argv.slice(5);
  if (!contractAddress || facilitators.length === 0) {
    console.error('Usage: node deploy-eruditepay-v2.js <network> add-facilitators <contract> <addr1> <addr2> ...');
    process.exit(1);
  }
  addFacilitators(contractAddress, facilitators, network);
}

module.exports = { deploy, addFacilitators, CONTRACT_ABI, CONFIG };
