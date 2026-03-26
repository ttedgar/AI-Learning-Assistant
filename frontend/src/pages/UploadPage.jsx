import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/axios'
import AppLayout from '../components/AppLayout'

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024 // 50 MB
const ACCEPTED_MIME = 'application/pdf'

/**
 * Validates a candidate file against type and size constraints.
 * Returns a human-readable error string, or null if valid.
 */
function validateFile(file) {
  if (file.type !== ACCEPTED_MIME) {
    return 'Only PDF files are accepted. Please select a .pdf file.'
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return 'File must be smaller than 50 MB.'
  }
  return null
}

/**
 * Upload page with HTML5 drag-and-drop and file input fallback.
 *
 * Validation happens client-side before any network call to give instant
 * feedback. The actual upload posts a multipart/form-data request to the
 * backend which handles Supabase Storage upload and queue publishing.
 *
 * Production note: add resumable upload support (TUS protocol) for files
 * over ~10 MB to handle unreliable mobile connections gracefully.
 */
export default function UploadPage() {
  const [file, setFile] = useState(null)
  const [validationError, setValidationError] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef(null)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const handleFileSelect = useCallback((selected) => {
    const error = validateFile(selected)
    if (error) {
      setValidationError(error)
      setFile(null)
    } else {
      setValidationError(null)
      setFile(selected)
    }
  }, [])

  // --- Drag-and-drop handlers ---

  const onDragEnter = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const onDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const onDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const onDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    const dropped = e.dataTransfer.files?.[0]
    if (dropped) handleFileSelect(dropped)
  }

  // --- File input fallback ---

  const onInputChange = (e) => {
    const selected = e.target.files?.[0]
    if (selected) handleFileSelect(selected)
    // Reset input so the same file can be re-selected after removal
    e.target.value = ''
  }

  const removeFile = () => {
    setFile(null)
    setValidationError(null)
  }

  // --- Upload mutation ---

  const uploadMutation = useMutation({
    mutationFn: (fileToUpload) => {
      const formData = new FormData()
      formData.append('file', fileToUpload)
      // Strip .pdf extension for the title; backend trims whitespace
      formData.append('title', fileToUpload.name.replace(/\.pdf$/i, ''))
      return api.post('/api/v1/documents', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    },
    onSuccess: () => {
      // Invalidate the documents list so the dashboard refreshes immediately
      queryClient.invalidateQueries({ queryKey: ['documents'] })
      navigate('/dashboard')
    },
    onError: (err) => {
      // RFC 7807 Problem Details — backend returns { detail: "..." }
      const message =
        err.response?.data?.detail ??
        err.response?.data?.message ??
        'Upload failed. Please try again.'
      setValidationError(message)
    },
  })

  const handleSubmit = () => {
    if (!file) return
    uploadMutation.mutate(file)
  }

  const formatBytes = (bytes) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const isUploading = uploadMutation.isPending

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto px-8 py-8">
        <div className="mb-8">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Upload a document</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            PDF files only · max 50 MB
          </p>
        </div>

        {/* Drop zone */}
        <div
          role="presentation"
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onClick={() => !file && fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer ${
            isDragging
              ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950'
              : file
              ? 'border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-950 cursor-default'
              : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300 hover:bg-gray-50 dark:hover:bg-gray-800'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            onChange={onInputChange}
            className="sr-only"
            aria-label="Upload PDF"
            data-testid="file-input"
          />

          {!file ? (
            <>
              <div className="mx-auto h-12 w-12 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-4">
                <svg className="h-6 w-6 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Drag and drop your PDF here
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">or click to browse</p>
            </>
          ) : (
            <div className="flex items-center justify-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-red-50 dark:bg-red-950 flex items-center justify-center flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                </svg>
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-gray-900 dark:text-white">{file.name}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">{formatBytes(file.size)}</p>
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); removeFile() }}
                className="ml-auto p-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                aria-label="Remove file"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Validation / upload error */}
        {validationError && (
          <div
            role="alert"
            className="mt-3 flex items-start gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-100 dark:border-red-900 rounded-lg px-4 py-3"
            data-testid="upload-error"
          >
            <svg className="h-4 w-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
            {validationError}
          </div>
        )}

        {/* Upload progress */}
        {isUploading && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1.5">
              <span>Uploading…</span>
            </div>
            <div className="h-1.5 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-600 rounded-full animate-pulse w-full" />
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!file || isUploading}
            className="flex-1 bg-indigo-600 text-white text-sm font-medium py-2.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isUploading ? 'Uploading…' : 'Upload and process'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            disabled={isUploading}
            className="px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
        </div>

        {/* Constraints reminder */}
        <p className="mt-4 text-xs text-gray-400 dark:text-gray-500 text-center">
          Rate limited to 10 uploads per hour per account.
        </p>
      </div>
    </AppLayout>
  )
}
