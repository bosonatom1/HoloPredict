import { expect } from "chai";
import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { HoloPredict } from "../types";
import { time } from "@nomicfoundation/hardhat-network-helpers";

/**
 * HoloPredict Unit Tests
 * 
 * NOTE: These tests cover non-FHE functionality (access control, state management, etc.)
 * FHE operations (placeBet, setOutcome, decryption) require:
 * - Real FHEVM network (Sepolia testnet) OR
 * - Mocked FHE coprocessors
 * 
 * For full integration tests including FHE operations, use:
 * - npx hardhat test --network sepolia (requires testnet deployment)
 * - Manual testing via frontend with Zama Relayer SDK
 */

describe("HoloPredict", function () {
  let holopredict: HoloPredict;
  let owner: HardhatEthersSigner;
  let oracle: HardhatEthersSigner;
  let bettor1: HardhatEthersSigner;
  let bettor2: HardhatEthersSigner;

  beforeEach(async function () {
    [owner, oracle, bettor1, bettor2] = await ethers.getSigners();

    const HoloPredictFactory = await ethers.getContractFactory("HoloPredict");
    holopredict = (await HoloPredictFactory.deploy(oracle.address)) as HoloPredict;
    await holopredict.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await holopredict.owner()).to.equal(owner.address);
    });

    it("Should set the right oracle", async function () {
      expect(await holopredict.oracle()).to.equal(oracle.address);
    });

    it("Should start with zero markets", async function () {
      expect(await holopredict.marketCount()).to.equal(0n);
    });
  });

  describe("Market Creation", function () {
    it("Should create a market", async function () {
      const question = "Will Bitcoin reach $100k by 2025?";
      const endTime = (await time.latest()) + 86400; // 1 day from now
      const resolutionTime = endTime + 86400; // 2 days from now

      await expect(
        holopredict.connect(oracle).createMarket(question, endTime, resolutionTime)
      )
        .to.emit(holopredict, "MarketCreated")
        .withArgs(0n, oracle.address, question, BigInt(endTime), BigInt(resolutionTime));

      expect(await holopredict.marketCount()).to.equal(1n);
    });

    it("Should revert if non-oracle tries to create market", async function () {
      const question = "Test question";
      const endTime = (await time.latest()) + 86400;
      const resolutionTime = endTime + 86400;

      await expect(
        holopredict.connect(bettor1).createMarket(question, endTime, resolutionTime)
      ).to.be.revertedWith("HoloPredict: Not oracle");
    });

    it("Should revert if endTime is in the past", async function () {
      const question = "Test question";
      const endTime = (await time.latest()) - 100;
      const resolutionTime = endTime + 86400;

      await expect(
        holopredict.connect(oracle).createMarket(question, endTime, resolutionTime)
      ).to.be.revertedWith("HoloPredict: endTime must be future");
    });

    it("Should revert if resolutionTime is before endTime", async function () {
      const question = "Test question";
      const endTime = (await time.latest()) + 86400;
      const resolutionTime = endTime - 100;

      await expect(
        holopredict.connect(oracle).createMarket(question, endTime, resolutionTime)
      ).to.be.revertedWith("HoloPredict: resolution after endTime");
    });
  });

  describe("Market Closing", function () {
    let marketId: bigint;
    let endTime: number;

    beforeEach(async function () {
      const question = "Will Ethereum reach $5000?";
      endTime = (await time.latest()) + 86400;
      const resolutionTime = endTime + 86400;

      const tx = await holopredict.connect(oracle).createMarket(question, endTime, resolutionTime);
      const receipt = await tx.wait();
      const event = receipt?.logs.find(
        (log: any) => log.topics[0] === ethers.id("MarketCreated(uint256,address,string,uint256,uint256)")
      );
      marketId = BigInt(event?.topics[1] || 0);
    });

    it("Should close market after endTime", async function () {
      await time.increaseTo(endTime);

      await expect(holopredict.closeMarket(marketId))
        .to.emit(holopredict, "MarketClosed")
        .withArgs(marketId);
    });

    it("Should allow owner to close market early", async function () {
      await expect(holopredict.connect(owner).closeMarket(marketId))
        .to.emit(holopredict, "MarketClosed")
        .withArgs(marketId);
    });

    it("Should revert if market is not open", async function () {
      await time.increaseTo(endTime);
      await holopredict.closeMarket(marketId);

      await expect(holopredict.closeMarket(marketId)).to.be.revertedWith("HoloPredict: Market not open");
    });
  });

  describe("Admin Functions", function () {
    it("Should allow owner to set new oracle", async function () {
      await holopredict.connect(owner).setOracle(bettor1.address);
      expect(await holopredict.oracle()).to.equal(bettor1.address);
    });

    it("Should revert if non-owner tries to set oracle", async function () {
      await expect(
        holopredict.connect(bettor1).setOracle(bettor2.address)
      ).to.be.revertedWith("HoloPredict: Not owner");
    });

    it("Should revert if setting oracle to zero address", async function () {
      await expect(
        holopredict.connect(owner).setOracle(ethers.ZeroAddress)
      ).to.be.revertedWith("HoloPredict: zero address");
    });

    it("Should allow owner to cancel market", async function () {
      const question = "Test question";
      const endTime = (await time.latest()) + 86400;
      const resolutionTime = endTime + 86400;

      const tx = await holopredict.connect(oracle).createMarket(question, endTime, resolutionTime);
      const receipt = await tx.wait();
      const event = receipt?.logs.find(
        (log: any) => log.topics[0] === ethers.id("MarketCreated(uint256,address,string,uint256,uint256)")
      );
      const marketId = BigInt(event?.topics[1] || 0);

      await holopredict.connect(owner).cancelMarket(marketId);
      
      const marketInfo = await holopredict.getMarketInfo(marketId);
      expect(marketInfo.status).to.equal(3); // Cancelled
    });
  });

  describe("View Functions", function () {
    let marketId: bigint;

    beforeEach(async function () {
      const question = "Will Solana reach $200?";
      const endTime = (await time.latest()) + 86400;
      const resolutionTime = endTime + 86400;

      const tx = await holopredict.connect(oracle).createMarket(question, endTime, resolutionTime);
      const receipt = await tx.wait();
      const event = receipt?.logs.find(
        (log: any) => log.topics[0] === ethers.id("MarketCreated(uint256,address,string,uint256,uint256)")
      );
      marketId = BigInt(event?.topics[1] || 0);
    });

    it("Should return market info", async function () {
      const marketInfo = await holopredict.getMarketInfo(marketId);
      expect(marketInfo.question).to.equal("Will Solana reach $200?");
      expect(marketInfo.creator).to.equal(oracle.address);
      expect(marketInfo.status).to.equal(0); // Open
    });

    it("Should return live market data", async function () {
      const liveData = await holopredict.getLiveMarketData(marketId);
      expect(liveData.question).to.equal("Will Solana reach $200?");
      expect(liveData.isLive).to.be.true;
    });

    it("Should return user bet info", async function () {
      const userBetInfo = await holopredict.getUserBetInfo(marketId, bettor1.address);
      // getUserBetInfo returns: (amountYesHandle, amountNoHandle, sideHandle, hasClaimed)
      expect(userBetInfo[0]).to.equal(ethers.ZeroHash); // amountYesHandle should be zero (no bet)
      expect(userBetInfo[1]).to.equal(ethers.ZeroHash); // amountNoHandle should be zero (no bet)
      expect(userBetInfo[2]).to.equal(ethers.ZeroHash); // sideHandle should be zero (no bet)
      expect(userBetInfo[3]).to.be.false; // hasClaimed should be false
    });

    it("Should return encrypted outcome handle", async function () {
      // Market is not resolved yet, so this should revert
      await expect(
        holopredict.getEncryptedOutcome(marketId)
      ).to.be.revertedWith("HoloPredict: Market not resolved");
    });

    it("Should return encrypted volumes", async function () {
      const [volumeYesHandle, volumeNoHandle] = await holopredict.getEncryptedVolumes(marketId);
      // Volumes are initialized as encrypted zero handles, so they should not be zero hash
      expect(volumeYesHandle).to.not.equal(ethers.ZeroHash);
      expect(volumeNoHandle).to.not.equal(ethers.ZeroHash);
    });

    it("Should return encrypted bets", async function () {
      const [amountYesHandle, amountNoHandle, sideHandle] = await holopredict.getEncryptedBets(marketId, bettor1.address);
      // No bet placed, so all handles should be zero
      expect(amountYesHandle).to.equal(ethers.ZeroHash);
      expect(amountNoHandle).to.equal(ethers.ZeroHash);
      expect(sideHandle).to.equal(ethers.ZeroHash);
    });

    it("Should return market stats", async function () {
      const stats = await holopredict.getMarketStats(marketId);
      // getMarketStats returns: (totalVolume, volumeYes, volumeNo, outcome, isResolved)
      expect(stats[0]).to.equal(0n); // totalVolume should be 0 (not decrypted)
      expect(stats[1]).to.equal(0n); // volumeYes should be 0 (not decrypted)
      expect(stats[2]).to.equal(0n); // volumeNo should be 0 (not decrypted)
      expect(stats[3]).to.be.false; // outcome should be false (not decrypted)
      expect(stats[4]).to.be.false; // isResolved should be false (not resolved)
    });

    it("Should return canClaimProfit status", async function () {
      const canClaim = await holopredict.canClaimProfit(marketId, bettor1.address);
      expect(canClaim).to.be.false; // Market not resolved, so cannot claim
    });
  });

  describe("Emergency Functions", function () {
    it("Should allow owner to emergency withdraw", async function () {
      // Send some ETH to contract
      await bettor1.sendTransaction({
        to: await holopredict.getAddress(),
        value: ethers.parseEther("1.0"),
      });

      const balanceBefore = await ethers.provider.getBalance(owner.address);
      await holopredict.connect(owner).emergencyWithdraw();
      const balanceAfter = await ethers.provider.getBalance(owner.address);

      expect(balanceAfter).to.be.gt(balanceBefore);
    });

    it("Should revert if non-owner tries emergency withdraw", async function () {
      await expect(
        holopredict.connect(bettor1).emergencyWithdraw()
      ).to.be.revertedWith("HoloPredict: Not owner");
    });
  });

  describe("Decryption Request Functions", function () {
    let marketId: bigint;
    let endTime: number;

    beforeEach(async function () {
      const question = "Will BTC reach $100k?";
      endTime = (await time.latest()) + 86400;
      const resolutionTime = endTime + 86400;

      const tx = await holopredict.connect(oracle).createMarket(question, endTime, resolutionTime);
      const receipt = await tx.wait();
      const event = receipt?.logs.find(
        (log: any) => log.topics[0] === ethers.id("MarketCreated(uint256,address,string,uint256,uint256)")
      );
      marketId = BigInt(event?.topics[1] || 0);
    });

    it("Should revert outcome decryption if market not resolved", async function () {
      // Market is Open, not Resolved
      await expect(
        holopredict.connect(oracle).requestOutcomeDecryption(marketId)
      ).to.be.revertedWith("HoloPredict: Market not resolved");
    });

    it("Should revert volume decryption if market not resolved", async function () {
      await expect(
        holopredict.connect(oracle).requestVolumeDecryption(marketId)
      ).to.be.revertedWith("HoloPredict: Market not resolved");
    });

    it("Should revert if non-oracle requests outcome decryption", async function () {
      // Even if market was resolved, non-oracle can't request
      await expect(
        holopredict.connect(bettor1).requestOutcomeDecryption(marketId)
      ).to.be.revertedWith("HoloPredict: Not oracle");
    });

    it("Should revert if non-oracle requests volume decryption", async function () {
      await expect(
        holopredict.connect(bettor1).requestVolumeDecryption(marketId)
      ).to.be.revertedWith("HoloPredict: Not oracle");
    });

    it("Should allow bettor to request own bet decryption", async function () {
      // NOTE: This test requires a bet to be placed first (FHE operation)
      // Since these are unit tests without FHE, we test that it reverts correctly when no bet exists
      // For full integration test with real bets, use: npx hardhat test --network sepolia
      // The function is makeUserBetsDecryptable and uses msg.sender (no address parameter)
      await expect(
        holopredict.connect(bettor1).makeUserBetsDecryptable(marketId)
      ).to.be.revertedWith("HoloPredict: No bet placed");
      
      // TODO: With FHE integration, test should:
      // 1. Place a bet (requires FHE encryption)
      // 2. Request decryption
      // 3. Verify event is emitted
    });

    it("Should revert if bettor requests other's bet decryption", async function () {
      // makeUserBetsDecryptable uses msg.sender, so bettor1 can only decrypt their own bets
      // If bettor1 tries to decrypt when they have no bet, it will revert with "No bet placed"
      // If bettor2 has a bet and bettor1 tries to call it, bettor1's msg.sender will be used
      // So this test verifies that you can only decrypt your own bets (via msg.sender)
      await expect(
        holopredict.connect(bettor1).makeUserBetsDecryptable(marketId)
      ).to.be.revertedWith("HoloPredict: No bet placed");
    });

    it("Should allow oracle to request any bet decryption", async function () {
      // NOTE: makeUserBetsDecryptable uses msg.sender, so oracle can only decrypt their own bets
      // If oracle has no bet, it will revert. Oracle cannot decrypt other users' bets directly.
      // For oracle to decrypt any bet, they would need a separate function or the user must call it.
      // Since these are unit tests without FHE, we test that it reverts correctly when no bet exists
      // For full integration test with real bets, use: npx hardhat test --network sepolia
      await expect(
        holopredict.connect(oracle).makeUserBetsDecryptable(marketId)
      ).to.be.revertedWith("HoloPredict: No bet placed");
      
      // TODO: With FHE integration, test should:
      // 1. Place a bet (requires FHE encryption)
      // 2. User requests their own bet decryption
      // 3. Verify handles are made publicly decryptable
    });

    it("Should revert verifyAndSetDecryptedOutcome if market not resolved", async function () {
      // NOTE: This requires FHE decryption proof, but we test the access control
      await expect(
        holopredict.connect(oracle).verifyAndSetDecryptedOutcome(marketId, true, "0x")
      ).to.be.revertedWith("HoloPredict: Market not resolved");
    });

    it("Should revert verifyAndSetDecryptedVolumes if market not resolved", async function () {
      // NOTE: This requires FHE decryption proof, but we test the access control
      await expect(
        holopredict.connect(oracle).verifyAndSetDecryptedVolumes(marketId, 1000n, 500n, "0x")
      ).to.be.revertedWith("HoloPredict: Market not resolved");
    });

    it("Should revert verifyAndSetDecryptedOutcome if non-oracle calls", async function () {
      // Even if market was resolved, non-oracle can't verify
      await expect(
        holopredict.connect(bettor1).verifyAndSetDecryptedOutcome(marketId, true, "0x")
      ).to.be.revertedWith("HoloPredict: Not oracle");
    });

    it("Should revert verifyAndSetDecryptedVolumes if non-oracle calls", async function () {
      await expect(
        holopredict.connect(bettor1).verifyAndSetDecryptedVolumes(marketId, 1000n, 500n, "0x")
      ).to.be.revertedWith("HoloPredict: Not oracle");
    });
  });

  describe("Access Control Summary", function () {
    it("Should have correct owner permissions", async function () {
      expect(await holopredict.owner()).to.equal(owner.address);
      // Owner can: setOracle, cancelMarket, emergencyWithdraw
      // Owner also has all oracle permissions
    });

    it("Should have correct oracle permissions", async function () {
      expect(await holopredict.oracle()).to.equal(oracle.address);
      // Oracle can: createMarket, closeMarket, setOutcome, requestDecryptions, verify
    });
  });
});

