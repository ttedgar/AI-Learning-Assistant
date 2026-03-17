import { describe, it, expect, beforeEach, vi } from 'vitest'
import useAuthStore from './authStore'

// Prevent the real Supabase client from being initialised during tests.
// import.meta.env values are undefined in the test environment, which would
// cause createClient to throw without this mock.
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOAuth: vi.fn().mockResolvedValue({}),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  },
}))

describe('authStore', () => {
  beforeEach(() => {
    // Reset to a known state before every test so they are fully independent.
    useAuthStore.setState({ user: null, session: null, loading: false })
  })

  it('starts with null user and null session', () => {
    const { user, session } = useAuthStore.getState()
    expect(user).toBeNull()
    expect(session).toBeNull()
  })

  it('setSession stores both the session and the extracted user', () => {
    const mockSession = {
      access_token: 'eyJtest',
      user: { id: 'user-123', email: 'alice@example.com' },
    }

    useAuthStore.getState().setSession(mockSession)

    const state = useAuthStore.getState()
    expect(state.session).toEqual(mockSession)
    expect(state.user).toEqual(mockSession.user)
  })

  it('setSession with null clears both user and session', () => {
    useAuthStore.setState({
      session: { access_token: 'old' },
      user: { id: 'old-user' },
    })

    useAuthStore.getState().setSession(null)

    const state = useAuthStore.getState()
    expect(state.session).toBeNull()
    expect(state.user).toBeNull()
  })

  it('logout clears user and session', async () => {
    useAuthStore.setState({
      user: { id: 'user-1', email: 'bob@example.com' },
      session: { access_token: 'token' },
    })

    await useAuthStore.getState().logout()

    const state = useAuthStore.getState()
    expect(state.user).toBeNull()
    expect(state.session).toBeNull()
  })

  it('setLoading updates the loading flag', () => {
    useAuthStore.setState({ loading: false })
    useAuthStore.getState().setLoading(true)
    expect(useAuthStore.getState().loading).toBe(true)
  })
})
