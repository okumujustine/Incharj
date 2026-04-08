import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, Organization } from '../types'

interface AuthState {
  user: User | null
  accessToken: string | null
  currentOrg: Organization | null
  setAuth: (user: User, token: string) => void
  setCurrentOrg: (org: Organization) => void
  updateToken: (token: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      currentOrg: null,

      setAuth: (user, token) =>
        set({ user, accessToken: token, currentOrg: user.org ?? null }),

      setCurrentOrg: (org) =>
        set({ currentOrg: org }),

      updateToken: (token) =>
        set({ accessToken: token }),

      logout: () =>
        set({ user: null, accessToken: null, currentOrg: null }),
    }),
    {
      name: 'incharj-auth',
      partialize: (state) => ({
        // Only persist currentOrg slug reference, not the token (security)
        // Token is kept in memory only via zustand (not persisted)
        currentOrg: state.currentOrg,
      }),
    }
  )
)
