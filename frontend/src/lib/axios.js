import axios from 'axios'
import { supabase } from './supabase'

/**
 * Axios instance pre-configured with the backend base URL.
 * A request interceptor automatically attaches the Supabase JWT as a
 * Bearer token on every outbound request, so no page-level code needs
 * to handle auth headers manually.
 *
 * Production note: add a response interceptor that refreshes the session
 * on 401 and retries once before redirecting to login.
 */
const api = axios.create({
  baseURL: import.meta.env.VITE_BACKEND_URL,
})

api.interceptors.request.use(async (config) => {
  // Dev auth bypass: inject sentinel headers instead of a real Supabase JWT.
  // VITE_DEV_AUTH is only set to "true" in docker-compose.dev.yml; never in production.
  // Production equivalent: Bearer token validated against Supabase JWKS (ES256).
  if (import.meta.env.VITE_DEV_AUTH === 'true') {
    config.headers['X-Dev-User-Id']    = import.meta.env.VITE_DEV_USER_ID
    config.headers['X-Dev-User-Email'] = import.meta.env.VITE_DEV_USER_EMAIL
  } else {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (session?.access_token) {
      config.headers.Authorization = `Bearer ${session.access_token}`
    }
  }

  return config
})

export default api
