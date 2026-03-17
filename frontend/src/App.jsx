import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { supabase } from './lib/supabase'
import api from './lib/axios'
import useAuthStore from './stores/authStore'
import ProtectedRoute from './components/ProtectedRoute'
import LandingPage from './pages/LandingPage'
import DashboardPage from './pages/DashboardPage'
import UploadPage from './pages/UploadPage'
import DocumentPage from './pages/DocumentPage'

/**
 * Single QueryClient instance for the whole app.
 * Production note: add defaultOptions with staleTime / gcTime tuning and
 * a global onError handler that reports to Sentry.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
})

export default function App() {
  const setSession = useAuthStore((s) => s.setSession)
  const setLoading = useAuthStore((s) => s.setLoading)

  useEffect(() => {
    // Resolve the initial session synchronously from local storage then
    // confirm with the server. Until this resolves, loading=true prevents
    // ProtectedRoute from flashing a redirect.
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session)
      setLoading(false)

      if (event === 'SIGNED_IN' && session) {
        // Upsert the Supabase user into the backend's local users table so
        // the backend can use a stable internal UUID for foreign keys.
        try {
          await api.post('/api/v1/auth/sync')
        } catch (err) {
          // Non-fatal: user can still use the app; sync retries on next sign-in.
          console.error('[auth] Failed to sync user with backend:', err)
        }
      }
    })

    return () => subscription.unsubscribe()
  }, [setSession, setLoading])

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/upload"
            element={
              <ProtectedRoute>
                <UploadPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/documents/:id"
            element={
              <ProtectedRoute>
                <DocumentPage />
              </ProtectedRoute>
            }
          />
          {/* Catch-all: redirect unknown paths to landing */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
