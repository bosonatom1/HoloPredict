import { useState } from 'react'
import './FAQ.css'

interface FAQItem {
  question: string
  answer: string
}

const faqData: FAQItem[] = [
  {
    question: "What is HoloPredict?",
    answer: "HoloPredict is a privacy-preserving prediction market platform that uses Fully Homomorphic Encryption (FHE) to keep your bet amounts and sides private until you choose to reveal them."
  },
  {
    question: "How does encryption work?",
    answer: "Your bets are encrypted on-chain using FHE technology. Even though the data is stored on the blockchain, no one can see your bet amount or side until you decrypt it locally using your private key."
  },
  {
    question: "Can others see my bets?",
    answer: "No! Your bet amounts and sides are fully encrypted. Only you can decrypt your own bets using your wallet's private key. Even the oracle cannot see individual bet amounts before decryption."
  },
  {
    question: "How do I place a bet?",
    answer: "1. Connect your MetaMask wallet. 2. Browse available markets. 3. Select a market and choose YES or NO. 4. Enter your bet amount. 5. Confirm the transaction. Your bet is encrypted and stored on-chain."
  },
  {
    question: "When can I see my bet details?",
    answer: "You can see that you placed a bet immediately, but to see the exact amount and side, you need to decrypt it. This requires calling makeUserBetsDecryptable() and waiting for the coprocessors to process (about 30 seconds)."
  },
  {
    question: "How do I claim profits?",
    answer: "After a market is resolved and you've won: 1. Go to the resolved market. 2. Decrypt your bet to calculate profit. 3. Click 'Claim Profit' to receive your winnings. You'll need to decrypt your bet amounts first to verify your winning bet."
  },
  {
    question: "What network does this use?",
    answer: "HoloPredict currently runs on Sepolia testnet. Make sure your MetaMask wallet is connected to Sepolia network to interact with the platform."
  },
  {
    question: "Is my wallet safe?",
    answer: "Yes! We never access your private keys. All encryption and decryption happens locally in your browser using your wallet's private key, which never leaves your device. The platform only uses public wallet addresses."
  }
]

export function FAQ() {
  const [isOpen, setIsOpen] = useState(false)
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index)
  }

  return (
    <div className="faq-container">
      <button 
        className="faq-toggle-btn"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Toggle FAQ"
      >
        <span>❓ FAQ</span>
      </button>
      
      {isOpen && (
        <div className="faq-dropdown">
          <div className="faq-header">
            <h3>Frequently Asked Questions</h3>
            <button 
              className="faq-close-btn"
              onClick={() => setIsOpen(false)}
              aria-label="Close FAQ"
            >
              ✕
            </button>
          </div>
          <div className="faq-list">
            {faqData.map((item, index) => (
              <div key={index} className="faq-item">
                <button
                  className="faq-question"
                  onClick={() => toggleFAQ(index)}
                  aria-expanded={openIndex === index}
                >
                  <span>{item.question}</span>
                  <span className="faq-arrow">{openIndex === index ? '▲' : '▼'}</span>
                </button>
                {openIndex === index && (
                  <div className="faq-answer">
                    <p>{item.answer}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

