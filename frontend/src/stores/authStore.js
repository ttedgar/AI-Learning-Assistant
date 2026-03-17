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

  loginWithGoogle: async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/dashboard`,
      },
    })
  },

  logout: async () => {
    await supabase.auth.signOut()
    set({ user: null, session: null })
  },
}))

export default useAuthStore
