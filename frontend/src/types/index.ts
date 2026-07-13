export type Role = 'student' | 'senior'

export interface GuideRequest {
  role: Role
  courses: string[]
  confidence: number
  goals: string[]
  user_query?: string | null
}

export interface GuideResponse {
  guide_id: string
  guide_markdown: string
  sources_used: string[]
  tips_count: number
  tokens_used: number
}

export interface GuideHistoryItem {
  guide_id: string
  role: string
  courses: string[]
  created_at: string
}

export interface GuideHistoryResponse {
  items: GuideHistoryItem[]
  total: number
}

export interface RegisterRequest {
  email: string
  password: string
  display_name?: string | null
}

export interface LoginRequest {
  email: string
  password: string
}

export interface RefreshRequest {
  refresh_token: string
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
}

export interface UserResponse {
  id: string
  email: string
  display_name: string | null
  role: string
  created_at: string
}

export type RatingScore = -1 | 0 | 1

export interface RatingRequest {
  guide_id: string
  score: RatingScore
}

export interface RatingResponse {
  id: string
  guide_id: string
  score: number
  created_at: string
}

export interface ContributionRequest {
  course: string
  danger_zone?: string | null
  setup_tips?: string | null
  career_value?: string | null
}

export interface ContributionResponse {
  id: string
  course: string
  danger_zone: string | null
  setup_tips: string | null
  career_value: string | null
  is_approved: boolean
  created_at: string
}

export interface CalendarUrlResponse {
  ics_url: string
  webcal_url: string
}

export interface DocxExportResponse {
  download_url: string
  expires_in: number
}
