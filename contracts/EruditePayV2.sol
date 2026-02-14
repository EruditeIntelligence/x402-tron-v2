// SPDX-License-Identifier: MIT
/**
 * @title EruditePay V2 Wrapper Contract
 * @author Erudite Intelligence LLC (Vector)
 * @date 2026-02-13
 * @purpose x402 V2 payment facilitator contract for TRON TRC-20 payments.
 *   Executes TRC-20 transfers on behalf of the facilitator, collecting a
 *   configurable fee (default 0.25%) routed to the treasury wallet.
 *
 * DEPLOYMENT NOTES:
 * - Deploy on TRON Mainnet via TronIDE or tronbox
 * - Constructor args: treasury address (Kraken deposit), fee basis points (25 = 0.25%)
 * - After deployment: add facilitator addresses via addFacilitator()
 * - Tokens must be approved by payer to THIS contract address before executePayment()
 *
 * CHANGELOG:
 * - 2026-02-13: V2 initial. Multi-facilitator support, nonce replay protection,
 *               configurable fee, emergency pause, batch payment support.
 */
pragma solidity ^0.8.20;

/**
 * @dev Minimal TRC-20 interface for transferFrom operations
 */
interface ITRC20 {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function transfer(address to, uint256 value) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}

/**
 * @title EruditePayV2
 * @notice Facilitator wrapper contract for x402 V2 payments on TRON.
 *
 * Flow:
 * 1. Client approves this contract to spend their TRC-20 tokens
 * 2. Client sends signed payment payload to x402 facilitator server
 * 3. Facilitator server verifies payload off-chain (11-point security check)
 * 4. Facilitator calls executePayment() on this contract
 * 5. Contract does transferFrom(payer → contract), takes fee, sends rest to merchant
 *
 * Security:
 * - Only registered facilitator addresses can call executePayment()
 * - Nonce-based replay protection (each payment nonce can only be used once)
 * - Owner can pause in emergency
 * - Fee capped at 5% maximum (500 basis points)
 * - Treasury address cannot be zero
 */
