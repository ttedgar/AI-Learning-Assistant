import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQueries } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import api from '../lib/axios'
import AppLayout from '../components/AppLayout'
import StatusBadge from '../components/StatusBadge'
import FlashcardViewer from '../components/FlashcardViewer'
import QuizViewer from '../components/QuizViewer'

const TABS = ['Summary', 'Flashcards', 'Quiz', 'Original']

/**
 * Fetches all document data in parallel using TanStack Query's useQueries.
 * Four independent requests fire simultaneously — document metadata, summary,
 * flashcards, and quiz — minimising total page load time.
 *
 * Production note: add a staleTime and gcTime tuned to document update
 * frequency. Since AI processing finishes once, results are effectively
 * immutable after status=DONE — a long staleTime (e.g. 5 min) would be safe.
 */
function useDocumentData(id) {
  return useQueries({
    queries: [
      {
        queryKey: ['document', id],
        queryFn: () => api.get(`/api/v1/documents/${id}`).then((r) => r.data),
      },
      {
        queryKey: ['document', id, 'summary'],
        queryFn: () => api.get(`/api/v1/documents/${id}/summary`).then((r) => r.data),
      },
      {
        queryKey: ['document', id, 'flashcards'],
        queryFn: () => api.get(`/api/v1/documents/${id}/flashcards`).then((r) => r.data),
      },
      {
        queryKey: ['document', id, 'quiz'],
        queryFn: () => api.get(`/api/v1/documents/${id}/quiz`).then((r) => r.data),
      },
    ],
  })
}

// ── Shared skeleton primitive ───────────────────────────────────────────────

function Skeleton({ className }) {
  return <div className={`animate-pulse bg-gray-200 dark:bg-gray-700 rounded ${className}`} />
}

// ── Tab: Summary ─────────────────────────────────────────────────────────────

function SummaryTab({ data, isLoading, isError }) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(8)].map((_, i) => (
          <Skeleton key={i} className={`h-4 ${i % 3 === 2 ? 'w-3/4' : 'w-full'}`} />
        ))}
      </div>
    )
  }

  if (isError) {
    return <p className="text-sm text-red-500">Failed to load summary.</p>
  }

  if (!data?.content) {
    return <p className="text-sm text-gray-500">No summary available yet.</p>
  }

  return (
    /*
     * react-markdown renders AI-generated markdown (headings, lists, bold text).
     * Tailwind's prose utilities are not used here — they require the Typography
     * plugin (@tailwindcss/typography). Instead, utility classes are applied
     * directly via the 'components' prop.
     *
     * Production note: install @tailwindcss/typography and replace these inline
     * component overrides with a single `className="prose prose-sm max-w-none"`.
     */
    <ReactMarkdown
      components={{
        h1: ({ children }) => <h1 className="text-lg font-semibold text-gray-900 dark:text-white mt-6 mb-2">{children}</h1>,
        h2: ({ children }) => <h2 className="text-base font-semibold text-gray-900 dark:text-white mt-5 mb-1.5">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-semibold text-gray-900 dark:text-white mt-4 mb-1">{children}</h3>,
        p: ({ children }) => <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-3">{children}</p>,
        ul: ({ children }) => <ul className="list-disc list-inside space-y-1 mb-3 text-sm text-gray-700 dark:text-gray-300">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal list-inside space-y-1 mb-3 text-sm text-gray-700 dark:text-gray-300">{children}</ol>,
        li: ({ children }) => <li className="text-sm text-gray-700 dark:text-gray-300">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold text-gray-900 dark:text-white">{children}</strong>,
        em: ({ children }) => <em className="italic text-gray-700 dark:text-gray-300">{children}</em>,
        blockquote: ({ children }) => (
          <blockquote className="border-l-4 border-indigo-200 dark:border-indigo-700 pl-4 italic text-gray-500 dark:text-gray-400 my-3">
            {children}
          </blockquote>
        ),
      }}
    >
      {data.content}
    </ReactMarkdown>
  )
}

// ── Tab: Flashcards ───────────────────────────────────────────────────────────

