# HoloPredict

**Privacy-Preserving Prediction Markets**

HoloPredict is a privacy-preserving prediction market built on Zama FHE (Fully Homomorphic Encryption), allowing users to create and trade on markets while keeping their positions and amounts confidential on-chain.

## 🌟 Features

- **🔒 Privacy-Preserving Betting**: All bets are encrypted using Zama FHEVM, keeping amounts and positions private until resolution
- **📊 Market Management**: Create, view, and manage prediction markets across multiple categories
- **💰 Profit Claims**: Automatically calculate and claim profits after market resolution
- **🎯 Smart Market Sorting**: Intelligent priority-based sorting (Open → Bet Time Closer → Ended → Resolve Time Closer → Closed → Resolved)
- **🏷️ Category System**: Organize markets by categories (Crypto, Sports, Politics, Finance, Tech, Other)
- **🔍 Search & Filter**: Powerful search and category filtering capabilities
- **👛 MetaMask Integration**: Seamless wallet connection and transaction management
- **🔮 Oracle System**: Dedicated oracle panel for market resolution

## 🏗️ Architecture

HoloPredict consists of two main components:

1. **Smart Contracts** (`contracts/`): Solidity contracts using Zama FHEVM for encrypted operations
2. **Frontend** (`frontend/`): React + TypeScript application with MetaMask integration

## 🚀 Quick Start

### Prerequisites

- Node.js >= 20
- npm >= 7.0.0
- MetaMask browser extension
- Sepolia testnet ETH (for testing)

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd HoloPredict
```

2. **Install dependencies**
```bash
npm install
cd frontend
npm install
cd ..
```

3. **Configure root environment variables**

Create a `.env` file in the root directory:
```env
# Deployer private key (DO NOT commit the real value)
PRIVATE_KEY=your_private_key_here

# Sepolia RPC URL (Infura, Alchemy, or other provider)
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/your_infura_project_id

# (Optional) Etherscan API key for contract verification
ETHERSCAN_API_KEY=your_etherscan_api_key_here

# Oracle address on Sepolia
ORACLE_ADDRESS=0xYourOracleAddress

# (Optional) Deployed HoloPredict contract address on Sepolia
HOLOPREDICT_ADDRESS=0xYourHoloPredictAddress
```

4. **Deploy contracts**
```bash
npm run deploy:sepolia
```

After deployment,  
5. **Configure frontend environment variables**

Create a `.env` file in the `frontend/` directory with the deployed contract address:
```env
VITE_HOLOPREDICT_ADDRESS=your_deployed_contract_address
VITE_SEPOLIA_RPC_URL=rpc_url
```

Replace `your_deployed_contract_address` with the actual address from step 4.

6. **Start the frontend**
```bash
cd frontend
npm run dev
```

## 📁 Project Structure

```
HoloPredict/
├── contracts/           # Solidity smart contracts
│   └── HoloPredict.sol # Main prediction market contract
├── frontend/           # React frontend application
│   ├── src/
│   │   ├── components/ # React components
│   │   ├── hooks/      # Custom React hooks
│   │   ├── config/     # Configuration files
│   │   └── contexts/   # React contexts
│   └── package.json
├── scripts/            # Utility scripts
├── tests/              # Contract tests
├── deploy/             # Deployment scripts
└── package.json
```

## 🔧 Development

### Smart Contracts

```bash
# Compile contracts
npm run compile

# Run tests
npm run test

# Deploy to localhost
npm run deploy:localhost

# Deploy to Sepolia
npm run deploy:sepolia

# Verify on Sepolia
npm run verify:sepolia
```

### Frontend

```bash
cd frontend

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## 🎯 Market Status Priority

Markets are automatically sorted by priority:

1. **Open** (status 0, betting active) - Sorted by endTime ascending (closer bet times first)
2. **Ended** (status 0, betting period ended) - Sorted by endTime descending (most recently ended first)
3. **Closed** (status 1, awaiting resolution) - Sorted by resolutionTime ascending (closer resolve times first)
4. **Resolved** (status 2) - Sorted by resolutionTime descending (most recently resolved first)

## 🔐 Security Features

- **Encrypted Betting**: All bet amounts and positions are encrypted using Zama FHEVM
- **Private Until Resolution**: Betting data remains private until market resolution
- **Decryption Control**: Only authorized parties can decrypt market outcomes
- **Access Control**: Role-based access for market creation and resolution

## 🛠️ Technologies

### Smart Contracts
- Solidity ^0.8.24
- Hardhat
- Zama FHEVM Solidity Library
- Ethers.js v6

### Frontend
- React 19
- TypeScript
- Vite
- Ethers.js v6
- Zama FHE Relayer SDK
- MetaMask Integration

## 📚 Documentation

- [Frontend README](frontend/README.md) - Detailed frontend setup and usage
- [Zama FHEVM Documentation](https://docs.zama.ai/fhevm) - FHEVM library documentation

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📝 License

MIT License - see LICENSE file for details

## 🔗 Links

- [Zama FHEVM](https://docs.zama.ai/fhevm)
- [Ethereum Sepolia Testnet](https://sepolia.etherscan.io/)

## 📧 Support

For issues and questions, please open an issue on GitHub.

---

**Built with ❤️ using Zama FHEVM**

