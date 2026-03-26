import { useState } from 'react'
import QuizMultipleChoice from './QuizMultipleChoice'
import QuizOpenEnded from './QuizOpenEnded'
import ScoreSummary from './ScoreSummary'

/**
 * Orchestrates a full quiz session.
 *
 * Renders all questions at once so users can answer them in any order,
 * tracks the running score, and displays ScoreSummary once every question
 * has been answered.
 *
 * Score is calculated only for MULTIPLE_CHOICE questions (which are
 * auto-gradeable). Open-ended questions count as answered when submitted
 * but do not contribute to the score — consistent with the DB schema note
 * that only MULTIPLE_CHOICE is stored.
 *
 * Production note: persist answers to localStorage so a page refresh
 * doesn't lose in-progress quiz state.
 */
export default function QuizViewer({ questions }) {
  // answers[index] = true (correct) | false (wrong/open-ended)
  const [answers, setAnswers] = useState({})
  const [showScore, setShowScore] = useState(false)

  const total = questions.length
  const answeredCount = Object.keys(answers).length
  const score = Object.values(answers).filter(Boolean).length
  const allAnswered = answeredCount === total

  function handleAnswer(index, wasCorrect) {
    setAnswers((prev) => {
      if (index in prev) return prev // already answered — immutable
      return { ...prev, [index]: wasCorrect }
    })
  }

  function handleRestart() {
    setAnswers({})
    setShowScore(false)
  }

  if (showScore) {
    return <ScoreSummary score={score} total={total} onRestart={handleRestart} />
  }

  return (
    <div className="space-y-8">
      {questions.map((q, i) =>
        q.type === 'MULTIPLE_CHOICE' ? (
          <QuizMultipleChoice
            key={i}
            question={q}
            questionNumber={i + 1}
            onAnswer={(wasCorrect) => handleAnswer(i, wasCorrect)}
          />
        ) : (
          <QuizOpenEnded
            key={i}
            question={q}
            questionNumber={i + 1}
            onAnswer={() => handleAnswer(i, false)}
          />
        ),
      )}

      {/* Show "View Score" button only once all questions are answered */}
      {allAnswered && (
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700 flex justify-center">
          <button
            onClick={() => setShowScore(true)}
            className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
            data-testid="view-score-button"
          >
            View score
          </button>
        </div>
      )}
    </div>
  )
}