function FlashcardsTab({ data, isLoading, isError }) {
  if (isLoading) {
    return (
      <div className="flex justify-center">
        <div className="w-full max-w-lg h-52 animate-pulse bg-gray-200 dark:bg-gray-700 rounded-2xl" />
      </div>
    )
  }

  if (isError) {
    return <p className="text-sm text-red-500">Failed to load flashcards.</p>
  }

  const flashcards = data ?? []

  if (flashcards.length === 0) {
    return <p className="text-sm text-gray-500">No flashcards available yet.</p>
  }

  return <FlashcardViewer flashcards={flashcards} />
}

// ── Tab: Quiz ─────────────────────────────────────────────────────────────────

function QuizTab({ data, isLoading, isError }) {
  if (isLoading) {
    return (
      <div className="space-y-6">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-3/4" />
            {[...Array(4)].map((_, j) => (
              <Skeleton key={j} className="h-10 w-full" />
            ))}
          </div>
        ))}
      </div>
    )
  }

  if (isError) {
    return <p className="text-sm text-red-500">Failed to load quiz.</p>
  }

  const questions = data ?? []

  if (questions.length === 0) {
    return <p className="text-sm text-gray-500">No quiz questions available yet.</p>
  }

  return <QuizViewer questions={questions} />
}

// ── Tab: Original ─────────────────────────────────────────────────────────────

function OriginalTab({ fileUrl, isLoading }) {
  if (isLoading) {
    return (
      <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-8 text-center animate-pulse">
        <Skeleton className="h-12 w-12 mx-auto mb-4 rounded-full" />
        <Skeleton className="h-4 w-1/2 mx-auto mb-6" />
        <Skeleton className="h-9 w-32 mx-auto rounded-lg" />
      </div>
    )
  }

  if (!fileUrl) {
    return <p className="text-sm text-gray-500">Original file not available.</p>
  }

  return (
    /*
     * Production note: replace the download link with an embedded PDF viewer
     * using react-pdf (PDF.js wrapper) for inline viewing without leaving the
     * app. The download link is a universally accessible fallback.
     */
    <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-8 text-center">
      <div className="h-14 w-14 mx-auto mb-4 rounded-xl bg-red-50 dark:bg-red-950 flex items-center justify-center">
        <svg className="h-7 w-7 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        </svg>
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
        Open or download the original PDF document.
      </p>
      <a
        href={fileUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 bg-indigo-600 text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-indigo-700 transition-colors"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M8.25 6.75l3.75-3.75 3.75 3.75M12 3v13.5" />
        </svg>
        Open PDF
      </a>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DocumentPage() {
  const { id } = useParams()
  const [activeTab, setActiveTab] = useState('Summary')

  const [documentQuery, summaryQuery, flashcardsQuery, quizQuery] = useDocumentData(id)

  const doc = documentQuery.data

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-8 py-8">
        {/* Back button */}
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors mb-6"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
          Back to dashboard
        </Link>

        {/* Document header */}
        <div className="mb-6">
          {documentQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          ) : documentQuery.isError ? (
            <p className="text-sm text-red-500">Failed to load document.</p>
          ) : (
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{doc?.title}</h1>
              {doc?.status && <StatusBadge status={doc.status} />}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
          <nav className="flex gap-1" role="tablist">
            {TABS.map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={activeTab === tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  activeTab === tab
                    ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                {tab}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab content */}
        <div role="tabpanel">
          {activeTab === 'Summary' && (
            <SummaryTab
              data={summaryQuery.data}
              isLoading={summaryQuery.isLoading}
              isError={summaryQuery.isError}
            />
          )}

          {activeTab === 'Flashcards' && (
            <FlashcardsTab
              data={flashcardsQuery.data}
              isLoading={flashcardsQuery.isLoading}
              isError={flashcardsQuery.isError}
            />
          )}

          {activeTab === 'Quiz' && (
            <QuizTab
              data={quizQuery.data}
              isLoading={quizQuery.isLoading}
              isError={quizQuery.isError}
            />
          )}

          {activeTab === 'Original' && (
            <OriginalTab
              fileUrl={doc?.fileUrl}
              isLoading={documentQuery.isLoading}
            />
          )}
        </div>
      </div>
    </AppLayout>
  )
}