contract EruditePayV2 {
    // ============ State Variables ============

    /// @notice Contract owner (deployer)
    address public owner;

    /// @notice Treasury address where fees are collected (Kraken deposit address)
    address public treasury;

    /// @notice Fee in basis points (25 = 0.25%, 100 = 1%)
    uint256 public feeBasisPoints;

    /// @notice Maximum allowed fee (5% = 500 basis points)
    uint256 public constant MAX_FEE_BPS = 500;

    /// @notice Basis points denominator
    uint256 public constant BPS_DENOMINATOR = 10000;

    /// @notice Emergency pause flag
    bool public paused;

    /// @notice Registered facilitator addresses (can call executePayment)
    mapping(address => bool) public isFacilitator;

    /// @notice Used nonces for replay protection (payer => nonce => used)
    mapping(address => mapping(bytes32 => bool)) public usedNonces;

    // ============ Events ============

    /// @notice Emitted when a payment is executed
    event PaymentExecuted(
        address indexed payer,
        address indexed merchant,
        address indexed token,
        uint256 grossAmount,
        uint256 feeAmount,
        uint256 netAmount,
        bytes32 nonce
    );

    /// @notice Emitted when a facilitator is added or removed
    event FacilitatorUpdated(address indexed facilitator, bool active);

    /// @notice Emitted when the fee is updated
    event FeeUpdated(uint256 oldFee, uint256 newFee);

    /// @notice Emitted when the treasury is updated
    event TreasuryUpdated(address oldTreasury, address newTreasury);

    /// @notice Emitted when pause state changes
    event PauseUpdated(bool paused);

    /// @notice Emitted when owner is transferred
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);

    /// @notice Emitted when tokens are rescued
    event TokensRescued(address indexed token, address indexed to, uint256 amount);

    // ============ Modifiers ============

    modifier onlyOwner() {
        require(msg.sender == owner, "EruditePayV2: caller is not the owner");
        _;
    }

    modifier onlyFacilitator() {
        require(isFacilitator[msg.sender], "EruditePayV2: caller is not a facilitator");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "EruditePayV2: contract is paused");
        _;
    }

    // ============ Constructor ============

    /**
     * @notice Deploy the EruditePay V2 contract
     * @param _treasury Address where fees are sent (e.g., Kraken deposit address)
     * @param _feeBasisPoints Fee in basis points (25 = 0.25%)
     *
     * DEPLOYMENT EXAMPLE (TronIDE or tronbox):
     *   constructor args: ("TYourKrakenDepositAddress", 25)
     */
    constructor(address _treasury, uint256 _feeBasisPoints) {
        require(_treasury != address(0), "EruditePayV2: treasury cannot be zero");
        require(_feeBasisPoints <= MAX_FEE_BPS, "EruditePayV2: fee exceeds maximum");

        owner = msg.sender;
        treasury = _treasury;
        feeBasisPoints = _feeBasisPoints;

        // Deployer is automatically a facilitator
        isFacilitator[msg.sender] = true;
        emit FacilitatorUpdated(msg.sender, true);
    }

    // ============ Core Payment Function ============

    /**
     * @notice Execute a payment from payer to merchant, collecting a fee.
     *
     * @param token   TRC-20 token contract address (e.g., USDT: TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t)
     * @param payer   Address paying for the resource (must have approved this contract)
     * @param merchant Address receiving payment (the payTo from x402 requirements)
     * @param amount  Gross payment amount in token's smallest unit
     * @param nonce   Unique payment nonce for replay protection
     *
     * @dev The payer must have called token.approve(thisContract, amount) before this call.
     *      The facilitator server handles this verification off-chain before calling.
     *
     * Fee calculation: fee = amount * feeBasisPoints / 10000
     * Net to merchant: amount - fee
     * Fee to treasury: fee
     */
    function executePayment(
        address token,
        address payer,
        address merchant,
        uint256 amount,
        bytes32 nonce
    ) external onlyFacilitator whenNotPaused {
        // Validate inputs
        require(token != address(0), "EruditePayV2: invalid token");
        require(payer != address(0), "EruditePayV2: invalid payer");
        require(merchant != address(0), "EruditePayV2: invalid merchant");
        require(amount > 0, "EruditePayV2: amount must be > 0");

        // Replay protection: each payer+nonce combination can only be used once
        require(!usedNonces[payer][nonce], "EruditePayV2: nonce already used");
        usedNonces[payer][nonce] = true;

        // Calculate fee and net amount
        uint256 feeAmount = (amount * feeBasisPoints) / BPS_DENOMINATOR;
        uint256 netAmount = amount - feeAmount;

        // Execute the transfers
        ITRC20 tokenContract = ITRC20(token);

        // Transfer gross amount from payer to this contract
        require(
            tokenContract.transferFrom(payer, address(this), amount),
            "EruditePayV2: transferFrom payer failed"
        );

        // Send net amount to merchant
        require(
            tokenContract.transfer(merchant, netAmount),
            "EruditePayV2: transfer to merchant failed"
        );

        // Send fee to treasury
        if (feeAmount > 0) {
            require(
                tokenContract.transfer(treasury, feeAmount),
                "EruditePayV2: transfer to treasury failed"
            );
        }

        emit PaymentExecuted(payer, merchant, token, amount, feeAmount, netAmount, nonce);
    }

    /**
     * @notice Execute multiple payments in a single transaction (batch).
     *         Gas efficient for settling multiple payments at once.
     *
     * @param tokens    Array of TRC-20 token addresses
     * @param payers    Array of payer addresses
     * @param merchants Array of merchant addresses
     * @param amounts   Array of gross payment amounts
     * @param nonces    Array of unique nonces
     */
    function executeBatchPayment(
        address[] calldata tokens,
        address[] calldata payers,
        address[] calldata merchants,
        uint256[] calldata amounts,
        bytes32[] calldata nonces
    ) external onlyFacilitator whenNotPaused {
        uint256 len = tokens.length;
        require(
            payers.length == len &&
            merchants.length == len &&
            amounts.length == len &&
            nonces.length == len,
            "EruditePayV2: array length mismatch"
        );
        require(len <= 20, "EruditePayV2: batch too large");

        for (uint256 i = 0; i < len; i++) {
            // Inline the core logic to save gas on external calls
            require(tokens[i] != address(0), "EruditePayV2: invalid token");
            require(payers[i] != address(0), "EruditePayV2: invalid payer");
            require(merchants[i] != address(0), "EruditePayV2: invalid merchant");
            require(amounts[i] > 0, "EruditePayV2: amount must be > 0");
            require(!usedNonces[payers[i]][nonces[i]], "EruditePayV2: nonce already used");

            usedNonces[payers[i]][nonces[i]] = true;

            uint256 feeAmount = (amounts[i] * feeBasisPoints) / BPS_DENOMINATOR;
            uint256 netAmount = amounts[i] - feeAmount;

            ITRC20 tokenContract = ITRC20(tokens[i]);

            require(
                tokenContract.transferFrom(payers[i], address(this), amounts[i]),
                "EruditePayV2: batch transferFrom failed"
            );
            require(
                tokenContract.transfer(merchants[i], netAmount),
                "EruditePayV2: batch merchant transfer failed"
            );
            if (feeAmount > 0) {
                require(
                    tokenContract.transfer(treasury, feeAmount),
                    "EruditePayV2: batch treasury transfer failed"
                );
            }

            emit PaymentExecuted(
                payers[i], merchants[i], tokens[i],
                amounts[i], feeAmount, netAmount, nonces[i]
            );
        }
    }

    // ============ View Functions ============

    /**
     * @notice Check if a nonce has been used for a given payer
     * @param payer  The payer address
     * @param nonce  The nonce to check
     * @return True if the nonce has been used
     */
    function isNonceUsed(address payer, bytes32 nonce) external view returns (bool) {
        return usedNonces[payer][nonce];
    }

    /**
     * @notice Preview the fee and net amount for a given payment
     * @param amount Gross payment amount
     * @return feeAmount The fee that would be collected
     * @return netAmount The amount the merchant would receive
     */
    function previewPayment(uint256 amount) external view returns (uint256 feeAmount, uint256 netAmount) {
        feeAmount = (amount * feeBasisPoints) / BPS_DENOMINATOR;
        netAmount = amount - feeAmount;
    }

    // ============ Admin Functions ============

    /**
     * @notice Add or remove a facilitator address
     * @param facilitator Address to update
     * @param active      True to add, false to remove
     */
    function setFacilitator(address facilitator, bool active) external onlyOwner {
        require(facilitator != address(0), "EruditePayV2: invalid facilitator");
        isFacilitator[facilitator] = active;
        emit FacilitatorUpdated(facilitator, active);
    }

    /**
     * @notice Convenience function to add a facilitator
     * @param facilitator Address to add as facilitator
     */
    function addFacilitator(address facilitator) external onlyOwner {
        require(facilitator != address(0), "EruditePayV2: invalid facilitator");
        isFacilitator[facilitator] = true;
        emit FacilitatorUpdated(facilitator, true);
    }

    /**
     * @notice Update the fee (in basis points). Capped at MAX_FEE_BPS.
     * @param _feeBasisPoints New fee in basis points
     */
    function setFee(uint256 _feeBasisPoints) external onlyOwner {
        require(_feeBasisPoints <= MAX_FEE_BPS, "EruditePayV2: fee exceeds maximum");
        uint256 oldFee = feeBasisPoints;
        feeBasisPoints = _feeBasisPoints;
        emit FeeUpdated(oldFee, _feeBasisPoints);
    }

    /**
     * @notice Update the treasury address
     * @param _treasury New treasury address
     */
    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "EruditePayV2: treasury cannot be zero");
        address oldTreasury = treasury;
        treasury = _treasury;
        emit TreasuryUpdated(oldTreasury, _treasury);
    }

    /**
     * @notice Emergency pause/unpause
     * @param _paused True to pause, false to unpause
     */
    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit PauseUpdated(_paused);
    }

    /**
     * @notice Transfer ownership to a new address
     * @param newOwner New owner address
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "EruditePayV2: new owner cannot be zero");
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    /**
     * @notice Rescue tokens accidentally sent to this contract.
     *         Only callable by owner. Cannot be used during normal operation
     *         because executePayment transfers tokens in and out atomically.
     * @param token  Token to rescue
     * @param to     Address to send rescued tokens
     * @param amount Amount to rescue
     */
    function rescueTokens(address token, address to, uint256 amount) external onlyOwner {
        require(to != address(0), "EruditePayV2: rescue to zero address");
        require(ITRC20(token).transfer(to, amount), "EruditePayV2: rescue transfer failed");
        emit TokensRescued(token, to, amount);
    }
}
