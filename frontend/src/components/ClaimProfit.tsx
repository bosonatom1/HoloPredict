import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import { useHoloPredict } from '../hooks/useHoloPredict'
import { useWallet } from '../hooks/useWallet'
import { useFHE } from '../contexts/FHEContext'
import { useToast } from '../App'
import './ClaimProfit.css'

interface ClaimProfitProps {
  marketId: number
  onUpdate?: () => void
}

export function ClaimProfit({ marketId, onUpdate }: ClaimProfitProps) {
  const { claimProfit, canClaimProfit, getUserBetInfo, getMarketInfo, getEncryptedBets, makeUserBetsDecryptable, loading, error } = useHoloPredict()
  const { address } = useWallet()
  const { instance, isInitialized, publicDecrypt } = useFHE()
  const { showToast } = useToast()
  const [profit, setProfit] = useState<bigint | null>(null)
  const [canClaim, setCanClaim] = useState(false)
  const [betAmountsDecrypted, setBetAmountsDecrypted] = useState(false)
  const [userWon, setUserWon] = useState<boolean | null>(null)
  const [outcome, setOutcome] = useState<boolean | null>(null)
  const [isCheckingProfit, setIsCheckingProfit] = useState(false)
  const [userBetInfo, setUserBetInfo] = useState<any>(null)
  const [hasBet, setHasBet] = useState<boolean | null>(null)
  const [marketReady, setMarketReady] = useState(false)
  const [hasAttemptedAutoDecrypt, setHasAttemptedAutoDecrypt] = useState(false)

  // Decrypt locally for PNL calculation (private, not stored on-chain)
  const handleDecryptForPNL = async () => {
    if (!address || !isInitialized || !instance) {
      showToast('FHE not initialized', 'warning')
      return
    }
    
    setIsCheckingProfit(true)
    try {
      const marketInfo = await getMarketInfo(marketId)
      
      if (!marketInfo.outcomeDecrypted || !marketInfo.volumesDecrypted) {
        showToast('Market not ready. Please wait for the oracle to decrypt the market results first.', 'warning')
        setIsCheckingProfit(false)
        return
      }
      
      // Get encrypted bet handles
      const encryptedBets = await getEncryptedBets(marketId, address)
      const zeroHandle = '0x0000000000000000000000000000000000000000000000000000000000000000'
      
      // PRIVACY FIX: Both handles are now always initialized when a bet is placed
      // Check if BOTH handles are non-zero (meaning a bet was placed)
      const hasBet = encryptedBets.amountYesHandle && encryptedBets.amountYesHandle !== zeroHandle &&
                     encryptedBets.amountNoHandle && encryptedBets.amountNoHandle !== zeroHandle &&
                     encryptedBets.sideHandle && encryptedBets.sideHandle !== zeroHandle
      
      if (!hasBet) {
        showToast('No bet found. Please place a bet first.', 'warning')
        setIsCheckingProfit(false)
        return
      }
      
      // Build handles list (amounts + side) - all three handles are now always included
      const handles: string[] = [
        encryptedBets.amountYesHandle,
        encryptedBets.amountNoHandle,
        encryptedBets.sideHandle
      ]
      
      if (handles.length === 0) {
        showToast('No valid bet handles found', 'warning')
        return
      }
      
      // Step 1: Make handles decryptable (required by Zama SDK's publicDecrypt)
      // Note: This makes them decryptable, but only this user can decrypt via SDK
      // because they have FHE.allow() permission and will use their private key
      console.log('📡 Step 1: Making bet handles decryptable...')
      try {
        await makeUserBetsDecryptable(marketId)
        console.log('✅ Bet handles are now decryptable')
      } catch (err: any) {
        // If already decryptable, that's fine - continue
        if (!err.message?.includes('already') && !err.message?.includes('decryptable')) {
          throw err
        }
        console.log('ℹ️ Handles already decryptable')
      }
      
      // Step 2: Wait for coprocessors to process (30 seconds minimum)
      console.log('⏳ Waiting 30 seconds for Zama coprocessors to process...')
      showToast('Bet decryption requested. Waiting 30 seconds for coprocessors to process...', 'info')
      await new Promise(resolve => setTimeout(resolve, 30000))
      
      // Step 3: Decrypt locally using user's private key
      // The SDK's publicDecrypt uses the connected wallet's private key from window.ethereum
      console.log('🔓 Step 2: Decrypting bet amounts and side locally...')
      
      // Ensure we have a valid instance, address, and wallet connection
      if (!instance || !address) {
        throw new Error('FHE instance or wallet address not available. Please ensure your wallet is connected.')
      }
      
      // Verify wallet is connected
      if (!window.ethereum) {
        throw new Error('Wallet not connected. Please connect your wallet first.')
      }
      
      // The SDK's publicDecrypt will use the private key from the connected wallet
      // Pass address to help SDK identify the user (if SDK supports it)
      const result = await publicDecrypt(handles, address)
      
      // Parse decrypted values
      // PRIVACY FIX: All handles are always included, parse directly from result
      const amountYes = typeof result.clearValues[encryptedBets.amountYesHandle] === 'bigint' 
           ? result.clearValues[encryptedBets.amountYesHandle] 
        : BigInt(result.clearValues[encryptedBets.amountYesHandle].toString())
      const amountNo = typeof result.clearValues[encryptedBets.amountNoHandle] === 'bigint'
           ? result.clearValues[encryptedBets.amountNoHandle]
        : BigInt(result.clearValues[encryptedBets.amountNoHandle].toString())
      const side = result.clearValues[encryptedBets.sideHandle] === true || result.clearValues[encryptedBets.sideHandle] === 1n
      
      // Calculate profit locally
      const userBetAmount = side ? amountYes : amountNo
      const totalWinningVolume = BigInt(marketInfo.outcomeValue ? marketInfo.decryptedVolumeYes : marketInfo.decryptedVolumeNo)
      const totalLosingVolume = BigInt(marketInfo.outcomeValue ? marketInfo.decryptedVolumeNo : marketInfo.decryptedVolumeYes)
      
      const userWonBet = (marketInfo.outcomeValue && side) || (!marketInfo.outcomeValue && !side)
      
      let calculatedProfit = 0n
      if (userWonBet && userBetAmount > 0n && totalWinningVolume > 0n) {
        // User won: calculate profit
        const totalPool = totalWinningVolume + totalLosingVolume
        calculatedProfit = (userBetAmount * totalPool) / totalWinningVolume
      } else if (!userWonBet && userBetAmount > 0n) {
        // User lost: profit is negative (bet amount lost)
        calculatedProfit = 0n - userBetAmount
      }
      
      setProfit(calculatedProfit)
      setBetAmountsDecrypted(true)
      setUserWon((marketInfo.outcomeValue && side) || (!marketInfo.outcomeValue && !side))
      setOutcome(marketInfo.outcomeValue)
      
      // Store decrypted values for claim
      setUserBetInfo({
        decryptedAmountYes: amountYes,
        decryptedAmountNo: amountNo,
        decryptedSide: side,
        decryptionProof: result.decryptionProof
      })
      
      // Reset auto-decrypt flag since user manually decrypted
      setHasAttemptedAutoDecrypt(false)
      
      showToast('PNL calculated locally! Your bet amounts remain private.', 'success')
    } catch (err: any) {
      console.error('Decrypt failed:', err)
      showToast('Decryption failed: ' + (err.message || 'Unknown error'), 'error')
    } finally {
      setIsCheckingProfit(false)
    }
  }
  
  const checkProfit = async () => {
    if (!address) return
    
    try {
      // Check if user has placed a bet by checking encrypted bet handles
      // PRIVACY FIX: Both handles are now always initialized when a bet is placed
      let userHasBet = false
      try {
        const encryptedBets = await getEncryptedBets(marketId, address)
        const zeroHandle = '0x0000000000000000000000000000000000000000000000000000000000000000'
        // Check if BOTH handles are non-zero (meaning a bet was placed)
        userHasBet = encryptedBets.amountYesHandle && encryptedBets.amountYesHandle !== zeroHandle &&
                     encryptedBets.amountNoHandle && encryptedBets.amountNoHandle !== zeroHandle &&
                     encryptedBets.sideHandle && encryptedBets.sideHandle !== zeroHandle
      } catch (err) {
        console.log('Could not check encrypted bets')
      }
      
      const [betInfo, marketInfo] = await Promise.all([
        getUserBetInfo(marketId, address),
        getMarketInfo(marketId)
      ])
      
      setHasBet(userHasBet || betInfo.hasClaimed)
      
      // Check if market is ready
      const isReady = marketInfo.outcomeDecrypted && marketInfo.volumesDecrypted
      setMarketReady(isReady)
      
      setCanClaim(await canClaimProfit(marketId, address))
      
      if (marketInfo.outcomeDecrypted) {
        setOutcome(marketInfo.outcomeValue)
      }
      
      // If market is ready with a bet, try to auto-decrypt ONLY if:
      // 1. We haven't attempted auto-decrypt before
      // 2. User hasn't already decrypted manually
      // 3. Handles might already be decryptable (from previous session)
      if (isReady && userHasBet && isInitialized && instance && !hasAttemptedAutoDecrypt && !betAmountsDecrypted) {
        setHasAttemptedAutoDecrypt(true) // Mark as attempted to prevent retries
        // Auto-decrypt if handles are already decryptable (from previous makeUserBetsDecryptable call)
        try {
          const encryptedBets = await getEncryptedBets(marketId, address)
          const zeroHandle = '0x0000000000000000000000000000000000000000000000000000000000000000'
          // PRIVACY FIX: Both handles are now always initialized when a bet is placed
          // Always include all 3 handles (both amounts + side)
          const hasBet = encryptedBets.amountYesHandle && encryptedBets.amountYesHandle !== zeroHandle &&
                         encryptedBets.amountNoHandle && encryptedBets.amountNoHandle !== zeroHandle &&
                         encryptedBets.sideHandle && encryptedBets.sideHandle !== zeroHandle
          
          if (hasBet) {
            const handles: string[] = [
              encryptedBets.amountYesHandle,
              encryptedBets.amountNoHandle,
              encryptedBets.sideHandle
            ]
            // Try to decrypt (will work if handles are already decryptable from previous session)
            // Skip rate limit for auto-decrypt attempts (silent failures are expected)
            const result = await publicDecrypt(handles, address, true)
            
            // PRIVACY FIX: All handles are always included, parse directly from result
            const amountYes = typeof result.clearValues[encryptedBets.amountYesHandle] === 'bigint' 
                 ? result.clearValues[encryptedBets.amountYesHandle] 
              : BigInt(result.clearValues[encryptedBets.amountYesHandle].toString())
            const amountNo = typeof result.clearValues[encryptedBets.amountNoHandle] === 'bigint'
                 ? result.clearValues[encryptedBets.amountNoHandle]
              : BigInt(result.clearValues[encryptedBets.amountNoHandle].toString())
            const side = result.clearValues[encryptedBets.sideHandle] === true || result.clearValues[encryptedBets.sideHandle] === 1n
            
            // Calculate profit
            const userBetAmount = side ? amountYes : amountNo
            const totalWinningVolume = BigInt(marketInfo.outcomeValue ? marketInfo.decryptedVolumeYes : marketInfo.decryptedVolumeNo)
            const totalLosingVolume = BigInt(marketInfo.outcomeValue ? marketInfo.decryptedVolumeNo : marketInfo.decryptedVolumeYes)
            
            const userWonBet = (marketInfo.outcomeValue && side) || (!marketInfo.outcomeValue && !side)
            
            let calculatedProfit = 0n
            if (userWonBet && userBetAmount > 0n && totalWinningVolume > 0n) {
              // User won: calculate profit
              const totalPool = totalWinningVolume + totalLosingVolume
              calculatedProfit = (userBetAmount * totalPool) / totalWinningVolume
            } else if (!userWonBet && userBetAmount > 0n) {
              // User lost: profit is negative (bet amount lost)
              calculatedProfit = 0n - userBetAmount
            }
            
            setProfit(calculatedProfit)
            setBetAmountsDecrypted(true)
            setUserWon((marketInfo.outcomeValue && side) || (!marketInfo.outcomeValue && !side))
            
            setUserBetInfo({
              decryptedAmountYes: amountYes,
              decryptedAmountNo: amountNo,
              decryptedSide: side,
              decryptionProof: result.decryptionProof,
              hasClaimed: betInfo.hasClaimed
            })
          }
        } catch (decryptErr: any) {
          // Silently fail if handles are not decryptable yet (expected behavior)
          // Only log if it's not the "not allowed for public decryption" error
          const isNotDecryptableError = decryptErr.message?.includes('not allowed for public decryption') || 
                                       decryptErr.message?.includes('not allowed for decryption')
          if (!isNotDecryptableError) {
            console.log('Auto-decrypt not available:', decryptErr.message)
          }
          // Reset attempted flag so user can manually decrypt
          setHasAttemptedAutoDecrypt(false)
        }
      }
    } catch (err: any) {
      console.error('Error checking profit:', err)
      setCanClaim(false)
    }
  }

  const handleClaim = async () => {
    if (!userBetInfo?.decryptionProof) {
      showToast('Please decrypt your bet amounts first to calculate PNL', 'warning')
      return
    }
    
    try {
      await claimProfit(
        marketId,
        Number(userBetInfo.decryptedAmountYes),
        Number(userBetInfo.decryptedAmountNo),
        userBetInfo.decryptedSide,
        userBetInfo.decryptionProof
      )
      showToast('Profit claimed successfully!', 'success')
      setCanClaim(false)
      // Don't reset profit - keep it displayed
      // Update userBetInfo to mark as claimed
      setUserBetInfo((prev: any) => ({ ...prev, hasClaimed: true }))
      checkProfit() // Refresh profit info
      if (onUpdate) onUpdate() // Refresh parent component
    } catch (err: any) {
      // Check if user cancelled transaction
      if (err.message?.includes('user rejected') || err.code === 4001 || err.code === 'ACTION_REJECTED' || err.reason === 'rejected') {
        showToast('Transaction cancelled', 'info')
        return
      }
      
      console.error('Error claiming profit:', err)
      showToast('Claim failed: ' + (err.message || 'Unknown error'), 'error')
    }
  }

useEffect(() => {
    if (address) {
      // Reset auto-decrypt flag when market or user changes
      setHasAttemptedAutoDecrypt(false)
      checkProfit()
    }
  }, [marketId, address])


  return (
    <div className="claim-profit">
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        marginBottom: '0.75rem',
        paddingBottom: '0.5rem',
        borderBottom: '1px solid var(--border-light)'
      }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: '600' }}>💰 P/L</h3>
        </div>
        {profit !== null && betAmountsDecrypted && profit > 0n && (
          <span style={{
            padding: '0.25rem 0.5rem',
            background: 'rgba(16, 185, 129, 0.15)',
            color: 'var(--success-light)',
            borderRadius: '6px',
            fontSize: '0.6875rem',
            fontWeight: '600',
            border: '1px solid rgba(16, 185, 129, 0.25)'
          }}>
            Winner
          </span>
        )}
      </div>
      
      {/* Show decryption prompt only if user has a bet and amounts aren't decrypted yet */}
      {(!betAmountsDecrypted && hasBet === true) && (
        <div style={{
          padding: '1rem',
          background: marketReady 
            ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(139, 92, 246, 0.05))'
            : 'linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(245, 158, 11, 0.05))',
          border: marketReady 
            ? '1px solid rgba(139, 92, 246, 0.3)'
            : '1px solid rgba(245, 158, 11, 0.3)',
          borderRadius: '8px',
          textAlign: 'center',
          marginBottom: '0.75rem'
        }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{marketReady ? '🔒' : '⏳'}</div>
          <div style={{ fontSize: '0.8125rem', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
            {marketReady ? 'Reveal Your PNL' : 'Waiting for Oracle...'}
          </div>
          <div style={{ 
            fontSize: '0.75rem', 
            color: 'var(--text-muted)', 
            marginBottom: '0.75rem',
            lineHeight: '1.4'
          }}>
            {marketReady 
              ? 'Decrypt to see your profit/loss'
              : 'Oracle must decrypt results first'}
          </div>
          <button
            onClick={handleDecryptForPNL}
            disabled={!marketReady || loading || isCheckingProfit}
            style={{
              padding: '0.5rem 1.25rem',
              fontSize: '0.8125rem',
              fontWeight: '600',
              background: marketReady ? 'linear-gradient(135deg, var(--accent), rgba(139, 92, 246, 0.8))' : 'rgba(139, 92, 246, 0.3)',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: !marketReady || loading || isCheckingProfit ? 'not-allowed' : 'pointer',
              opacity: !marketReady || loading || isCheckingProfit ? 0.6 : 1,
              transition: 'all 0.2s',
              width: '100%'
            }}
          >
            {isCheckingProfit ? '⏳ Processing...' : marketReady ? '🔓 Reveal PNL' : '⏳ Wait'}
          </button>
        </div>
      )}
      
      {/* Show message if profit is null and no bet found */}
      {profit === null && !hasBet && !userBetInfo?.hasBet && (
        <div style={{
          padding: '0.75rem',
          background: 'rgba(139, 92, 246, 0.08)',
          border: '1px solid rgba(139, 92, 246, 0.2)',
          borderRadius: '6px',
          textAlign: 'center',
          fontSize: '0.75rem',
          color: 'var(--text-muted)'
        }}>
          💡 you haven't placed bet
        </div>
      )}
      
      {profit !== null && betAmountsDecrypted && userBetInfo && (
        <div className="profit-info" style={{ 
          padding: '0.625rem',
          background: profit > 0n 
            ? 'rgba(16, 185, 129, 0.08)'
            : userWon === false
            ? 'rgba(239, 68, 68, 0.08)'
            : 'var(--surface)',
          border: profit > 0n 
            ? '1px solid rgba(16, 185, 129, 0.2)'
            : userWon === false
            ? '1px solid rgba(239, 68, 68, 0.2)'
            : '1px solid var(--border-light)',
          borderRadius: '6px'
        }}>
          {/* Compact Bet Summary - Single Row */}
          {(userBetInfo.decryptedAmountYes > 0n || userBetInfo.decryptedAmountNo > 0n) && outcome !== null && (
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.375rem',
              paddingBottom: '0.375rem',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              fontSize: '0.6875rem'
        }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Bet:</span>
                <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                  {ethers.formatEther(
                    (userBetInfo.decryptedSide ? userBetInfo.decryptedAmountYes : userBetInfo.decryptedAmountNo) * BigInt(1e9)
                  )} ETH
                </span>
                <span style={{ 
                  color: userBetInfo.decryptedSide ? 'var(--success-light)' : 'var(--error-light)',
                  fontWeight: '600',
                  fontSize: '0.6875rem'
                }}>
                  {userBetInfo.decryptedSide ? 'YES' : 'NO'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Outcome:</span>
                <span style={{ fontWeight: '600', color: outcome ? 'var(--success-light)' : 'var(--error-light)', fontSize: '0.6875rem' }}>
                  {outcome ? 'YES' : 'NO'}
                </span>
                <span style={{ 
                  color: userWon ? 'var(--success-light)' : userWon === false ? 'var(--error-light)' : 'var(--text-muted)', 
                  fontWeight: '600',
                  fontSize: '0.6875rem'
                }}>
                  {userWon ? '✓' : userWon === false ? '✗' : '—'}
                </span>
              </div>
            </div>
          )}

          {/* Compact Profit Display */}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.625rem', color: 'var(--text-muted)', marginBottom: '0.125rem', textTransform: 'uppercase', fontWeight: '600', letterSpacing: '0.05em' }}>
              {userBetInfo?.hasClaimed ? 'Claimed' : 'Net P/L'}
            </div>
            <div style={{ 
              fontSize: profit > 0n ? '1rem' : '0.875rem', 
              fontWeight: '700', 
              color: profit > 0n ? 'var(--success-light)' : profit < 0n ? 'var(--error-light)' : 'var(--text-muted)',
              marginBottom: '0.125rem',
              lineHeight: '1.2'
            }}>
              {profit > 0n ? '+' : ''}{ethers.formatEther((profit < 0n ? -profit : profit) * BigInt(1e9))} ETH
            </div>
          </div>
          
          {profit > 0n && canClaim && (
            <button 
              onClick={handleClaim} 
              disabled={loading} 
              className="claim-button" 
              style={{
                width: '100%',
                padding: '0.4375rem',
                fontSize: '0.75rem',
                fontWeight: '600',
                marginTop: '0.375rem',
                background: 'linear-gradient(135deg, var(--success-light), rgba(16, 185, 129, 0.8))',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: loading ? 'not-allowed' : 'pointer',
                boxShadow: '0 2px 4px rgba(16, 185, 129, 0.25)',
                transition: 'transform 0.2s'
              }}
            >
              {loading ? '⏳ Claiming...' : '💰 Claim'}
            </button>
          )}
          
          {profit > 0n && !canClaim && betAmountsDecrypted && !userBetInfo?.hasClaimed && (
            <div style={{
              padding: '0.25rem',
              background: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: '4px',
              marginTop: '0.375rem',
              fontSize: '0.625rem',
              textAlign: 'center',
              color: 'var(--warning-light)',
              fontWeight: '500'
            }}>
              ⚠️ Cannot claim yet
            </div>
          )}
          
          {betAmountsDecrypted && userBetInfo?.hasClaimed && (
            <div style={{
              padding: '0.25rem',
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: '4px',
              marginTop: '0.375rem',
              fontSize: '0.625rem',
              textAlign: 'center',
              color: 'var(--success-light)',
              fontWeight: '500'
            }}>
              ✅ Claimed
            </div>
          )}
          
        </div>
      )}
      
      {error && <div className="error">{error}</div>}
    </div>
  )
}
