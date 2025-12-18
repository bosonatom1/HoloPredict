import { useState, useEffect } from 'react'
import { useHoloPredict } from '../hooks/useHoloPredict'
import { useWallet } from '../hooks/useWallet'
import { useToast } from '../App'
import { NETWORK_CONFIG } from '../config/contracts'
import { Category, CATEGORIES, CATEGORY_ICONS, formatQuestionWithCategory, detectCategory } from '../utils/categories'
import './CreateMarket.css'

interface CreateMarketProps {
  onSuccess?: () => void
  onBack?: () => void
}

export function CreateMarket({ onSuccess, onBack }: CreateMarketProps) {
  const { createMarket, loading, error } = useHoloPredict()
  const { ensureCorrectNetwork } = useWallet()
  const { showToast } = useToast()
  const [question, setQuestion] = useState('')
  const [category, setCategory] = useState<Category | null>(null)
  const [endTime, setEndTime] = useState('')
  const [resolutionTime, setResolutionTime] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  // Auto-detect category when question changes
  useEffect(() => {
    if (question.trim() && !category) {
      const detected = detectCategory(question)
      if (detected !== 'Other') {
        setCategory(detected)
      }
    }
  }, [question, category])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validate question
    if (!question.trim()) {
      showToast('Please enter a market question', 'warning')
      return
    }
    
    if (question.trim().length < 10) {
      showToast('Market question must be at least 10 characters long', 'warning')
      return
    }
    
    if (question.trim().length > 200) {
      showToast('Market question must be less than 200 characters', 'warning')
      return
    }
    
    // Validate dates
    if (!endTime || !resolutionTime) {
      showToast('Please select both end time and resolution time', 'warning')
      return
    }
    
    const now = Math.floor(Date.now() / 1000)
      const endTimestamp = Math.floor(new Date(endTime).getTime() / 1000)
      const resolutionTimestamp = Math.floor(new Date(resolutionTime).getTime() / 1000)
      
    // Validate dates are in the future
    if (endTimestamp <= now) {
      showToast('Betting end time must be in the future', 'warning')
      return
    }
    
    if (resolutionTimestamp <= now) {
      showToast('Resolution time must be in the future', 'warning')
      return
    }
    
    // Validate resolution is after end time
      if (resolutionTimestamp <= endTimestamp) {
      showToast('Resolution time must be after betting end time', 'warning')
        return
      }
      
    // Check network
    const isCorrectNetwork = await ensureCorrectNetwork(NETWORK_CONFIG.sepolia.chainId)
    if (!isCorrectNetwork) {
      return // User cancelled or switch failed
    }
    
    setIsCreating(true)
    try {
      // Format question with category prefix
      const formattedQuestion = formatQuestionWithCategory(question.trim(), category)
      await createMarket(formattedQuestion, endTimestamp, resolutionTimestamp)
      showToast('Market created successfully!', 'success')
      
      // Reset form but stay on create market page
      setQuestion('')
      setCategory(null)
      setEndTime('')
      setResolutionTime('')
      
      // Don't call onSuccess - stay on create market page
      // User can manually navigate back or create another market
    } catch (err: any) {
      // Check if user cancelled transaction
      if (err.message?.includes('user rejected') || err.code === 4001 || err.code === 'ACTION_REJECTED' || err.reason === 'rejected') {
        showToast('Transaction cancelled', 'info')
        return
      }
      
      console.error('Error creating market:', err)
      
      // User-friendly error messages
      let errorMessage = 'Failed to create market'
      
      if (err.message?.includes('insufficient funds') || err.message?.includes('insufficient balance')) {
        errorMessage = 'Insufficient balance. Please add more ETH to your wallet.'
      } else if (err.message?.includes('network') || err.message?.includes('chain')) {
        errorMessage = 'Network error. Please ensure you are on Sepolia network.'
      } else if (err.message?.includes('unauthorized') || err.message?.includes('onlyOracle')) {
        errorMessage = 'Only oracle or owner can create markets.'
      } else if (err.message) {
        errorMessage = err.message
      }
      
      showToast(errorMessage, 'error')
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="create-market">
      <button onClick={onBack || onSuccess} className="back-btn">
        ← Back to Markets
      </button>
      <h2>Create New Market</h2>
      <form onSubmit={handleSubmit} className="market-form">
        <div className="form-group">
          <label htmlFor="question">Market Question</label>
          <input
            id="question"
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            required
            placeholder="e.g., Will Bitcoin reach $100k?"
            maxLength={200}
            disabled={isCreating || loading}
          />
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            {question.length}/200 characters
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="category">Category (Optional)</label>
          <select
            id="category"
            value={category || ''}
            onChange={(e) => setCategory(e.target.value ? (e.target.value as Category) : null)}
            disabled={isCreating || loading}
            className="category-select"
          >
            <option value="">Auto-detect or None</option>
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_ICONS[cat]} {cat}
              </option>
            ))}
          </select>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Category helps users find your market. Auto-detected from keywords if left empty.
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="endTime">Betting End Time</label>
          <input
            id="endTime"
            type="datetime-local"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            required
            min={new Date(Date.now() + 60000).toISOString().slice(0, 16)} // At least 1 minute in future
            disabled={isCreating || loading}
          />
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            When betting closes (must be in the future)
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="resolutionTime">Resolution Time</label>
          <input
            id="resolutionTime"
            type="datetime-local"
            value={resolutionTime}
            onChange={(e) => setResolutionTime(e.target.value)}
            required
            min={endTime || new Date(Date.now() + 60000).toISOString().slice(0, 16)} // At least 1 minute in future if endTime not set
            disabled={isCreating || loading || !endTime}
          />
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            When oracle should resolve (must be after betting ends)
          </div>
        </div>
        {error && <div className="error">{error}</div>}
        <button 
          type="submit" 
          className="submit-btn" 
          disabled={isCreating || loading || !endTime || !resolutionTime}
        >
          {isCreating || loading ? '⏳ Creating Market...' : 'Create Market'}
        </button>
      </form>
    </div>
  )
}
