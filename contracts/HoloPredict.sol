 // SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, ebool, euint32, euint8, externalEbool, externalEuint32, externalEuint8} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";


/**
 * @title HoloPredict
 * @notice Confidential prediction market using Zama FHEVM
 * @dev Uses Zama FHE solidity library for encrypted types and checks.
 *      Frontend/relayer must provide attestations / ZKPoKs when calling fromExternal
 *      (so that the coprocessors sign only correct handles). The ZKPoK should bind
 *      the encrypted plaintext value to the ETH sent (msg.value) — enforced off-chain.
 */
contract HoloPredict is ZamaEthereumConfig {

    // Market states
    enum MarketStatus {
        Open,      // Accepting bets
        Closed,    // Betting closed, awaiting resolution
        Resolved,  // Oracle has resolved (encrypted outcome set)
        Cancelled  // Market cancelled
    }

    // Bet structure
    struct Bet {
        euint32 amountYes;          // Encrypted amount bet on YES (handle)
        euint32 amountNo;           // Encrypted amount bet on NO (handle)
        ebool betSide;              // Encrypted bet side (true = YES, false = NO)
        bool hasClaimed;            // Whether user has claimed profits
    }

    // Market structure
    struct Market {
        uint256 marketId;
        string question;
        address creator;
        MarketStatus status;
        uint256 endTime;           // When betting closes (timestamp)
        uint256 resolutionTime;    // When oracle should resolve (timestamp)
        euint32 totalVolumeYes;    // Encrypted total volume YES (handle)
        euint32 totalVolumeNo;     // Encrypted total volume NO (handle)
        uint256 decryptedVolumeYes; // Decrypted plaintext total YES
        uint256 decryptedVolumeNo;  // Decrypted plaintext total NO
        bool volumesDecrypted;      // Whether volumes have been decrypted
        ebool outcome;              // Encrypted outcome (true = YES won, false = NO won)
        bool outcomeDecrypted;      // Whether outcome has been decrypted
        bool outcomeValue;          // Decrypted outcome plaintext (true = YES won, false = NO won)
        mapping(address => Bet) bets;
    }

    // Events (no plaintext amounts for privacy)
    event MarketCreated(
        uint256 indexed marketId,
        address indexed creator,
        string question,
        uint256 endTime,
        uint256 resolutionTime
    );

    event BetPlacedEncrypted(
        uint256 indexed marketId,
        address indexed bettor,
        bytes32 amountHandle,  // bytes32 handle for the encrypted amount
        bytes32 sideHandle     // bytes32 handle for the encrypted side
    );

    event MarketClosed(uint256 indexed marketId);
    event MarketResolvedEncrypted(uint256 indexed marketId); // encoded resolution (encrypted)
    event OutcomeDecrypted(uint256 indexed marketId, bool outcome);
    event ProfitClaimed(
        uint256 indexed marketId,
        address indexed bettor,
        uint256 profit
    );

    // Decryption orchestration events (for relayers / KMS)
    event DecryptionRequested(uint256 indexed marketId, bytes32 encryptedOutcomeHandle);
    event VolumeDecryptionRequested(uint256 indexed marketId, bytes32 encryptedVolumeYesHandle, bytes32 encryptedVolumeNoHandle);

    // State variables
    mapping(uint256 => Market) private markets;
    uint256 public marketCount;
    address public owner;
    address public oracle;  // Oracle address that can resolve markets

    // Modifiers
    modifier onlyOwner() {
        require(msg.sender == owner, "HoloPredict: Not owner");
        _;
    }

    modifier onlyOracle() {
        require(msg.sender == oracle || msg.sender == owner, "HoloPredict: Not oracle");
        _;
    }

    modifier marketExists(uint256 _marketId) {
        require(_marketId < marketCount, "HoloPredict: Market does not exist");
        _;
    }

    constructor(address _oracle) {
        owner = msg.sender;
        oracle = _oracle;
    }

    /* ========== MARKET LIFECYCLE ========== */

    /**
     * @notice Create a new prediction market (only oracle or owner)
     * @param _question Market question text
     * @param _endTime Betting closes at this unix timestamp
     * @param _resolutionTime Oracle should resolve after this timestamp
     */
    function createMarket(
        string memory _question,
        uint256 _endTime,
        uint256 _resolutionTime
    ) external onlyOracle returns (uint256) {
        require(_endTime > block.timestamp, "HoloPredict: endTime must be future");
        require(_resolutionTime > _endTime, "HoloPredict: resolution after endTime");

        uint256 marketId = marketCount++;
        Market storage market = markets[marketId];

        market.marketId = marketId;
        market.question = _question;
        market.creator = msg.sender;
        market.status = MarketStatus.Open;
        market.endTime = _endTime;
        market.resolutionTime = _resolutionTime;

        // Initialize encrypted totals to zero handles
        market.totalVolumeYes = FHE.asEuint32(0);
        market.totalVolumeNo = FHE.asEuint32(0);
        market.volumesDecrypted = false;

        // Allow the contract to access the encrypted totals (best practice)
        FHE.allowThis(market.totalVolumeYes);
        FHE.allowThis(market.totalVolumeNo);

        emit MarketCreated(marketId, msg.sender, _question, _endTime, _resolutionTime);
        return marketId;
    }

    /**
     * @notice Place an encrypted bet on a market
     * @dev Frontend must encrypt both the amount and side, and produce coprocessor attestations (ZKPoK).
     *      The ZKPoK should bind the ciphertext plaintext to msg.value (ETH sent).
     *
     * @param _marketId market id
     * @param _encryptedAmount external encrypted amount handle (from relayer)
     * @param _encryptedSide external encrypted side handle (true = YES, false = NO)
     * @param _amountProof attestation / signatures from coprocessors for encrypted amount
     * @param _sideProof attestation / signatures from coprocessors for encrypted side
     */
    function placeBet(
        uint256 _marketId,
        externalEuint32 _encryptedAmount,
        externalEbool _encryptedSide,
        bytes calldata _amountProof,
        bytes calldata _sideProof
    ) external payable marketExists(_marketId) {
        Market storage market = markets[_marketId];
        require(market.status == MarketStatus.Open, "HoloPredict: Market not open");
        require(block.timestamp < market.endTime, "HoloPredict: Betting period ended");
        require(msg.value > 0, "HoloPredict: Must send ETH");

        Bet storage bet = market.bets[msg.sender];

        // Convert external encrypted inputs to internal encrypted handles (validates attestations)
        euint32 encryptedValue = FHE.fromExternal(_encryptedAmount, _amountProof);
        ebool encryptedSide = FHE.fromExternal(_encryptedSide, _sideProof);

        // Store encrypted side
        bet.betSide = encryptedSide;
        FHE.allowThis(bet.betSide);
        FHE.allow(bet.betSide, msg.sender);  // Bettor can user-decrypt their own bet side

        // NOTE: Off-chain coprocessors must ensure the ZKPoK/attestation binds plaintext to msg.value.
        // The contract relies on the coprocessors' attestation for that guarantee.

        // Use encrypted comparison to determine which side to update
        // If encryptedSide is true, add to YES; if false, add to NO
        ebool isYes = FHE.eq(encryptedSide, FHE.asEbool(true));
        ebool isNo = FHE.ne(encryptedSide, FHE.asEbool(true));
        
        // Calculate encrypted amounts for YES and NO sides
        // PRIVACY FIX: Always initialize both handles to prevent side leakage
        // Store actual amount on chosen side, encrypted zero on other side
        // Both handles will be non-zero encrypted values (encrypted zero still produces a handle)
        euint32 amountForYes = FHE.select(isYes, encryptedValue, FHE.asEuint32(0));
        euint32 amountForNo = FHE.select(isNo, encryptedValue, FHE.asEuint32(0));

        // PRIVACY FIX: Initialize both handles if this is the first bet
        // Check if handles are uninitialized (zero) and initialize them
        bytes32 currentAmountYesBytes = FHE.toBytes32(bet.amountYes);
        bytes32 currentAmountNoBytes = FHE.toBytes32(bet.amountNo);
        
        // If handles are uninitialized, initialize both with encrypted values
        // This ensures both handles are always non-zero encrypted values, preventing side leakage
        if (currentAmountYesBytes == bytes32(0) && currentAmountNoBytes == bytes32(0)) {
            // First bet: initialize both handles
            bet.amountYes = amountForYes;
            bet.amountNo = amountForNo;
        } else {
            // Subsequent bets: add to existing handles
            bet.amountYes = FHE.add(bet.amountYes, amountForYes);
            bet.amountNo = FHE.add(bet.amountNo, amountForNo);
        }
        
        // Update encrypted totals
        market.totalVolumeYes = FHE.add(market.totalVolumeYes, amountForYes);
        market.totalVolumeNo = FHE.add(market.totalVolumeNo, amountForNo);

        // Grant access permissions for amounts
        FHE.allowThis(bet.amountYes);
        FHE.allow(bet.amountYes, msg.sender);  // Bettor can user-decrypt their own bet
        FHE.allowThis(bet.amountNo);
        FHE.allow(bet.amountNo, msg.sender);  // Bettor can user-decrypt their own bet
        FHE.allowThis(market.totalVolumeYes);
        FHE.allowThis(market.totalVolumeNo);
        // NOTE: totalVolume NOT granted to bettor - only public after oracle requests

        // msg.value is held in contract; funds are pooled until claims
        emit BetPlacedEncrypted(_marketId, msg.sender, FHE.toBytes32(encryptedValue), FHE.toBytes32(encryptedSide));
    }

    /**
     * @notice Close a market (stop accepting bets)
     * @param _marketId market id
     */
    function closeMarket(uint256 _marketId) external marketExists(_marketId) {
        Market storage market = markets[_marketId];
        require(market.status == MarketStatus.Open, "HoloPredict: Market not open");
        require(block.timestamp >= market.endTime || msg.sender == owner, "HoloPredict: Cannot close yet");

        market.status = MarketStatus.Closed;
        emit MarketClosed(_marketId);
    }

    /**
     * @notice Oracle sets the encrypted outcome (decides YES or NO won)
     * @param _marketId market id
     * @param _encryptedOutcome external encrypted outcome handle (true = YES won, false = NO won)
     * @param _inputProof attestation / signatures proving the ciphertext is well formed
     * @dev Oracle encrypts the result: true if YES won, false if NO won
     */
    function setOutcome(
        uint256 _marketId,
        externalEbool _encryptedOutcome,
        bytes calldata _inputProof
    ) external onlyOracle marketExists(_marketId) {
        Market storage market = markets[_marketId];
        require(market.status == MarketStatus.Closed, "HoloPredict: Market must be closed");
        require(block.timestamp >= market.resolutionTime, "HoloPredict: Resolution time not reached");
        require(!market.outcomeDecrypted, "HoloPredict: Outcome already decrypted");

        // Oracle sets encrypted outcome: true = YES won, false = NO won
        market.outcome = FHE.fromExternal(_encryptedOutcome, _inputProof);
        market.status = MarketStatus.Resolved;

        // Allow contract access to the encrypted outcome handle
        FHE.allowThis(market.outcome);

        emit MarketResolvedEncrypted(_marketId);
    }

    /* ========== DECRYPTION CALLBACKS (Gateway style) ========== */

    /**
     * @notice Verify and set decrypted outcome using FHEVM v0.9 signature verification
     * @param _marketId market id
     * @param _decryptedOutcome decrypted boolean outcome (plaintext)
     * @param _decryptionProof KMS decryption proof with signatures
     */
    function verifyAndSetDecryptedOutcome(
        uint256 _marketId,
        bool _decryptedOutcome,
        bytes calldata _decryptionProof
    ) external onlyOracle marketExists(_marketId) {
        Market storage market = markets[_marketId];
        require(market.status == MarketStatus.Resolved, "HoloPredict: Market not resolved");
        require(!market.outcomeDecrypted, "HoloPredict: Outcome already decrypted");

        // Verify the signature matches the encrypted outcome
        // In FHEVM v0.9, we use checkSignatures to verify off-chain decryption
        bytes32[] memory handlesList = new bytes32[](1);
        handlesList[0] = FHE.toBytes32(market.outcome);
        
        bytes memory abiEncodedCleartexts = abi.encode(_decryptedOutcome);
        
        // checkSignatures will revert if verification fails
        FHE.checkSignatures(handlesList, abiEncodedCleartexts, _decryptionProof);

        market.outcomeDecrypted = true;
        market.outcomeValue = _decryptedOutcome;

        emit OutcomeDecrypted(_marketId, _decryptedOutcome);
    }

    /**
     * @notice Request decryption of the outcome (emits an event for relayer/Gateway)
     * @param _marketId market id
     */
    function requestOutcomeDecryption(uint256 _marketId) external onlyOracle marketExists(_marketId) {
        Market storage market = markets[_marketId];
        require(market.status == MarketStatus.Resolved, "HoloPredict: Market not resolved");
        require(!market.outcomeDecrypted, "HoloPredict: Outcome already decrypted");

        // Mark outcome as publicly decryptable (persistent, emits AllowedForDecryption event)
        FHE.makePubliclyDecryptable(market.outcome);

        emit DecryptionRequested(_marketId, FHE.toBytes32(market.outcome));
    }

    /**
     * @notice Request decryption of total volumes (emits an event for relayer/Gateway)
     * @param _marketId market id
     */
    function requestVolumeDecryption(uint256 _marketId) external onlyOracle marketExists(_marketId) {
        Market storage market = markets[_marketId];
        require(market.status == MarketStatus.Resolved, "HoloPredict: Market not resolved");
        require(!market.volumesDecrypted, "HoloPredict: Volumes already decrypted");

        // Mark volumes as publicly decryptable (persistent, emits AllowedForDecryption events)
        FHE.makePubliclyDecryptable(market.totalVolumeYes);
        FHE.makePubliclyDecryptable(market.totalVolumeNo);

        emit VolumeDecryptionRequested(_marketId, FHE.toBytes32(market.totalVolumeYes), FHE.toBytes32(market.totalVolumeNo));
    }

    /**
     * @notice Verify and set decrypted volumes using FHEVM v0.9 signature verification
     * @param _marketId market id
     * @param _decryptedVolumeYes plaintext total YES
     * @param _decryptedVolumeNo plaintext total NO
     * @param _decryptionProof KMS decryption proof with signatures for both volumes
     */
    function verifyAndSetDecryptedVolumes(
        uint256 _marketId,
        uint256 _decryptedVolumeYes,
        uint256 _decryptedVolumeNo,
        bytes calldata _decryptionProof
    ) external onlyOracle marketExists(_marketId) {
        Market storage market = markets[_marketId];
        require(market.status == MarketStatus.Resolved, "HoloPredict: Market not resolved");
        require(!market.volumesDecrypted, "HoloPredict: Volumes already decrypted");

        // Verify signatures for both volumes
        bytes32[] memory handlesList = new bytes32[](2);
        handlesList[0] = FHE.toBytes32(market.totalVolumeYes);
        handlesList[1] = FHE.toBytes32(market.totalVolumeNo);
        
        bytes memory abiEncodedCleartexts = abi.encode(_decryptedVolumeYes, _decryptedVolumeNo);
        
        // checkSignatures will revert if verification fails
        FHE.checkSignatures(handlesList, abiEncodedCleartexts, _decryptionProof);

        market.decryptedVolumeYes = _decryptedVolumeYes;
        market.decryptedVolumeNo = _decryptedVolumeNo;
        market.volumesDecrypted = true;
    }


    /**
     * @notice Make user's bet handles decryptable for local decryption
     * @dev This allows users to decrypt their own bets locally via SDK
     *      Note: This makes handles publicly decryptable, but users decrypt locally with their private key
     * @param _marketId market id
     */
    function makeUserBetsDecryptable(uint256 _marketId) external marketExists(_marketId) {
        Market storage market = markets[_marketId];
        Bet storage bet = market.bets[msg.sender];
        
        // Only the bettor can make their own handles decryptable
        bytes32 amountYesBytes = FHE.toBytes32(bet.amountYes);
        bytes32 amountNoBytes = FHE.toBytes32(bet.amountNo);
        bytes32 sideBytes = FHE.toBytes32(bet.betSide);
        
        // PRIVACY FIX: Both handles are always initialized now
        require(amountYesBytes != bytes32(0) && amountNoBytes != bytes32(0), "HoloPredict: No bet placed");
        require(sideBytes != bytes32(0), "HoloPredict: No side handle");
        
        // Make handles decryptable (required by Zama SDK's publicDecrypt)
        // PRIVACY FIX: Always make both handles decryptable since both are now always initialized
        // Note: This makes them publicly decryptable, but users decrypt locally with their private key
        // The SDK uses the connected wallet's private key automatically
        FHE.makePubliclyDecryptable(bet.amountYes);
        FHE.makePubliclyDecryptable(bet.amountNo);
        FHE.makePubliclyDecryptable(bet.betSide);
    }

    /* ========== CLAIMS & PAYOUTS ========== */

    /**
     * @notice Claim profit after market resolved and decryptions done
     * @dev User provides decrypted values locally (via SDK) and contract verifies them
     * @param _marketId market id
     * @param _decryptedAmountYes plaintext bet YES amount
     * @param _decryptedAmountNo plaintext bet NO amount
     * @param _decryptedSide plaintext bet side (true = YES, false = NO)
     * @param _decryptionProof KMS decryption proof with signatures for amounts and side
     */
    function claimProfit(
        uint256 _marketId,
        uint256 _decryptedAmountYes,
        uint256 _decryptedAmountNo,
        bool _decryptedSide,
        bytes calldata _decryptionProof
    ) external marketExists(_marketId) {
        Market storage market = markets[_marketId];
        require(market.status == MarketStatus.Resolved, "HoloPredict: Market not resolved");
        require(market.outcomeDecrypted, "HoloPredict: Outcome not decrypted");
        require(market.volumesDecrypted, "HoloPredict: Volumes not decrypted");

        Bet storage bet = market.bets[msg.sender];
        require(!bet.hasClaimed, "HoloPredict: Already claimed");

        // Verify signatures for bet amounts and side
        bytes32 amountYesBytes = FHE.toBytes32(bet.amountYes);
        bytes32 amountNoBytes = FHE.toBytes32(bet.amountNo);
        bytes32 sideBytes = FHE.toBytes32(bet.betSide);
        
        // PRIVACY FIX: Both handles are always initialized now, so check that both are non-zero handles
        require(amountYesBytes != bytes32(0) && amountNoBytes != bytes32(0), "HoloPredict: Bet handles not properly initialized");
        require(sideBytes != bytes32(0), "HoloPredict: No side handle");
        
        // Build handles list: always include side, then amounts
        // PRIVACY FIX: Both handles are now always initialized (even if one is encrypted zero)
        // So we always include both handles in the decryption proof
        bytes32[] memory handlesList = new bytes32[](3);
        handlesList[0] = amountYesBytes;
        handlesList[1] = amountNoBytes;
        handlesList[2] = sideBytes;
        bytes memory abiEncodedCleartexts = abi.encode(_decryptedAmountYes, _decryptedAmountNo, _decryptedSide);
        
        FHE.checkSignatures(handlesList, abiEncodedCleartexts, _decryptionProof);

        // Determine user's bet amount and validate
        uint256 userBetAmount = _decryptedSide ? _decryptedAmountYes : _decryptedAmountNo;
        require(userBetAmount > 0, "HoloPredict: No bet amount");
        require((market.outcomeValue && _decryptedSide) || (!market.outcomeValue && !_decryptedSide), "HoloPredict: Did not bet on winning side");

        // Calculate profit: (user_bet / total_winning_volume) * total_pool
        uint256 totalWinningVolume = market.outcomeValue ? market.decryptedVolumeYes : market.decryptedVolumeNo;
        uint256 totalLosingVolume = market.outcomeValue ? market.decryptedVolumeNo : market.decryptedVolumeYes;
        uint256 profit = 0;
        if (totalWinningVolume > 0) {
            profit = ((userBetAmount * (totalWinningVolume + totalLosingVolume)) / totalWinningVolume) * 1e9;
        }

        require(address(this).balance >= profit, "HoloPredict: Insufficient contract balance");
        bet.hasClaimed = true;

        if (profit > 0) {
            (bool success, ) = payable(msg.sender).call{value: profit}("");
            require(success, "HoloPredict: Transfer failed");
            emit ProfitClaimed(_marketId, msg.sender, profit);
        }
    }

    /* ========== VIEW / HELPERS ========== */

    /**
     * @notice Return encrypted outcome handle (bytes32) for a market
     */
    function getEncryptedOutcome(uint256 _marketId) external view marketExists(_marketId) returns (bytes32) {
        Market storage market = markets[_marketId];
        require(market.status == MarketStatus.Resolved, "HoloPredict: Market not resolved");
        return FHE.toBytes32(market.outcome);
    }

    /**
     * @notice Return encrypted volume handles (bytes32) for a market
     */
    function getEncryptedVolumes(uint256 _marketId) external view marketExists(_marketId) returns (bytes32, bytes32) {
        Market storage market = markets[_marketId];
        return (FHE.toBytes32(market.totalVolumeYes), FHE.toBytes32(market.totalVolumeNo));
    }

    /**
     * @notice Return encrypted bet handles for a user (bytes32)
     */
    function getEncryptedBets(uint256 _marketId, address _bettor) external view marketExists(_marketId) returns (bytes32, bytes32, bytes32) {
        Market storage market = markets[_marketId];
        Bet storage bet = market.bets[_bettor];
        return (FHE.toBytes32(bet.amountYes), FHE.toBytes32(bet.amountNo), FHE.toBytes32(bet.betSide));
    }

    /**
     * @notice Live market data (returns encrypted handles only)
     */
    function getLiveMarketData(uint256 _marketId) external view marketExists(_marketId)
        returns (
            string memory question,
            MarketStatus status,
            uint256 endTime,
            bytes32 volumeYesHandle,
            bytes32 volumeNoHandle,
            bytes32 marketCapHandle,
            bool isLive
        )
    {
        Market storage market = markets[_marketId];

        question = market.question;
        status = market.status;
        endTime = market.endTime;
        isLive = (market.status == MarketStatus.Open);

        volumeYesHandle = FHE.toBytes32(market.totalVolumeYes);
        volumeNoHandle = FHE.toBytes32(market.totalVolumeNo);
        marketCapHandle = bytes32(0); // Off-chain: decrypt both handles and add
        return (question, status, endTime, volumeYesHandle, volumeNoHandle, marketCapHandle, isLive);
    }

    /**
     * @notice Get market info - decrypted values returned only when available
     */
    function getMarketInfo(uint256 _marketId) external view marketExists(_marketId)
        returns (
            string memory question,
            address creator,
            MarketStatus status,
            uint256 endTime,
            uint256 resolutionTime,
            bool outcomeDecrypted,
            bool outcomeValue,
            bool volumesDecrypted,
            uint256 decryptedVolumeYes,
            uint256 decryptedVolumeNo
        )
    {
        Market storage market = markets[_marketId];

        question = market.question;
        creator = market.creator;
        status = market.status;
        endTime = market.endTime;
        resolutionTime = market.resolutionTime;
        outcomeDecrypted = market.outcomeDecrypted;
        volumesDecrypted = market.volumesDecrypted;

        if (market.outcomeDecrypted) {
            outcomeValue = market.outcomeValue;
        } else {
            outcomeValue = false;
        }
        
        if (market.volumesDecrypted) {
            decryptedVolumeYes = market.decryptedVolumeYes;
            decryptedVolumeNo = market.decryptedVolumeNo;
        } else {
            decryptedVolumeYes = 0;
            decryptedVolumeNo = 0;
        }

        return (question, creator, status, endTime, resolutionTime, outcomeDecrypted, outcomeValue, volumesDecrypted, decryptedVolumeYes, decryptedVolumeNo);
    }

    /**
     * @notice Get user's bet info (returns encrypted handles only)
     */
    function getUserBetInfo(uint256 _marketId, address _bettor) external view marketExists(_marketId)
        returns (
            bytes32 amountYesHandle,
            bytes32 amountNoHandle,
            bytes32 sideHandle,
            bool hasClaimed
        )
    {
        Market storage market = markets[_marketId];
        Bet storage bet = market.bets[_bettor];

        amountYesHandle = FHE.toBytes32(bet.amountYes);
        amountNoHandle = FHE.toBytes32(bet.amountNo);
        sideHandle = FHE.toBytes32(bet.betSide);
        hasClaimed = bet.hasClaimed;

        return (amountYesHandle, amountNoHandle, sideHandle, hasClaimed);
    }

    /**
     * @notice Get market stats for resulted markets
     */
    function getMarketStats(uint256 _marketId) external view marketExists(_marketId)
        returns (uint256 totalVolume, uint256 volumeYes, uint256 volumeNo, bool outcome, bool isResolved)
    {
        Market storage market = markets[_marketId];
        if (market.volumesDecrypted) {
            volumeYes = market.decryptedVolumeYes;
            volumeNo = market.decryptedVolumeNo;
            totalVolume = volumeYes + volumeNo;
        } else {
            volumeYes = 0;
            volumeNo = 0;
            totalVolume = 0;
        }
        outcome = market.outcomeValue;
        isResolved = (market.status == MarketStatus.Resolved && market.outcomeDecrypted && market.volumesDecrypted);
        return (totalVolume, volumeYes, volumeNo, outcome, isResolved);
    }

    /**
     * @notice Check if user can claim profit (view-only)
     * @dev User must decrypt locally to calculate actual profit
     */
    function canClaimProfit(uint256 _marketId, address _bettor) external view marketExists(_marketId) returns (bool) {
        Market storage market = markets[_marketId];
        Bet storage bet = market.bets[_bettor];

        return market.status == MarketStatus.Resolved &&
               market.outcomeDecrypted &&
               market.volumesDecrypted &&
               !bet.hasClaimed;
    }

    /* ========== ADMIN ========== */

    /**
     * @notice Update oracle address
     */
    function setOracle(address _newOracle) external onlyOwner {
        require(_newOracle != address(0), "HoloPredict: zero address");
        oracle = _newOracle;
    }

    /**
     * @notice Cancel a market before resolution (owner only)
     */
    function cancelMarket(uint256 _marketId) external onlyOwner marketExists(_marketId) {
        Market storage market = markets[_marketId];
        require(
            market.status == MarketStatus.Open || market.status == MarketStatus.Closed,
            "HoloPredict: Cannot cancel"
        );
        require(!market.outcomeDecrypted, "HoloPredict: Cannot cancel resolved market");

        market.status = MarketStatus.Cancelled;
    }

    /**
     * @notice Emergency withdraw all ETH to owner (only owner)
     */
    function emergencyWithdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "HoloPredict: No balance");
        (bool success, ) = payable(owner).call{value: balance}("");
        require(success, "HoloPredict: Transfer failed");
    }

    /**
     * @notice Receive ETH sent to the contract
     * @dev Allows the contract to receive ETH for betting
     */
    receive() external payable {
        // Accept ETH payments (used for betting)
    }
}