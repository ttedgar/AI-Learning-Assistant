import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import ProtectedRoute from './ProtectedRoute'
import useAuthStore from '../stores/authStore'

// Provide a factory so Vitest never loads the real authStore module (which
// would trigger the Supabase client initialisation and throw because
// VITE_SUPABASE_URL is undefined in the test environment).
vi.mock('../stores/authStore', () => ({
  default: vi.fn(),
}))

function renderWithRouter(initialPath, authState) {
  // useAuthStore is a selector-based hook: (selector) => selector(state)
  useAuthStore.mockImplementation((selector) => selector(authState))

  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/" element={<div>Landing page</div>} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <div>Dashboard page</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>
  )
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('redirects to / when the user is unauthenticated', () => {
    renderWithRouter('/dashboard', { user: null, loading: false })
    expect(screen.getByText('Landing page')).toBeInTheDocument()
    expect(screen.queryByText('Dashboard page')).not.toBeInTheDocument()
  })

  it('renders children when the user is authenticated', () => {
    renderWithRouter('/dashboard', {
      user: { id: 'user-1', email: 'alice@example.com' },
      loading: false,
    })
    expect(screen.getByText('Dashboard page')).toBeInTheDocument()
    expect(screen.queryByText('Landing page')).not.toBeInTheDocument()
  })

  it('renders a loading spinner while the session check is in progress', () => {
    renderWithRouter('/dashboard', { user: null, loading: true })
    // Neither the protected content nor the redirect should appear
    expect(screen.queryByText('Dashboard page')).not.toBeInTheDocument()
    expect(screen.queryByText('Landing page')).not.toBeInTheDocument()
  })
})
