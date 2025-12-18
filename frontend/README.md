# HoloPredict Frontend

Frontend application for the HoloPredict confidential prediction market dApp.

## 🎨 Features

- **Market Creation**: Create new prediction markets (oracle/owner only)
- **Encrypted Betting**: Place bets with encrypted amounts using Zama FHE
- **Market Management**: View and interact with active markets
- **Smart Sorting**: Priority-based market sorting (Open → Ended → Closed → Resolved)
- **Category Filters**: Filter markets by category (Crypto, Sports, Politics, Finance, Tech, Other)
- **Search Functionality**: Search markets by question text
- **Profit Claims**: Claim profits after market resolution
- **Oracle Panel**: Oracle controls for market resolution
- **MetaMask Integration**: Direct MetaMask wallet connection
- **Responsive Design**: Modern, mobile-friendly UI with dark theme

## 🚀 Quick Start

### Prerequisites

- Node.js >= 20
- npm >= 7.0.0
- MetaMask browser extension
- Deployed HoloPredict contract address

### Environment Setup

1. **Copy environment template**
```bash
cp .env.example .env
```

2. **Configure environment variables**

Create a `.env` file in the `frontend/` directory:

#### Required Variables:

- **VITE_HOLOPREDICT_ADDRESS**: Your deployed contract address on Sepolia
  - Get this from your deployment output or `deployments/sepolia/HoloPredict.json`
  - Example: `VITE_HOLOPREDICT_ADDRESS=0x5DD860BFeE21650f8310966F086dEDc3E7482396`
 
### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

The application will start on `http://localhost:5173` (or the next available port).

### Build

```bash
npm run build
```

The production build will be created in the `dist/` directory.

### Preview Production Build

```bash
npm run preview
```

## 📁 Project Structure

```
frontend/
├── src/
│   ├── components/          # React components
│   │   ├── MarketList.tsx   # Main market listing component
│   │   ├── MarketDetail.tsx # Individual market detail view
│   │   ├── CreateMarket.tsx # Market creation form
│   │   ├── PlaceBet.tsx     # Betting interface
│   │   ├── ClaimProfit.tsx  # Profit claiming component
│   │   ├── OraclePanel.tsx  # Oracle resolution controls
│   │   ├── WalletConnect.tsx # Wallet connection UI
│   │   └── FAQ.tsx          # FAQ component
│   ├── hooks/               # Custom React hooks
│   │   ├── useWallet.ts      # MetaMask integration
│   │   └── useHoloPredict.ts # Contract interactions
│   ├── contexts/            # React contexts
│   │   └── FHEContext.tsx   # FHE encryption context
│   ├── config/              # Configuration files
│   │   ├── contracts.ts     # Contract addresses and config
│   │   └── abis.ts          # Contract ABIs
│   ├── utils/               # Utility functions
│   │   └── categories.ts    # Category extraction and display
│   └── styles/              # CSS files
│       ├── App.css          # Main app styles
│       └── index.css        # Global styles
├── public/                  # Static assets
└── package.json
```

## 🎯 Key Components

### MarketList
Main component displaying all markets with:
- Tab-based filtering (Live, Closed, Resolved, My Bets)
- Category filters
- Search functionality
- Priority-based sorting
- Market cards with status badges

### MarketDetail
Detailed view of a single market showing:
- Market question and metadata
- Betting interface (YES/NO buttons)
- Volume information (when decrypted)
- Outcome display (when resolved)
- Oracle panel (for authorized users)
- Profit claiming (for resolved markets)

### PlaceBet
Encrypted betting interface:
- Amount input with validation
- Side selection (YES/NO)
- FHE encryption integration
- Transaction handling

### OraclePanel
Oracle controls for:
- Setting market outcomes
- Requesting volume decryption
- Requesting outcome decryption
- Market closing

## 🔧 Technologies

- **React 19**: UI framework
- **TypeScript**: Type safety
- **Vite**: Build tool and dev server
- **Ethers.js v6**: Ethereum interaction
- **Zama FHE Relayer SDK**: FHE encryption operations
- **MetaMask**: Wallet integration

## 🎨 Styling

The application uses a modern dark theme with:
- Glassmorphism effects
- Smooth animations and transitions
- Responsive design
- Category-based color coding
- Status-based badges

## 🔐 Security Considerations

- All sensitive operations require wallet connection
- Bet amounts are encrypted before submission
- Private keys never leave the user's wallet
- FHE operations handled through Zama relayer

## 🐛 Troubleshooting

### Contract Address Not Found
- Ensure `VITE_HOLOPREDICT_ADDRESS` is set in `.env`
- Restart the dev server after changing `.env`
- Check that the contract is deployed on the correct network

### MetaMask Connection Issues
- Ensure MetaMask is installed and unlocked
- Connect to Sepolia testnet
- Check that you have testnet ETH

### FHE Operations Failing
- Verify Zama relayer is accessible
- Check network configuration (`VITE_FHEVM_NETWORK`)
- Ensure contract supports FHE operations

## 📝 Development Notes

- The app uses React Query for data fetching (via `@tanstack/react-query`)
- Market sorting is handled client-side for performance
- Category extraction uses regex patterns on market questions
- All timestamps are displayed in local timezone

## 🔄 State Management

- React hooks for local component state
- Context API for FHE instance sharing
- Custom hooks for contract interactions
- LocalStorage for tab persistence

## 🚀 Deployment

1. Build the application:
```bash
npm run build
```

2. Deploy the `dist/` directory to your hosting service (Vercel, Netlify, etc.)

3. Ensure environment variables are set in your hosting platform

4. Configure custom domain if needed

---

For more information about the smart contracts, see the root [README.md](../README.md).
