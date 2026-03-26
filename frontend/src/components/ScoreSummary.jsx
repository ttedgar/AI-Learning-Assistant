/**
 * Score summary screen shown after all quiz questions have been answered.
 *
 * Receives the pre-computed score and total from QuizViewer — score
 * calculation is the caller's responsibility so this component stays pure.
 */
export default function ScoreSummary({ score, total, onRestart }) {
  const percentage = Math.round((score / total) * 100)

  const feedback =
    percentage >= 80 ? 'Excellent work!' : percentage >= 60 ? 'Good job!' : 'Keep practising!'

  const ringColor =
    percentage >= 80 ? 'text-green-600' : percentage >= 60 ? 'text-yellow-500' : 'text-red-500'

  return (
    <div className="flex flex-col items-center py-12 gap-6" data-testid="score-summary">
      {/* Score ring */}
      <div className="h-28 w-28 rounded-full bg-gray-50 dark:bg-gray-800 border-4 border-gray-100 dark:border-gray-700 flex items-center justify-center">
        <span className={`text-3xl font-bold ${ringColor}`} data-testid="score-percentage">
          {percentage}%
        </span>
      </div>

      {/* Feedback */}
      <div className="text-center">
        <p className="text-xl font-semibold text-gray-900 dark:text-white">{feedback}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1" data-testid="score-detail">
          You got <span className="font-medium text-gray-700 dark:text-gray-200">{score}</span> out of{' '}
          <span className="font-medium text-gray-700 dark:text-gray-200">{total}</span> questions correct.
        </p>
      </div>

      {/* Restart */}
      <button
        onClick={onRestart}
        className="flex items-center gap-2 px-6 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        data-testid="restart-quiz-button"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
        </svg>
        Try again
      </button>
    </div>
  )
}
