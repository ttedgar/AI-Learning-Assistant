import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import UploadPage from './UploadPage'
import useAuthStore from '../stores/authStore'

// Prevent real HTTP calls and Supabase initialisation.
// Factory functions ensure the real modules never execute.
vi.mock('../stores/authStore', () => ({ default: vi.fn() }))
vi.mock('../lib/axios', () => ({
  default: {
    post: vi.fn().mockResolvedValue({ data: { id: 'doc-1' } }),
    interceptors: { request: { use: vi.fn() } },
  },
}))
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
  },
}))

// AppLayout renders sidebar nav that needs router context + auth state.
// Mock it out so the test stays focused on UploadPage logic.
vi.mock('../components/AppLayout', () => ({
  default: ({ children }) => <div>{children}</div>,
}))

const authenticatedUser = { id: 'user-1', email: 'test@example.com' }

function renderUploadPage() {
  useAuthStore.mockImplementation((selector) =>
    selector({ user: authenticatedUser, loading: false, logout: vi.fn() })
  )

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/upload']}>
        <UploadPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('UploadPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects a non-PDF file and shows an error message', () => {
    renderUploadPage()

    const input = screen.getByTestId('file-input')
    const nonPdf = new File(['hello'], 'notes.txt', { type: 'text/plain' })

    fireEvent.change(input, { target: { files: [nonPdf] } })

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('alert').textContent).toMatch(/Only PDF files/)
  })

  it('accepts a valid PDF file and shows no error', () => {
    renderUploadPage()

    const input = screen.getByTestId('file-input')
    const pdf = new File(['%PDF-1.4 content'], 'lecture.pdf', {
      type: 'application/pdf',
    })

    fireEvent.change(input, { target: { files: [pdf] } })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('lecture.pdf')).toBeInTheDocument()
  })

  it('rejects a PDF that exceeds the 50 MB size limit', () => {
    renderUploadPage()

    const input = screen.getByTestId('file-input')
    const oversized = new File(['x'], 'big.pdf', { type: 'application/pdf' })
    Object.defineProperty(oversized, 'size', { value: 51 * 1024 * 1024 })

    fireEvent.change(input, { target: { files: [oversized] } })

    expect(screen.getByRole('alert').textContent).toMatch(/50 MB/)
  })

  it('the upload button is disabled when no file is selected', () => {
    renderUploadPage()

    const uploadButton = screen.getByRole('button', {
      name: /Upload and process/i,
    })
    expect(uploadButton).toBeDisabled()
  })

  it('the upload button is enabled after a valid PDF is selected', () => {
    renderUploadPage()

    const input = screen.getByTestId('file-input')
    fireEvent.change(input, {
      target: {
        files: [new File(['%PDF'], 'test.pdf', { type: 'application/pdf' })],
      },
    })

    expect(
      screen.getByRole('button', { name: /Upload and process/i })
    ).not.toBeDisabled()
  })
})
