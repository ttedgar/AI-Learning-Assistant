import axios from 'axios'
import useAuthStore from '../stores/authStore'

/**
 * Axios instance pre-configured with the backend base URL.
 * A request interceptor automatically attaches the Supabase JWT as a
 * Bearer token on every outbound request, so no page-level code needs
 * to handle auth headers manually.
 *
 * Token source: Zustand authStore (populated by supabase.auth.onAuthStateChange in App.jsx).
 * This is synchronous — we never call supabase.auth.getSession() here because that can
 * trigger an async token refresh that hangs indefinitely on a slow network, blocking the
 * interceptor and preventing any HTTP request from being sent.
 *
 * Production note: add a response interceptor that handles 401 by redirecting to login.
 */
const api = axios.create({
  baseURL: import.meta.env.VITE_BACKEND_URL,
})

api.interceptors.request.use((config) => {
  // Dev auth bypass: inject sentinel headers instead of a real Supabase JWT.
  // VITE_DEV_AUTH is only set to "true" in docker-compose.dev.yml; never in production.
  // Production equivalent: Bearer token validated against Supabase JWKS (ES256).
  if (import.meta.env.VITE_DEV_AUTH === 'true') {
    config.headers['X-Dev-User-Id']    = import.meta.env.VITE_DEV_USER_ID
    config.headers['X-Dev-User-Email'] = import.meta.env.VITE_DEV_USER_EMAIL
  } else {
    // Read the session synchronously from the Zustand store.
    // onAuthStateChange in App.jsx keeps this up-to-date (including token refreshes).
    const { session } = useAuthStore.getState()
    if (session?.access_token) {
      config.headers.Authorization = `Bearer ${session.access_token}`
    }
  }

  return config
})

export default api
