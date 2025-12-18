import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const deployHoloPredict: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, network } = hre;
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();

  log("Deploying HoloPredict...");

  // For local development, use deployer as oracle
  // For production/testnet, use ORACLE_ADDRESS from env or deployer as fallback
  let oracleAddress: string;
  if (network.name === "hardhat" || network.name === "localhost" || network.name === "anvil") {
    oracleAddress = deployer;
  } else {
    oracleAddress = process.env.ORACLE_ADDRESS || deployer;
    if (!process.env.ORACLE_ADDRESS) {
      log("WARNING: ORACLE_ADDRESS not set in .env, using deployer address as oracle");
    }
  }

  // Validate oracle address (contract constructor requires non-zero address)
  const { ethers } = hre;
  if (!ethers.isAddress(oracleAddress)) {
    throw new Error(`Invalid oracle address: ${oracleAddress}`);
  }
  if (oracleAddress === ethers.ZeroAddress) {
    throw new Error("Oracle address cannot be zero address");
  }

  log(`Deploying with oracle address: ${oracleAddress}`);

  const holopredict = await deploy("HoloPredict", {
    from: deployer,
    args: [oracleAddress],
    log: true,
    waitConfirmations: network.name === "hardhat" || network.name === "localhost" || network.name === "anvil" ? 0 : 2,
  });

  log("==========================================");
  log(`HoloPredict deployed at: ${holopredict.address}`);
  log(`Oracle address: ${oracleAddress}`);
  log(`Owner address: ${deployer}`);
  log("==========================================");
  log(`\nAdd this to your .env file:\nHOLOPREDICT_ADDRESS=${holopredict.address}`);
};

deployHoloPredict.id = "HoloPredict";
deployHoloPredict.tags = ["HoloPredict", "all"];
export default deployHoloPredict;
