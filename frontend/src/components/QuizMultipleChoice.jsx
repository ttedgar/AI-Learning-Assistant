import { useState } from 'react'

/**
 * Renders a single multiple-choice quiz question.
 *
 * After the user clicks an option:
 * - The correct answer turns green.
 * - A wrong selection turns red.
 * - All options are locked (no further changes allowed).
 * - onAnswer is called once with a boolean indicating correctness.
 *
 * Production note: for accessibility add role="radiogroup" / role="radio"
 * so keyboard users can navigate with arrow keys.
 */
export default function QuizMultipleChoice({ question, questionNumber, onAnswer }) {
  const [selected, setSelected] = useState(null)

  function handleSelect(option) {
    if (selected !== null) return // locked after first answer
    setSelected(option)
    onAnswer(option === question.correctAnswer)
  }

  function optionStyle(option) {
    if (selected === null) {
      return 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950 cursor-pointer'
    }
    if (option === question.correctAnswer) return 'bg-green-50 dark:bg-green-950 border-green-400 dark:border-green-600'
    if (option === selected) return 'bg-red-50 dark:bg-red-950 border-red-400 dark:border-red-600'
    return 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 opacity-50'
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-gray-900 dark:text-white">
        <span className="text-gray-400 mr-2">{questionNumber}.</span>
        {question.question}
      </p>

      <div className="space-y-2">
        {question.options.map((option) => (
          <button
            key={option}
            onClick={() => handleSelect(option)}
            className={`w-full text-left px-4 py-3 text-sm text-gray-900 dark:text-gray-100 rounded-lg border transition-colors ${optionStyle(option)}`}
            data-testid={`option-${option}`}
          >
            {option}
          </button>
        ))}
      </div>

      {selected !== null && (
        <p
          className={`text-xs font-medium ${
            selected === question.correctAnswer ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
          }`}
          data-testid="quiz-feedback"
        >
          {selected === question.correctAnswer
            ? '✓ Correct!'
            : `✗ Correct answer: ${question.correctAnswer}`}
        </p>
      )}
    </div>
  )
}
