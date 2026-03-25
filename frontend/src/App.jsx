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
import HowToUsePage from './pages/HowToUsePage'
import TechnicalPage from './pages/TechnicalPage'
import DiaryPage from './pages/DiaryPage'
import SystemMapPage from './pages/SystemMapPage'

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

const DEV_AUTH   = import.meta.env.VITE_DEV_AUTH === 'true'
const DEV_USER_ID    = import.meta.env.VITE_DEV_USER_ID
const DEV_USER_EMAIL = import.meta.env.VITE_DEV_USER_EMAIL

export default function App() {
  const setSession = useAuthStore((s) => s.setSession)
  const setLoading = useAuthStore((s) => s.setLoading)
  const setDevUser = useAuthStore((s) => s.setDevUser)

  useEffect(() => {
    if (DEV_AUTH) {
      // Dev auth bypass: skip Google OAuth entirely and populate the store with a
      // synthetic user. The axios interceptor injects X-Dev-* headers so the backend
      // authenticates via DevAuthFilter instead of validating a JWT.
      // Then call /auth/sync to ensure this user exists in the backend DB.
      // Production equivalent: supabase.auth.onAuthStateChange → setSession → Bearer JWT.
      setDevUser(DEV_USER_ID, DEV_USER_EMAIL)
      api
        .post('/api/v1/auth/sync', {
          supabaseUserId: DEV_USER_ID,
          email: DEV_USER_EMAIL,
        })
        .catch((err) => console.error('[auth] Dev sync failed:', err))
      return
    }

    // Resolve the initial session synchronously from local storage then
    // confirm with the server. Until this resolves, loading=true prevents
    // ProtectedRoute from flashing a redirect.
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)

      // Sync on page load/refresh: onAuthStateChange fires INITIAL_SESSION (not
      // SIGNED_IN) so we must sync here too. The backend endpoint is an upsert —
      // safe to call on every load.
      if (session) {
        api
          .post('/api/v1/auth/sync', {
            supabaseUserId: session.user.id,
            email: session.user.email,
          })
          .catch((err) => console.error('[auth] Failed to sync user with backend:', err))
      }
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
          await api.post('/api/v1/auth/sync', {
            supabaseUserId: session.user.id,
            email: session.user.email,
          })
        } catch (err) {
          // Non-fatal: user can still use the app; sync retries on next sign-in.
          console.error('[auth] Failed to sync user with backend:', err)
        }
      }
    })

    return () => subscription.unsubscribe()
  }, [setSession, setLoading, setDevUser])

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
          {/* Public info pages */}
          <Route path="/how-to-use" element={<HowToUsePage />} />
          <Route path="/technical" element={<TechnicalPage />} />
          <Route path="/architecture" element={<SystemMapPage />} />
          <Route path="/diary" element={<DiaryPage />} />
          {/* Catch-all: redirect unknown paths to landing */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
