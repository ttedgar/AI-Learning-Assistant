import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
  const queryClient = useQueryClient()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(doc.title)

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/api/v1/documents/${doc.id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['documents'] }),
  })

  const renameMutation = useMutation({
    mutationFn: (title) => api.patch(`/api/v1/documents/${doc.id}`, { title }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] })
      setRenaming(false)
    },
  })

  function submitRename() {
    const trimmed = renameValue.trim()
    if (!trimmed || trimmed === doc.title) {
      setRenaming(false)
      setRenameValue(doc.title)
      return
    }
    renameMutation.mutate(trimmed)
  }

  const createdAt = new Date(doc.createdAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 hover:shadow-md transition-shadow">
      {/* Card header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="h-9 w-9 flex-shrink-0 rounded-lg bg-red-50 dark:bg-red-950 flex items-center justify-center">
            <svg className="h-5 w-5 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            {renaming ? (
              <div className="flex items-center gap-1 w-full">
                <input
                  autoFocus
                  className="flex-1 min-w-0 text-sm font-medium text-gray-900 dark:text-white bg-transparent border border-indigo-400 rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitRename()
                    if (e.key === 'Escape') { setRenaming(false); setRenameValue(doc.title) }
                  }}
                />
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={submitRename}
                  className="p-1 rounded text-green-600 hover:bg-green-50 dark:hover:bg-green-950 transition-colors"
                  title="Save"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                </button>
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { setRenaming(false); setRenameValue(doc.title) }}
                  className="p-1 rounded text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  title="Cancel"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ) : (
              <p className="font-medium text-gray-900 dark:text-white text-sm truncate">{doc.title}</p>
            )}
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{createdAt}</p>
          </div>
        </div>
        <StatusBadge status={doc.status} />
      </div>

      {/* Card footer — actions */}
      <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
        {confirmDelete ? (
          /* Inline delete confirmation — no modal needed for a single destructive action */
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-600 dark:text-gray-400 flex-1">Delete this document?</span>
            <button
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              className="text-xs font-medium text-white bg-red-500 hover:bg-red-600 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white px-3 py-1.5 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {doc.status === 'DONE' && (
              <Link
                to={`/documents/${doc.id}`}
                className="flex-1 text-center text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 hover:bg-indigo-100 dark:hover:bg-indigo-900 px-3 py-1.5 rounded-lg transition-colors"
              >
                View results
              </Link>
            )}
            {doc.status === 'FAILED' && (
              <p className="text-xs text-red-500 flex-1">Processing failed. Please try re-uploading.</p>
            )}
            {(doc.status === 'PENDING' || doc.status === 'IN_PROGRESS') && (
              <span className="flex-1" />
            )}

            {/* Rename */}
            <button
              onClick={() => { setRenaming(true); setRenameValue(doc.title) }}
              title="Rename"
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
              </svg>
            </button>

            {/* Delete */}
            <button
              onClick={() => setConfirmDelete(true)}
              title="Delete"
              className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { data: documents = [], isLoading, isError } = useDocuments()

  const hasActive = documents.some((d) => ACTIVE_STATUSES.has(d.status))

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-8 py-8 min-h-full flex flex-col">
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

      <footer className="mt-auto pt-8 border-t border-gray-100 dark:border-gray-800 text-center text-xs text-gray-400 dark:text-gray-600 pb-6">
        <nav className="flex items-center justify-center gap-5">
          <Link to="/how-to-use" className="hover:text-gray-600 dark:hover:text-gray-400 transition-colors">
            How to Use
          </Link>
          <span>·</span>
          <Link to="/technical" className="hover:text-gray-600 dark:hover:text-gray-400 transition-colors">
            Technical Information
          </Link>
          <span>·</span>
          <Link to="/architecture" className="hover:text-gray-600 dark:hover:text-gray-400 transition-colors">
            Architecture
          </Link>
          <span>·</span>
          <Link to="/load-test" className="hover:text-gray-600 dark:hover:text-gray-400 transition-colors">
            Load Test Results
          </Link>
        </nav>
      </footer>
    </AppLayout>
  )
}
