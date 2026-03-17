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
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`
  }

  return config
})

export default api
