import { create } from 'zustand'
import { supabase } from '../lib/supabase'

/**
 * Global auth state managed by Zustand.
 *
 * - `user`    — the Supabase User object, null when unauthenticated
 * - `session` — the full Supabase Session (contains access_token), null when unauthenticated
 * - `loading` — true until the initial session check in App.jsx resolves
 *
 * Production note: persist session to localStorage via the zustand/middleware
 * `persist` middleware so the loading flash on page refresh is minimised.
 * Supabase already does this internally; Zustand persistence would only be
 * needed if we stored additional derived state here.
 */
const useAuthStore = create((set) => ({
  user: null,
  session: null,
  loading: true,

  setSession: (session) =>
    set({ session, user: session?.user ?? null }),

  setLoading: (loading) => set({ loading }),

  /**
   * Populates auth state with a synthetic dev user, bypassing Supabase OAuth.
   * Called by App.jsx when VITE_DEV_AUTH=true. Session is null because there is
   * no real Supabase session — the axios interceptor injects X-Dev-* headers instead.
   *
   * Production equivalent: setSession() called by supabase.auth.onAuthStateChange
   * with a real Session containing a signed ES256 JWT.
   */
  setDevUser: (id, email) =>
    set({ user: { id, email }, session: null, loading: false }),

  loginWithGoogle: async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/dashboard`,
      },
    })
  },

  logout: async () => {
    // Clear local state FIRST so any navigation triggered after this call
    // (e.g. navigate('/') in AppLayout) sees user=null immediately and
    // LandingPage's useEffect does not bounce the user back to /dashboard.
    set({ user: null, session: null })
    await supabase.auth.signOut()
  },
}))

export default useAuthStore
