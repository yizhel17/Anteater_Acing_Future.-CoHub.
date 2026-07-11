import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { UserResponse } from '@/types'

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  user: UserResponse | null
  setAuth: (tokens: {
    accessToken: string
    refreshToken: string
    user?: UserResponse | null
  }) => void
  setUser: (user: UserResponse | null) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      setAuth: ({ accessToken, refreshToken, user }) =>
        set({ accessToken, refreshToken, user: user ?? null }),
      setUser: (user) => set({ user }),
      clearAuth: () => set({ accessToken: null, refreshToken: null, user: null }),
    }),
    { name: 'aaf_auth' },
  ),
)