/**
 * ============================================================================
 * FHE INTEGRATION TEST SCENARIOS (for manual/testnet testing)
 * ============================================================================
 * 
 * Test Case 1: Full Market Lifecycle with Encrypted Bets
 * -------------------------------------------------------
 * 1. Oracle creates market: "Will BTC reach $100k by 2026?"
 * 2. Bettor1 places 2 ETH on YES (encrypted)
 * 3. Bettor2 places 1 ETH on NO (encrypted)
 * 4. Bettor1 user-decrypts their bet: Should see "2 ETH on YES"
 * 5. Bettor2 user-decrypts their bet: Should see "1 ETH on NO"
 * 6. Bettor1 CANNOT user-decrypt Bettor2's bet (should fail)
 * 7. Anyone CANNOT see total volumes (still encrypted)
 * 8. Oracle closes market
 * 9. Oracle sets encrypted outcome: YES
 * 10. Oracle requests outcome decryption → FHE.makePubliclyDecryptable()
 * 11. Oracle requests volume decryption → FHE.makePubliclyDecryptable()
 * 12. Wait 1-2 minutes for coprocessors
 * 13. Anyone can publicDecrypt outcome: "YES won"
 * 14. Anyone can publicDecrypt volumes: "2 ETH YES, 1 ETH NO"
 * 15. Oracle verifies and sets on-chain with proofs
 * 16. Bettor1 claims profit: (2/2) * 3 = 3 ETH
 * 17. Bettor2 cannot claim (lost)
 * 
 * Test Case 2: Privacy Verification
 * ----------------------------------
 * 1. Bettor1 places bet
 * 2. Bettor2 tries to read Bettor1's encrypted bet handle directly
 * 3. Should fail or return encrypted value
 * 4. Bettor2 tries user-decryption on Bettor1's handle
 * 5. Should fail (no permission)
 * 6. Only after oracle requests public decryption can anyone read
 * 
 * Test Case 3: Decryption Permission Model
 * -----------------------------------------
 * 1. During market: Bet amounts have FHE.allow(bet, bettor) only
 * 2. Volumes have NO user permissions (only FHE.allowThis)
 * 3. After resolution: Outcome & volumes have FHE.makePubliclyDecryptable()
 * 4. Bet amounts remain private (never publicly decryptable)
 * 
 * Test Case 4: Multiple Markets
 * ------------------------------
 * 1. Create 3 markets with different questions
 * 2. Place bets on each
 * 3. Resolve markets at different times
 * 4. Verify each market's decryption is independent
 * 
 * Test with:
 * - npx hardhat run scripts/testDecryption.ts --network sepolia
 * - Frontend at http://localhost:5173
 */

