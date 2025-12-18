import { useState } from 'react'
import { ethers } from 'ethers'
import { useHoloPredict } from '../hooks/useHoloPredict'
import { useFHE } from '../contexts/FHEContext'
import { useWallet } from '../hooks/useWallet'
import { useToast } from '../App'
import { CONTRACT_ADDRESSES } from '../config/contracts'
import './OraclePanel.css'

interface OraclePanelProps {
  marketId: number
  onUpdate: () => void
  marketStatus: number
  resolutionTime?: bigint
  outcomeDecrypted?: boolean
  volumesDecrypted?: boolean
  hasDecryptedVolumes?: boolean // true if volumes are decrypted via SDK (not yet on-chain)
}

export function OraclePanel({ marketId, onUpdate, marketStatus, resolutionTime, outcomeDecrypted = false, volumesDecrypted = false, hasDecryptedVolumes = false }: OraclePanelProps) {
  const { 
    setOutcome, 
    closeMarket, 
    requestOutcomeDecryption,
    requestVolumeDecryption,
    getMarketInfo,
    getEncryptedOutcome,
    getEncryptedVolumes,
    verifyAndSetDecryptedOutcome,
    verifyAndSetDecryptedVolumes,
    loading, 
    error 
  } = useHoloPredict()
  const { encryptOutcome, isInitialized, instance, publicDecrypt } = useFHE()
  const { address } = useWallet()
  const { showToast } = useToast()
  const [outcome, setOutcomeValue] = useState<'yes' | 'no'>('yes')
  const [isSetting, setIsSetting] = useState(false)
  const [isDecrypting, setIsDecrypting] = useState(false)

  const handleSetOutcome = async () => {
    if (!isInitialized || !instance) {
      showToast('FHE encryption not ready. Please wait and try again.', 'warning')
      return
    }
    
    if (!address) {
      showToast('Wallet not connected', 'warning')
      return
    }
    
    setIsSetting(true)
    try {
      const outcomeValue = outcome === 'yes'
      const contractAddress = CONTRACT_ADDRESSES.sepolia
      const encrypted = await encryptOutcome(outcomeValue, contractAddress, address)
      
      const encryptedHandle = encrypted.handles[0]
      const inputProof = encrypted.inputProof || '0x'
      
      await setOutcome(marketId, encryptedHandle, inputProof)
      
      showToast('Outcome set successfully! Outcome encrypted on-chain.', 'success')
      onUpdate()
    } catch (err: any) {
      // Check if user cancelled transaction
      if (err.message?.includes('user rejected') || err.code === 4001 || err.code === 'ACTION_REJECTED' || err.reason === 'rejected') {
        showToast('Transaction cancelled', 'info')
        return
      }
      
      console.error('Error setting outcome:', err instanceof Error ? err.message : err)
      let errorMsg = err.message || 'Failed to set outcome'
      if (errorMsg.includes('Resolution time not reached')) {
        errorMsg = `Resolution time not reached. You can set the outcome after: ${resolutionTime ? new Date(Number(resolutionTime) * 1000).toLocaleString() : 'N/A'}`
      }
      showToast(errorMsg, 'error')
    } finally {
      setIsSetting(false)
    }
  }

  const handleCloseMarket = async () => {
    try {
      await closeMarket(marketId)
      showToast('Market closed successfully!', 'success')
      onUpdate()
    } catch (err: any) {
      // Check if user cancelled transaction
      if (err.message?.includes('user rejected') || err.code === 4001 || err.code === 'ACTION_REJECTED') {
        showToast('Transaction cancelled', 'info')
        return
      }
      
      console.error('Error closing market:', err instanceof Error ? err.message : err)
      showToast(err.message || 'Failed to close market', 'error')
    }
  }

  const handleRequestDecryption = async () => {
    if (!address) {
      showToast('Wallet not connected', 'warning')
      return
    }
    
    if (!isInitialized) {
      showToast('FHE not initialized. Please wait.', 'warning')
      return
    }
    
    setIsDecrypting(true)
    
    try {
      console.log('🔐 Oracle: Starting decryption flow...')
      
      // Check current market state
      const marketInfo = await getMarketInfo(marketId)
      
      if (marketInfo.outcomeDecrypted && marketInfo.volumesDecrypted) {
        showToast('Already decrypted on-chain!', 'success')
        onUpdate()
        setIsDecrypting(false)
        return
      }
      
      let decryptedOutcome: boolean | null = null
      let volumeYesEth = '0'
      let volumeNoEth = '0'
      
      // ============================================
      // OUTCOME DECRYPTION FLOW
      // ============================================
      if (!marketInfo.outcomeDecrypted) {
        console.log('📡 Step 1: Making outcome handle publicly decryptable...')
        await requestOutcomeDecryption(marketId)
        console.log('✅ Outcome handle is now publicly decryptable')
        
        // Wait for coprocessors to process (minimum 30 seconds due to rate limits)
        console.log('⏳ Waiting 30 seconds for Zama coprocessors to process...')
        showToast('Outcome decryption requested. Waiting 30 seconds for coprocessors to process...', 'info')
        await new Promise(resolve => setTimeout(resolve, 30000))
        
        // Get the outcome handle
        console.log('📊 Fetching outcome handle from contract...')
        const outcome = await getEncryptedOutcome(marketId)
        console.log('Outcome Handle:', outcome.outcomeHandle)
        
        const zeroHandle = '0x0000000000000000000000000000000000000000000000000000000000000000'
        if (!outcome.outcomeHandle || outcome.outcomeHandle === zeroHandle) {
          console.warn('⚠️ Outcome handle is zero - outcome may not be set yet')
          showToast('Outcome handle is zero. Make sure you have set the outcome first using "Set Outcome" button.', 'warning')
        } else {
          // Decrypt the outcome via SDK (gets plaintext value)
          console.log('🔓 Decrypting outcome via Zama SDK...')
          const outcomeResult = await publicDecrypt([outcome.outcomeHandle])
          console.log('✅ Outcome decrypted successfully!')
          
          // Parse the decrypted value
          const outcomeRaw = outcomeResult.clearValues[outcome.outcomeHandle]
          decryptedOutcome = outcomeRaw === 1n || outcomeRaw === true || outcomeRaw === 1 || outcomeRaw === '1'
          console.log('Decrypted outcome value:', decryptedOutcome ? 'YES' : 'NO')
          
          // Save decrypted outcome on-chain with proof
          console.log('💾 Verifying and saving outcome on-chain...')
          await verifyAndSetDecryptedOutcome(marketId, decryptedOutcome, outcomeResult.decryptionProof)
          console.log('✅ Outcome saved on-chain!')
        }
      } else {
        console.log('ℹ️ Outcome already decrypted, skipping...')
        decryptedOutcome = marketInfo.outcomeValue
      }
      
      // ============================================
      // VOLUME DECRYPTION FLOW
      // ============================================
      if (!marketInfo.volumesDecrypted) {
        console.log('📡 Step 2: Making volume handles publicly decryptable...')
        await requestVolumeDecryption(marketId)
        console.log('✅ Volume handles are now publicly decryptable')
        
        // Wait for coprocessors (minimum 30 seconds due to rate limits)
        console.log('⏳ Waiting 30 seconds for Zama coprocessors to process...')
        showToast('Volume decryption requested. Waiting 30 seconds for coprocessors to process...', 'info')
        await new Promise(resolve => setTimeout(resolve, 30000))
        
        // Get volume handles
        console.log('📊 Fetching volume handles from contract...')
        const volumes = await getEncryptedVolumes(marketId)
        console.log('Volume Handles:', {
          yes: volumes.volumeYesHandle,
          no: volumes.volumeNoHandle
        })
        
        const zeroHandle = '0x0000000000000000000000000000000000000000000000000000000000000000'
        if (!volumes.volumeYesHandle || !volumes.volumeNoHandle || 
            volumes.volumeYesHandle === zeroHandle || volumes.volumeNoHandle === zeroHandle) {
          console.warn('⚠️ Volume handles are zero - no bets placed yet')
          showToast('Volume handles are zero. No bets have been placed on this market yet.', 'warning')
        } else {
          // Decrypt volumes via SDK (gets plaintext values)
          console.log('🔓 Decrypting volumes via Zama SDK...')
          const volumeResult = await publicDecrypt([volumes.volumeYesHandle, volumes.volumeNoHandle])
          console.log('✅ Volumes decrypted successfully!')
          
          // Parse decrypted values
          const volumeYesRaw = volumeResult.clearValues[volumes.volumeYesHandle]
          const volumeNoRaw = volumeResult.clearValues[volumes.volumeNoHandle]
          
          const volumeYesBig = typeof volumeYesRaw === 'bigint' ? volumeYesRaw : BigInt(volumeYesRaw.toString())
          const volumeNoBig = typeof volumeNoRaw === 'bigint' ? volumeNoRaw : BigInt(volumeNoRaw.toString())
          
          // Values are in gwei - convert for display
          const volumeYesWei = volumeYesBig * BigInt(1e9)
          const volumeNoWei = volumeNoBig * BigInt(1e9)
          volumeYesEth = ethers.formatEther(volumeYesWei)
          volumeNoEth = ethers.formatEther(volumeNoWei)
          
          console.log('Decrypted volumes:', {
            yesGwei: volumeYesBig.toString(),
            noGwei: volumeNoBig.toString(),
            yesETH: volumeYesEth,
            noETH: volumeNoEth
          })
          
          // Save decrypted volumes on-chain with proof
          console.log('💾 Verifying and saving volumes on-chain...')
          await verifyAndSetDecryptedVolumes(marketId, volumeYesBig, volumeNoBig, volumeResult.decryptionProof)
          console.log('✅ Volumes saved on-chain!')
        }
      } else {
        console.log('ℹ️ Volumes already decrypted, skipping...')
      }
      
      // Build success message
      let successMsg = '✅ Success!\n\n'
      if (decryptedOutcome !== null) {
        successMsg += `Outcome: ${decryptedOutcome ? 'YES' : 'NO'} Won\n`
      }
      if (volumeYesEth !== '0' || volumeNoEth !== '0') {
        successMsg += `Total YES: ${volumeYesEth} ETH\n`
        successMsg += `Total NO: ${volumeNoEth} ETH\n`
      }
      
      showToast(successMsg, 'success')
      onUpdate()
    } catch (err: any) {
      const errorMsg = err.message || ''
      
      // Check if user cancelled transaction (check first to avoid logging)
      if (errorMsg.includes('user rejected') || err.code === 4001 || err.code === 'ACTION_REJECTED' || err.reason === 'rejected') {
        showToast('Transaction cancelled', 'info')
        setIsDecrypting(false)
        return
      }
      
      // Check if rate limit error
      if (errorMsg.includes('rate limit') || errorMsg.includes('429') || errorMsg.includes('Too Many Requests')) {
        showToast('Rate limit exceeded. Please wait at least 30 seconds before trying again.', 'warning')
        setIsDecrypting(false)
        return
      }
      
      // Check if error is because already decrypted
      if (errorMsg.includes('already decrypted') || 
          errorMsg.includes('Outcome already') || 
          errorMsg.includes('Volumes already') ||
          errorMsg.includes('HoloPredict: Outcome already') ||
          errorMsg.includes('HoloPredict: Volumes already')) {
        showToast('Already decrypted! This market has already been decrypted on-chain.', 'success')
        onUpdate()
        setIsDecrypting(false)
        return
      }
      
      console.error('❌ Request failed:', err)
      showToast('Request failed: ' + errorMsg, 'error')
    } finally {
      setIsDecrypting(false)
    }
  }

  // Market status: 0=Open, 1=Closed, 2=Resolved, 3=Cancelled
  const isOpen = marketStatus === 0
  const isClosed = marketStatus === 1
  const isResolved = marketStatus === 2
  const currentTime = Math.floor(Date.now() / 1000)
  const canSetOutcome = isClosed && resolutionTime ? currentTime >= Number(resolutionTime) : false

  return (
    <div className="oracle-panel">
      <h3>🔮 Oracle Controls</h3>
      
      {/* Show current status */}
      <div style={{
        padding: '1rem',
        background: isResolved ? 'rgba(6, 182, 212, 0.1)' : isClosed ? 'rgba(245, 158, 11, 0.1)' : 'rgba(16, 185, 129, 0.1)',
        border: `1px solid ${isResolved ? 'rgba(6, 182, 212, 0.3)' : isClosed ? 'rgba(245, 158, 11, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
        borderRadius: '8px',
        marginBottom: '1.5rem',
        fontSize: '0.875rem',
        fontWeight: '600',
        textAlign: 'center'
      }}>
        Status: {isOpen ? '🟢 OPEN' : isClosed ? '🟡 CLOSED' : '🔵 RESOLVED'}
      </div>

      <div className="oracle-actions">
        {/* Only show Set Outcome if market is Closed (not yet Resolved) */}
        {isClosed && (
          <div className="action-group">
            <label>Set Outcome</label>
            <div className="outcome-buttons">
              <button
                type="button"
                className={outcome === 'yes' ? 'active' : ''}
                onClick={() => setOutcomeValue('yes')}
              >
                ✓ YES
              </button>
              <button
                type="button"
                className={outcome === 'no' ? 'active' : ''}
                onClick={() => setOutcomeValue('no')}
              >
                ✗ NO
              </button>
            </div>
            <div style={{ 
              fontSize: '0.8125rem', 
              color: 'var(--text-muted)', 
              textAlign: 'center',
              marginTop: '0.5rem'
            }}>
              Selected: <strong style={{ color: outcome === 'yes' ? 'var(--success-light)' : 'var(--error-light)' }}>
                {outcome === 'yes' ? 'YES' : 'NO'}
              </strong>
            </div>
            {!isInitialized && (
              <div className="warning">⏳ FHE encryption initializing...</div>
            )}
            {!canSetOutcome && resolutionTime && (
              <div className="warning" style={{ marginBottom: '0.5rem' }}>
                ⏳ Resolution time not reached. Can set outcome after {new Date(Number(resolutionTime) * 1000).toLocaleString()}
              </div>
            )}
            <button 
              onClick={handleSetOutcome} 
              disabled={isSetting || loading || !isInitialized || !canSetOutcome}
              className="set-outcome-btn"
            >
              {isSetting ? 'Setting...' : `Set Outcome: ${outcome === 'yes' ? 'YES' : 'NO'}`}
            </button>
          </div>
        )}

        {isResolved && (
          <div style={{
            padding: '1rem',
            background: 'rgba(6, 182, 212, 0.1)',
            border: '1px solid rgba(6, 182, 212, 0.3)',
            borderRadius: '8px',
            marginBottom: '1rem',
            fontSize: '0.875rem',
            color: 'var(--accent-light)',
            textAlign: 'center'
          }}>
            ✅ Outcome already set! Market is resolved.
          </div>
        )}

        {/* Only show Close Market if market is Open */}
        {isOpen && (
          <div className="action-group">
            <label>Market Control</label>
            <button 
              onClick={handleCloseMarket} 
              disabled={loading}
              className="close-market-btn"
            >
              Close Market
            </button>
          </div>
        )}

        {/* Show success message after oracle decrypts BOTH outcome AND volumes */}
        {isResolved && outcomeDecrypted && (volumesDecrypted || hasDecryptedVolumes) && (
          <div style={{
            padding: '1.5rem',
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(16, 185, 129, 0.05))',
            border: '2px solid rgba(16, 185, 129, 0.4)',
            borderRadius: '12px',
            marginBottom: '1.5rem',
            fontSize: '0.9375rem',
            color: 'var(--success-light)',
            textAlign: 'center',
            fontWeight: '600'
          }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>✅</div>
            <div style={{ marginBottom: '0.5rem' }}>Market results are now available!</div>
            <div style={{ fontSize: '0.8125rem', opacity: 0.9, marginTop: '0.75rem', color: 'var(--text-muted)' }}>
              After oracle decrypts results, users can now check their profits and claim winnings.<br/>
              <strong style={{ color: 'var(--text-primary)' }}>Note:</strong> Users decrypt their bet amounts locally (privately) to calculate PNL and claim profits.
            </div>
          </div>
        )}

        {/* Show Decrypt button when market is Resolved AND either outcome or volumes not yet decrypted */}
        {isResolved && (!outcomeDecrypted || (!volumesDecrypted && !hasDecryptedVolumes)) && (
          <div className="action-group">
            <label>🔓 Decrypt Market Results</label>
            <button 
              onClick={handleRequestDecryption} 
              disabled={loading || isDecrypting}
              className="decrypt-btn"
              title="Decrypt outcome and volumes (takes 10-60 seconds)"
            >
              {isDecrypting ? '⏳ Decrypting...' : '🔓 Decrypt Market Results'}
            </button>
            <div style={{
              fontSize: '0.8125rem',
              color: 'var(--text-muted)',
              marginTop: '0.75rem',
              lineHeight: '1.5'
            }}>
              {!outcomeDecrypted && !volumesDecrypted && '💡 Reveals outcome and total volumes. Takes 10-60 seconds to process.'}
              {!outcomeDecrypted && volumesDecrypted && '⚠️ Outcome not yet decrypted! Click to decrypt outcome.'}
              {outcomeDecrypted && !volumesDecrypted && '⚠️ Volumes not yet decrypted! Click to decrypt volumes.'}
            </div>
          </div>
        )}

        {/* Help text based on status */}
        {isOpen && (
          <div style={{
            padding: '1rem',
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: '8px',
            fontSize: '0.875rem',
            color: 'var(--success-light)',
            textAlign: 'center'
          }}>
            💡 Market is open for betting. Close it when betting period ends.
          </div>
        )}

        {isClosed && !isResolved && (
          <div style={{
            padding: '1rem',
            background: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: '8px',
            fontSize: '0.875rem',
            color: 'var(--warning-light)',
            textAlign: 'center'
          }}>
            💡 Market is closed. Set the outcome (YES or NO) above.
          </div>
        )}
      </div>
      {error && <div className="error">{error}</div>}
    </div>
  )
}