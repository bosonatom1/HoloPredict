import { ethers } from "hardhat";

/**
 * Test script to verify the FHE.makePubliclyDecryptable() flow
 * 
 * This script:
 * 1. Calls request*Decryption() functions (which call FHE.makePubliclyDecryptable)
 * 2. Checks if AllowedForDecryption events were emitted
 * 3. Provides instructions for frontend decryption
 */

async function main() {
  const contractAddress = process.env.HOLOPREDICT_ADDRESS;
  if (!contractAddress) {
    throw new Error("HOLOPREDICT_ADDRESS not set in environment. Set it in your .env file.");
  }
  const marketId = process.env.MARKET_ID ? parseInt(process.env.MARKET_ID) : 0;
  
  console.log("🧪 Testing FHE.makePubliclyDecryptable() decryption flow\n");
  console.log("Contract:", contractAddress);
  console.log("Market ID:", marketId);
  
  const [signer] = await ethers.getSigners();
  const signerAddress = await signer.getAddress();
  console.log("Signer:", signerAddress, "\n");
  
  const HoloPredict = await ethers.getContractAt("HoloPredict", contractAddress);
  
  // Check market status
  console.log("📊 Checking market status...");
  const marketInfo = await HoloPredict.getMarketInfo(marketId);
  const [question, , status, , , outcomeDecrypted, , volumesDecrypted] = marketInfo;
  console.log("  Question:", question);
  console.log("  Status:", ["Open", "Closed", "Resolved", "Cancelled"][Number(status)]);
  console.log("  Outcome Decrypted:", outcomeDecrypted);
  console.log("  Volumes Decrypted:", volumesDecrypted);
  
  if (Number(status) !== 2) {
    console.log("\n⚠️  Market must be Resolved (status=2) to request decryption");
    return;
  }
  
  // Verify signer is oracle or owner (contract requires onlyOracle modifier for outcome/volume decryption)
  const oracleAddress = await HoloPredict.oracle();
  const ownerAddress = await HoloPredict.owner();
  if (oracleAddress.toLowerCase() !== signerAddress.toLowerCase() && ownerAddress.toLowerCase() !== signerAddress.toLowerCase()) {
    console.log("\n⚠️  WARNING: Signer is not oracle or owner.");
    console.log("   Outcome and volume decryption requests will fail (onlyOracle modifier).");
    console.log("   Bet decryption (makeUserBetsDecryptable) can be called by anyone for their own bets.\n");
  }
  
  console.log("\n✅ Market is resolved. Proceeding with decryption requests...\n");
  
  // Request outcome decryption
  if (!outcomeDecrypted) {
    try {
      console.log("1️⃣ Requesting OUTCOME decryption...");
      const tx1 = await HoloPredict.requestOutcomeDecryption(marketId);
      await tx1.wait();
      console.log("   ✅ Transaction:", tx1.hash);
      console.log("   📡 AllowedForDecryption event emitted for outcome handle");
    } catch (error: any) {
      console.log("   ❌ Failed:", error.message);
    }
  } else {
    console.log("1️⃣ Outcome already decrypted ✅");
  }
  
  // Request volume decryption
  if (!volumesDecrypted) {
    try {
      console.log("\n2️⃣ Requesting VOLUMES decryption...");
      const tx2 = await HoloPredict.requestVolumeDecryption(marketId);
      await tx2.wait();
      console.log("   ✅ Transaction:", tx2.hash);
      console.log("   📡 AllowedForDecryption events emitted for volume handles");
    } catch (error: any) {
      console.log("   ❌ Failed:", error.message);
    }
  } else {
    console.log("\n2️⃣ Volumes already decrypted ✅");
  }
  
  // Request bet amount decryption
  const userBetInfo = await HoloPredict.getUserBetInfo(marketId, signerAddress);
  const [amountYesHandle, amountNoHandle] = userBetInfo;
  // Contract requires both handles to be non-zero (both are always initialized when bet is placed)
  const hasBet = amountYesHandle !== ethers.ZeroHash && amountNoHandle !== ethers.ZeroHash;
  
  if (hasBet) {
    try {
      console.log("\n3️⃣ Requesting BET AMOUNTS decryption for", signerAddress, "...");
      const tx3 = await HoloPredict.makeUserBetsDecryptable(marketId);
      await tx3.wait();
      console.log("   ✅ Transaction:", tx3.hash);
      console.log("   📡 AllowedForDecryption events emitted for bet amount handles");
    } catch (error: any) {
      console.log("   ❌ Failed:", error.message);
    }
  } else {
    console.log("\n3️⃣ No bet placed by this address ✅");
  }
  
  console.log("\n" + "=".repeat(70));
  console.log("📝 NEXT STEPS:");
  console.log("=".repeat(70));
  console.log("\n1. ⏳ Wait 1-2 minutes for Zama coprocessors to process AllowedForDecryption events");
  console.log("   - Coprocessors listen to the events and prepare ciphertexts for KMS");
  console.log("   - Gateway ACL is updated to allow public decryption");
  console.log("\n2. 🌐 Use the FRONTEND to decrypt:");
  console.log("   - Frontend uses instance.publicDecrypt([handles])");
  console.log("   - This is the recommended way for users");
  console.log("\n3. 🔧 Or use the manualDecrypt script:");
  console.log("   - Run: npx hardhat run scripts/manualDecrypt.ts --network sepolia");
  console.log("   - This attempts decryption programmatically");
  console.log("\n4. ✅ Verify decryption on contract:");
  console.log("   - Run: npx hardhat run scripts/checkMarket.ts --network sepolia");
  console.log("   - Check if decrypted values are set on-chain");
  console.log("\n" + "=".repeat(70));
  
  console.log("\n💡 Understanding the flow:");
  console.log("   - FHE.makePubliclyDecryptable() makes handles PUBLICLY decryptable");
  console.log("   - Anyone can decrypt after coprocessors process the AllowedForDecryption events");
  console.log("   - This is different from user-only decryption (FHE.allow for specific users)");
  console.log("   - For production, consider if you want public or user-only decryption");
  
  console.log("\n✅ Done!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

