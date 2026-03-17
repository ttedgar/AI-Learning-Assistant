import { useState } from 'react'

/**
 * Renders a single open-ended quiz question.
 *
 * The user types their answer and clicks Submit. The correct answer is then
 * revealed but not auto-graded — open-ended answers have too many valid
 * phrasings to auto-score reliably (the DB schema reflects this: only
 * MULTIPLE_CHOICE is stored, but this component exists for forward
 * compatibility and UI completeness).
 *
 * Production note: use an LLM-as-judge approach to grade semantic similarity
 * between the user's answer and the correct answer instead of exact matching.
 */
export default function QuizOpenEnded({ question, questionNumber, onAnswer }) {
  const [input, setInput] = useState('')
  const [submitted, setSubmitted] = useState(false)

  function handleSubmit(e) {
    e.preventDefault()
    if (!input.trim()) return
    setSubmitted(true)
    onAnswer(input.trim())
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-gray-900">
        <span className="text-gray-400 mr-2">{questionNumber}.</span>
        {question.question}
      </p>

      {!submitted ? (
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your answer…"
            className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
            data-testid="open-ended-input"
          />
          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
            data-testid="open-ended-submit"
          >
            Submit
          </button>
        </form>
      ) : (
        <div className="space-y-2" data-testid="open-ended-result">
          <p className="text-sm text-gray-600">
            Your answer: <span className="font-medium">{input}</span>
          </p>
          <div className="flex items-start gap-2 bg-green-50 border border-green-100 rounded-lg px-4 py-3">
            <svg className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            <p className="text-sm text-green-700">
              <span className="font-medium">Correct answer:</span> {question.correctAnswer}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
