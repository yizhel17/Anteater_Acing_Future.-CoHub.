import axios from 'axios'

import { useAuthStore } from '@/store/authStore'
import type { TokenResponse } from '@/types'

const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
})

client.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

let refreshPromise: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken, user, setAuth, clearAuth } = useAuthStore.getState()
  if (!refreshToken) {
    clearAuth()
    return null
  }
  try {
    const { data } = await axios.post<TokenResponse>(
      `${import.meta.env.VITE_API_BASE_URL}/v1/auth/refresh`,
      { refresh_token: refreshToken },
    )
    setAuth({ accessToken: data.access_token, refreshToken: data.refresh_token, user })
    return data.access_token
  } catch {
    clearAuth()
    return null
  }
}

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true
      refreshPromise ??= refreshAccessToken()
      const newToken = await refreshPromise
      refreshPromise = null
      if (newToken) {
        originalRequest.headers.Authorization = `Bearer ${newToken}`
        return client(originalRequest)
      }
      window.location.href = '/login'
    }
    return Promise.reject(error)
  },
)

export default client
