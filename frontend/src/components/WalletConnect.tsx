import { useWallet } from '../hooks/useWallet'
import { NETWORK_CONFIG } from '../config/contracts'
import './WalletConnect.css'

export function WalletConnect() {
  const { address, isConnected, connect, disconnect, isMetaMaskInstalled, chainId, switchNetwork } = useWallet()
  const targetChainId = NETWORK_CONFIG.sepolia.chainId

  if (!isMetaMaskInstalled) {
    return (
      <div className="wallet-connect">
        <a
          href="https://metamask.io/download/"
          target="_blank"
          rel="noopener noreferrer"
          className="install-metamask-btn"
        >
          Install MetaMask
        </a>
      </div>
    )
  }

  if (isConnected && address) {
    const isWrongNetwork = chainId !== targetChainId

    if (isWrongNetwork) {
      return (
        <div className="wallet-connect">
          <div className="wallet-info">
            <div className="wallet-address">
              <span className="address-text warning">
                Wrong Network
              </span>
            </div>
            <button onClick={() => switchNetwork(targetChainId)} className="switch-network-btn">
              Switch to Sepolia
            </button>
          </div>
        </div>
      )
    }

    return (
      <div className="wallet-connect">
        <div className="wallet-info">
          <div className="wallet-address">
            <span className="address-text">
              {address.slice(0, 6)}...{address.slice(-4)}
            </span>
          </div>
          <button onClick={disconnect} className="disconnect-btn">
            Disconnect
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="wallet-connect">
      <button onClick={connect} className="connect-btn">
        <span>Connect MetaMask</span>
      </button>
    </div>
  )
}
