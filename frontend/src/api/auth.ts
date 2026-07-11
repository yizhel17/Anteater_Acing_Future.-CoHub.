import client from '@/api/client'
import type {
  LoginRequest,
  RefreshRequest,
  RegisterRequest,
  TokenResponse,
  UserResponse,
} from '@/types'

export async function register(req: RegisterRequest): Promise<TokenResponse> {
  const { data } = await client.post<TokenResponse>('/v1/auth/register', req)
  return data
}

export async function login(req: LoginRequest): Promise<TokenResponse> {
  const { data } = await client.post<TokenResponse>('/v1/auth/login', req)
  return data
}

export async function refresh(req: RefreshRequest): Promise<TokenResponse> {
  const { data } = await client.post<TokenResponse>('/v1/auth/refresh', req)
  return data
}

export async function logout(): Promise<void> {
  await client.post('/v1/auth/logout')
}

export async function me(): Promise<UserResponse> {
  const { data } = await client.get<UserResponse>('/v1/auth/me')
  return data
}
