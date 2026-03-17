import { Navigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'

/**
 * Wraps any route element that requires authentication.
 * Redirects to / if there is no authenticated user once the initial
 * session check has resolved.
 *
 * Production note: show a full-page skeleton/spinner during the loading
 * phase instead of null to prevent layout shift.
 */
export default function ProtectedRoute({ children }) {
  const user = useAuthStore((s) => s.user)
  const loading = useAuthStore((s) => s.loading)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin h-8 w-8 rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/" replace />
  }

  return children
}
