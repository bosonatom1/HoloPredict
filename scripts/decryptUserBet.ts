import { ethers } from "hardhat";

/**
 * Full user bet decryption flow:
 * 1. Request bet decryption (makePubliclyDecryptable)
 * 2. Wait for coprocessors
 * 3. Decrypt via SDK
 * 4. Verify and save on-chain
 */

async function main() {
  const contractAddress = process.env.HOLOPREDICT_ADDRESS;
  if (!contractAddress) {
    throw new Error("HOLOPREDICT_ADDRESS not set in environment. Set it in your .env file.");
  }
  const marketId = process.env.MARKET_ID ? parseInt(process.env.MARKET_ID) : 0;
  
  const [signer] = await ethers.getSigners();
  const oracleAddress = await signer.getAddress();
  
  console.log("🔐 User Bet Decryption Script\n");
  console.log("Contract:", contractAddress);
  console.log("Market ID:", marketId);
  console.log("Oracle/User:", oracleAddress);
  console.log("=".repeat(70));
  
  const HoloPredict = await ethers.getContractAt("HoloPredict", contractAddress);
  
  // Check bet status
  const betInfo = await HoloPredict.getUserBetInfo(marketId, oracleAddress);
  const [amountYesHandle, amountNoHandle] = betInfo;
  // Contract requires both handles to be non-zero (both are always initialized)
  const hasBet = amountYesHandle !== ethers.ZeroHash && amountNoHandle !== ethers.ZeroHash;
  
  console.log("\n📊 Current Bet Status:");
  console.log("  Has Bet:", hasBet);
  console.log("  Amount YES Handle:", amountYesHandle);
  console.log("  Amount NO Handle:", amountNoHandle);
  
  if (!hasBet) {
    console.log("\n❌ No bet placed by this address!");
    return;
  }
  
  // Step 1: Request decryption
  console.log("\n" + "=".repeat(70));
  console.log("STEP 1: Request Bet Decryption");
  console.log("=".repeat(70));
  
  try {
    console.log("📡 Calling makeUserBetsDecryptable...");
    const tx = await HoloPredict.makeUserBetsDecryptable(marketId);
    await tx.wait();
    console.log("✅ TX:", tx.hash);
  } catch (err: any) {
    if (err.message?.includes('No bet placed')) {
      console.log("\n❌ No bet placed by this address!");
      return;
    }
    throw err;
  }
  
  // Step 2: Wait for coprocessors
  console.log("\n⏳ Waiting 15 seconds for coprocessors...");
  await new Promise(resolve => setTimeout(resolve, 15000));
  
  // Step 3: Import SDK and decrypt
  console.log("\n" + "=".repeat(70));
  console.log("STEP 2: Decrypt via SDK");
  console.log("=".repeat(70));
  
  console.log("📦 Importing SDK...");
  const { createInstance, SepoliaConfig, initSDK } = await import("@zama-fhe/relayer-sdk/web");
  
  if (initSDK) {
    await initSDK();
  }
  
  const instance = await createInstance(SepoliaConfig);
  console.log("✅ SDK initialized");
  
  console.log("📊 Fetching bet handles...");
  const [betAmountYesHandle, betAmountNoHandle, betSideHandle] = await HoloPredict.getEncryptedBets(marketId, oracleAddress);
  console.log("YES Handle:", betAmountYesHandle);
  console.log("NO Handle:", betAmountNoHandle);
  console.log("Side Handle:", betSideHandle);
  
  // Build handles list - contract ensures all handles are initialized when bet exists
  const handles = [betAmountYesHandle, betAmountNoHandle, betSideHandle];
  
  console.log("🔓 Decrypting via SDK...");
  const result = await instance.publicDecrypt(handles);
  console.log("✅ Decryption successful!");
  
  // Parse values
  const amountYesRaw = result.clearValues[betAmountYesHandle];
  const amountNoRaw = result.clearValues[betAmountNoHandle];
  const sideRaw = result.clearValues[betSideHandle];
  
  const amountYesBig = typeof amountYesRaw === 'bigint' ? amountYesRaw : BigInt(amountYesRaw.toString());
  const amountNoBig = typeof amountNoRaw === 'bigint' ? amountNoRaw : BigInt(amountNoRaw.toString());
  const side = sideRaw === true || sideRaw === 1n || (typeof sideRaw === 'number' && sideRaw === 1);
  
  // Values are in gwei
  const amountYesWei = amountYesBig * BigInt(1e9);
  const amountNoWei = amountNoBig * BigInt(1e9);
  const amountYesEth = ethers.formatEther(amountYesWei);
  const amountNoEth = ethers.formatEther(amountNoWei);
  
  console.log("\nDecrypted Values:");
  console.log("  YES:", amountYesEth, "ETH");
  console.log("  NO:", amountNoEth, "ETH");
  console.log("  Side:", side ? "YES" : "NO");
  
  console.log("\n" + "=".repeat(70));
  console.log("✅ SUCCESS!");
  console.log("=".repeat(70));
  console.log("\nBet amounts are now decryptable!");
  console.log("User can now:");
  console.log("  1. Use these decrypted values to calculate profit locally");
  console.log("  2. Call claimProfit() with the decryption proof to claim winnings");
  console.log("\nNote: claimProfit() requires the decryption proof from the SDK.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

