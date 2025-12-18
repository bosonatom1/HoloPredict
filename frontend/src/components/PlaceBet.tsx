import { useState } from 'react'
import { useHoloPredict } from '../hooks/useHoloPredict'
import { useFHE } from '../contexts/FHEContext'
import { useWallet } from '../hooks/useWallet'
import { useToast } from '../App'
import { parseEther } from 'ethers'
import { CONTRACT_ADDRESSES, NETWORK_CONFIG } from '../config/contracts'
import './PlaceBet.css'

interface PlaceBetProps {
  marketId: number
  bettingEnded?: boolean
}

export function PlaceBet({ marketId, bettingEnded = false }: PlaceBetProps) {
  // This component should ONLY render when market status is 0 (OPEN)
  const { placeBet, loading, error } = useHoloPredict()
  const { encryptAmount, encryptOutcome, instance, isInitialized } = useFHE()
  const { address, ensureCorrectNetwork } = useWallet()
  const { showToast } = useToast()
  const [amount, setAmount] = useState('')
  const [side, setSide] = useState<'yes' | 'no'>('yes')
  const [isPlacing, setIsPlacing] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validate input
    if (!amount || parseFloat(amount) <= 0) {
      showToast('Please enter a valid amount greater than 0', 'warning')
      return
    }
    
    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum <= 0) {
      showToast('Please enter a valid number', 'warning')
      return
    }
    
    // Minimum bet amount (0.0001 ETH)
    if (amountNum < 0.0001) {
      showToast('Minimum bet amount is 0.0001 ETH', 'warning')
      return
    }
    
    if (!address) {
      showToast('Wallet not connected. Please connect your wallet first.', 'warning')
      return
    }

    if (!isInitialized || !instance) {
      showToast('FHE encryption is not ready. Please wait for initialization to complete.', 'warning')
      return
    }
    
    // Check network
    const isCorrectNetwork = await ensureCorrectNetwork(NETWORK_CONFIG.sepolia.chainId)
    if (!isCorrectNetwork) {
      return // User cancelled or switch failed
    }
    
    
    setIsPlacing(true)
    try {
      const amountWei = parseEther(amount)
      
      // euint32 max = 4,294,967,295
      // We encrypt the amount in "gwei" units (1 gwei = 10^9 wei)
      // This allows bets up to ~4.2 ETH while fitting in uint32
      const amountInGwei = Math.floor(Number(amountWei) / 1_000_000_000)
      
      if (amountInGwei > 4_294_967_295 || amountInGwei < 0) {
        throw new Error('Bet amount too large. Maximum bet is ~4.2 ETH')
      }
      
      if (amountInGwei === 0) {
        throw new Error('Bet amount too small. Minimum bet is 0.0001 ETH')
      }
      
      // Encrypt the amount in gwei and the side
      const contractAddress = CONTRACT_ADDRESSES.sepolia
      const encryptedAmount = await encryptAmount(amountInGwei, contractAddress, address)
      const encryptedSide = await encryptOutcome(side === 'yes', contractAddress, address)
      
      // Extract handles
      const amountHandle = encryptedAmount.handles[0]
      const sideHandle = encryptedSide.handles[0]
      const amountProof = encryptedAmount.inputProof || '0x'
      const sideProof = encryptedSide.inputProof || '0x'
      
      if (!amountHandle || amountHandle === '0x') {
        throw new Error('Failed to encrypt bet amount. Please try again.')
      }
      if (!sideHandle || sideHandle === '0x') {
        throw new Error('Failed to encrypt bet side. Please try again.')
      }
      
      await placeBet(marketId, amountHandle, sideHandle, amountProof, sideProof, amountWei)
      
      setAmount('')
      showToast('Bet placed successfully! Your bet is now encrypted on-chain.', 'success')
      
      // Component will refresh naturally through parent component updates
    } catch (err: any) {
      // Check if user cancelled transaction
      if (err.message?.includes('user rejected') || err.code === 4001 || err.code === 'ACTION_REJECTED' || err.reason === 'rejected') {
        showToast('Transaction cancelled', 'info')
        return
      }
      
      console.error('Error placing bet:', err)
      
      // Check if betting period ended during transaction
      // The contract reverts with: "HoloPredict: Betting period ended"
      const errorString = JSON.stringify(err).toLowerCase()
      const bettingPeriodEnded = 
        err.message?.toLowerCase().includes('betting period ended') ||
        err.reason?.toLowerCase().includes('betting period ended') ||
        errorString.includes('betting period ended') ||
        (err.receipt?.status === 0 && err.code === 'CALL_EXCEPTION' && !err.message?.includes('insufficient'))
      
      // User-friendly error messages
      let errorMessage = 'Failed to place bet'
      
      if (bettingPeriodEnded) {
        errorMessage = '⏰ A little too late! The betting period ended while your transaction was being processed.'
        showToast(errorMessage, 'warning')
        return
      } else if (err.message?.includes('insufficient funds') || err.message?.includes('insufficient balance')) {
        errorMessage = 'Insufficient balance. Please add more ETH to your wallet.'
      } else if (err.message?.includes('network') || err.message?.includes('chain')) {
        errorMessage = 'Network error. Please ensure you are on Sepolia network.'
      } else if (err.message?.includes('FHE') || err.message?.includes('encrypt')) {
        errorMessage = 'Encryption error. Please refresh the page and try again.'
      } else if (err.message) {
        errorMessage = err.message
      }
      
      showToast(errorMessage, 'error')
    } finally {
      setIsPlacing(false)
    }
  }

  if (bettingEnded) {
    return (
      <div className="place-bet">
        <h3>Place Bet</h3>
        <div style={{
          padding: '1.5rem',
          background: 'rgba(245, 158, 11, 0.1)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <div style={{
            fontSize: '2rem',
            marginBottom: '0.75rem'
          }}>⏰</div>
          <div style={{
            fontSize: '1rem',
            fontWeight: '600',
            color: 'var(--warning-light)',
            marginBottom: '0.5rem'
          }}>
            Betting Period Ended
          </div>
          <div style={{
            fontSize: '0.875rem',
            color: 'var(--text-secondary)',
            lineHeight: '1.6'
          }}>
            The betting period has ended. Please wait for the oracle to close the market and resolve the outcome.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="place-bet">
      <h3>Place Bet</h3>
      <form onSubmit={handleSubmit} className="bet-form">
        <div className="form-group">
          <label>Bet Side</label>
          <div className="side-buttons">
            <button
              type="button"
              className={side === 'yes' ? 'active' : ''}
              onClick={() => setSide('yes')}
            >
              YES
            </button>
            <button
              type="button"
              className={side === 'no' ? 'active' : ''}
              onClick={() => setSide('no')}
            >
              NO
            </button>
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="amount">Amount (ETH)</label>
          <input
            id="amount"
            type="number"
            step="0.0001"
            min="0.0001"
            max="4.2"
            value={amount}
            onChange={(e) => {
              const val = e.target.value
              // Only allow valid numbers
              if (val === '' || /^\d*\.?\d*$/.test(val)) {
                setAmount(val)
              }
            }}
            required
            placeholder="0.1"
            disabled={isPlacing || loading}
          />
          <div className="amount-presets">
            <button
              type="button"
              className="preset-btn"
              onClick={() => setAmount('0.001')}
              disabled={isPlacing || loading}
            >
              0.001 ETH
            </button>
            <button
              type="button"
              className="preset-btn"
              onClick={() => setAmount('0.01')}
              disabled={isPlacing || loading}
            >
              0.01 ETH
            </button>
            <button
              type="button"
              className="preset-btn"
              onClick={() => setAmount('0.1')}
              disabled={isPlacing || loading}
            >
              0.1 ETH
            </button>
            </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Min: 0.0001 ETH | Max: 4.2 ETH
          </div>
        </div>
        {error && <div className="error">{error}</div>}
        <button 
          type="submit" 
          disabled={isPlacing || loading || !isInitialized}
          title={!isInitialized ? 'FHE encryption initializing...' : ''}
        >
          {isPlacing || loading ? '⏳ Placing Bet...' : 'Place Bet'}
        </button>
      </form>
    </div>
  )
}
