import InfoPageLayout from '../components/InfoPageLayout'

export default function HowToUsePage() {
  return (
    <InfoPageLayout title="How to Use">
      <div className="prose prose-gray dark:prose-invert max-w-none">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">How to Use</h1>
        <p className="text-gray-500 dark:text-gray-400 text-lg mb-12">
          From PDF to flashcards in under a minute.
        </p>

        <div className="space-y-12">
          {/* Step 1 */}
          <div className="flex gap-6">
            <div className="flex-shrink-0 h-10 w-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">
              1
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mt-0 mb-2">Sign in with Google</h2>
              <p className="text-gray-600 dark:text-gray-400 mt-0">
                Click <strong className="text-gray-900 dark:text-white">Continue with Google</strong> on the home page.
                Authentication is handled entirely by Supabase — no password is stored, and your Google account
                credentials never reach this application's servers.
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex gap-6">
            <div className="flex-shrink-0 h-10 w-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">
              2
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mt-0 mb-2">Upload a PDF</h2>
              <p className="text-gray-600 dark:text-gray-400 mt-0">
                Navigate to <strong className="text-gray-900 dark:text-white">Upload</strong> in the sidebar.
                Drag and drop a PDF file onto the dropzone, or click to open the file browser. Only PDF files
                are accepted. Once selected, click <strong className="text-gray-900 dark:text-white">Upload Document</strong>.
              </p>
              <div className="mt-3 p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-amber-800 dark:text-amber-300">
                <strong>Rate limit:</strong> Up to 10 uploads per hour per account. This is enforced server-side
                and resets on a rolling window.
              </div>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex gap-6">
            <div className="flex-shrink-0 h-10 w-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">
              3
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mt-0 mb-2">Wait for processing</h2>
              <p className="text-gray-600 dark:text-gray-400 mt-0">
                After upload you'll be redirected to the Dashboard. Your document will appear with a
                <span className="inline-flex items-center gap-1 mx-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300">Processing</span>
                badge. The page polls every 3 seconds — it will automatically update when your document is ready.
              </p>
              <p className="text-gray-600 dark:text-gray-400">
                Processing typically takes 15–60 seconds depending on document length. Long documents (over
                ~50,000 characters of extracted text) are automatically chunked and processed in parallel before
                being merged into a single coherent output.
              </p>
            </div>
          </div>

          {/* Step 4 */}
          <div className="flex gap-6">
            <div className="flex-shrink-0 h-10 w-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">
              4
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mt-0 mb-2">Read, study, and quiz yourself</h2>
              <p className="text-gray-600 dark:text-gray-400 mt-0">
                Click any document to open it. You'll find three tabs:
              </p>
              <ul className="mt-3 space-y-3 list-none pl-0">
                <li className="flex gap-3">
                  <span className="font-semibold text-gray-900 dark:text-white min-w-[90px]">Summary</span>
                  <span className="text-gray-600 dark:text-gray-400">
                    A structured, AI-generated markdown summary of the document's key points, concepts, and takeaways.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="font-semibold text-gray-900 dark:text-white min-w-[90px]">Flashcards</span>
                  <span className="text-gray-600 dark:text-gray-400">
                    Click a card to flip it and reveal the answer. Use the arrows to navigate between cards.
                    Great for spaced repetition review.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="font-semibold text-gray-900 dark:text-white min-w-[90px]">Quiz</span>
                  <span className="text-gray-600 dark:text-gray-400">
                    Multiple-choice questions drawn from the document. Select an answer to see whether you're
                    correct and review your score at the end.
                  </span>
                </li>
              </ul>
            </div>
          </div>

          {/* Tips */}
          <div className="border-t border-gray-100 dark:border-gray-800 pt-10">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Tips for best results</h2>
            <ul className="space-y-2 text-gray-600 dark:text-gray-400">
              <li className="flex gap-2">
                <span className="text-indigo-500 font-bold">→</span>
                Use PDFs with real text (not scanned images). The text extraction stage uses Apache PDFBox,
                which can't OCR image-only PDFs.
              </li>
              <li className="flex gap-2">
                <span className="text-indigo-500 font-bold">→</span>
                The AI performs best on educational material: lecture slides, textbook chapters, research papers,
                technical documentation.
              </li>
              <li className="flex gap-2">
                <span className="text-indigo-500 font-bold">→</span>
                If a document shows <span className="text-red-500 dark:text-red-400 font-medium">Failed</span>,
                the most common cause is a PDF that couldn't be parsed or a LLM API timeout on a very large
                document. Try splitting it into smaller sections.
              </li>
              <li className="flex gap-2">
                <span className="text-indigo-500 font-bold">→</span>
                Your documents are stored privately — no other user can see or access them.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </InfoPageLayout>
  )
}
