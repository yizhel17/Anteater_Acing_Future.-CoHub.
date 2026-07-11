import { useMutation } from '@tanstack/react-query'
import { isAxiosError } from 'axios'

import { login, logout as apiLogout, me, register } from '@/api/auth'
import { useAuthStore } from '@/store/authStore'
import type { LoginRequest, RegisterRequest } from '@/types'

export function useAuth() {
  const accessToken = useAuthStore((s) => s.accessToken)
  const user = useAuthStore((s) => s.user)
  const setAuth = useAuthStore((s) => s.setAuth)
  const setUser = useAuthStore((s) => s.setUser)
  const clearAuth = useAuthStore((s) => s.clearAuth)

  const loginMutation = useMutation({
    mutationFn: async (req: LoginRequest) => {
      const tokens = await login(req)
      setAuth({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token })
      const profile = await me()
      setUser(profile)
      return profile
    },
  })

  const registerMutation = useMutation({
    mutationFn: async (req: RegisterRequest) => {
      const tokens = await register(req)
      setAuth({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token })
      const profile = await me()
      setUser(profile)
      return profile
    },
  })

  async function logout() {
    try {
      await apiLogout()
    } catch {
      // best-effort — local session is cleared either way
    }
    clearAuth()
  }

  return {
    isAuthenticated: !!accessToken,
    user,
    login: loginMutation.mutate,
    isLoggingIn: loginMutation.isPending,
    loginError: loginMutation.error,
    register: registerMutation.mutate,
    isRegistering: registerMutation.isPending,
    registerError: registerMutation.error,
    logout,
  }
}

export function getAuthErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const detail = error.response?.data?.detail
    if (typeof detail === 'string') return detail
    if (!error.response) return `Network error: ${error.message}. Is the backend running?`
  }
  if (error instanceof Error) return error.message
  return 'Something went wrong. Please try again.'
}
