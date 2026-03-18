import { useState } from 'react'

/**
 * Displays a deck of flashcards with a CSS 3D flip animation.
 *
 * The aria-label on the card container reflects the currently "visible" side
 * so screen readers announce the right content. Tests use this attribute
 * to assert flip state without relying on CSS visibility.
 *
 * Production note: replace the inline CSS transform with Framer Motion for
 * smoother cross-browser animation and declarative spring physics.
 */
export default function FlashcardViewer({ flashcards }) {
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)

  const total = flashcards.length
  const card = flashcards[index]

  function handlePrev() {
    setFlipped(false)
    setIndex((i) => Math.max(0, i - 1))
  }

  function handleNext() {
    setFlipped(false)
    setIndex((i) => Math.min(total - 1, i + 1))
  }

  function handleFlip() {
    setFlipped((f) => !f)
  }

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Progress counter */}
      <p className="text-sm text-gray-500 dark:text-gray-400 font-medium" data-testid="flashcard-progress">
        {index + 1} / {total}
      </p>

      {/* Card — click to flip */}
      <div
        className="w-full max-w-lg cursor-pointer select-none"
        style={{ perspective: '1000px' }}
        onClick={handleFlip}
        data-testid="flashcard"
        aria-label={flipped ? card.answer : card.question}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && handleFlip()}
      >
        <div
          className="relative w-full transition-transform duration-500"
          style={{
            transformStyle: 'preserve-3d',
            transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
            minHeight: '200px',
          }}
        >
          {/* Front face — question */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center p-8 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-sm"
            style={{ backfaceVisibility: 'hidden' }}
          >
            <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">Question</p>
            <p className="text-gray-900 dark:text-white text-center font-medium leading-relaxed">{card.question}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-6">Click to reveal answer</p>
          </div>

          {/* Back face — answer */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center p-8 bg-indigo-50 dark:bg-indigo-950 border border-indigo-100 dark:border-indigo-900 rounded-2xl shadow-sm"
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          >
            <p className="text-xs text-indigo-400 dark:text-indigo-400 uppercase tracking-wide mb-3">Answer</p>
            <p className="text-gray-900 dark:text-white text-center font-medium leading-relaxed">{card.answer}</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center gap-4">
        <button
          onClick={handlePrev}
          disabled={index === 0}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          data-testid="flashcard-prev"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          Previous
        </button>

        <button
          onClick={handleNext}
          disabled={index === total - 1}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          data-testid="flashcard-next"
        >
          Next
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>
    </div>
  )
}
