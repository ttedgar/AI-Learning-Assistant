import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../lib/axios'
import AppLayout from '../components/AppLayout'
import StatusBadge from '../components/StatusBadge'

const ACTIVE_STATUSES = new Set(['PENDING', 'IN_PROGRESS'])

/**
 * Fetches the authenticated user's documents from the backend.
 * Polls every 3 seconds while any document is in an active processing state
 * (PENDING or IN_PROGRESS) so the user sees live status updates without
 * manually refreshing.
 *
 * Production note: replace polling with WebSockets or SSE for lower latency
 * and reduced server load at scale.
 */
function useDocuments() {
  return useQuery({
    queryKey: ['documents'],
    queryFn: () => api.get('/api/v1/documents').then((r) => r.data),
    refetchInterval: (query) => {
      const docs = query.state.data ?? []
      return docs.some((d) => ACTIVE_STATUSES.has(d.status)) ? 3_000 : false
    },
  })
}

function EmptyState() {
  return (
    <div className="text-center py-24">
      <div className="mx-auto h-12 w-12 rounded-xl bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center mb-4">
        <svg className="h-6 w-6 text-indigo-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m6.75 12H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        </svg>
      </div>
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">No documents yet</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Upload a PDF to get started.</p>
      <Link
        to="/upload"
        className="inline-flex items-center gap-2 bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
        </svg>
        Upload your first PDF
      </Link>
    </div>
  )
}

function DocumentCard({ doc }) {
  const createdAt = new Date(doc.createdAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-9 w-9 flex-shrink-0 rounded-lg bg-red-50 dark:bg-red-950 flex items-center justify-center">
            <svg className="h-5 w-5 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="font-medium text-gray-900 dark:text-white text-sm truncate">{doc.title}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{createdAt}</p>
          </div>
        </div>
        <StatusBadge status={doc.status} />
      </div>

      {doc.status === 'DONE' && (
        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 flex gap-2">
          <Link
            to={`/documents/${doc.id}`}
            className="flex-1 text-center text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 hover:bg-indigo-100 dark:hover:bg-indigo-900 px-3 py-1.5 rounded-lg transition-colors"
          >
            View results
          </Link>
        </div>
      )}

      {doc.status === 'FAILED' && (
        <p className="mt-3 text-xs text-red-500">
          Processing failed. Please try uploading again.
        </p>
      )}
    </div>
  )
}

export default function DashboardPage() {
  const { data: documents = [], isLoading, isError } = useDocuments()

  const hasActive = documents.some((d) => ACTIVE_STATUSES.has(d.status))

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Your documents</h1>
            {hasActive && (
              <p className="text-xs text-blue-600 mt-1 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                Processing — auto-refreshing every 3 seconds
              </p>
            )}
          </div>
          <Link
            to="/upload"
            className="inline-flex items-center gap-2 bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Upload
          </Link>
        </div>

        {/* Content */}
        {isLoading && (
          <div className="grid gap-4 sm:grid-cols-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 animate-pulse">
                <div className="flex gap-3">
                  <div className="h-9 w-9 rounded-lg bg-gray-100 dark:bg-gray-700" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded w-3/4" />
                    <div className="h-2.5 bg-gray-100 dark:bg-gray-700 rounded w-1/4" />
                  </div>
                  <div className="h-5 w-20 bg-gray-100 dark:bg-gray-700 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        )}

        {isError && (
          <div className="text-center py-12 text-sm text-red-500">
            Failed to load documents. Please refresh.
          </div>
        )}

        {!isLoading && !isError && documents.length === 0 && <EmptyState />}

        {!isLoading && !isError && documents.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {documents.map((doc) => (
              <DocumentCard key={doc.id} doc={doc} />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
