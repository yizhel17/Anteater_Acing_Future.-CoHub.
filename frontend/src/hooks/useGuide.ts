import { useMutation } from '@tanstack/react-query'
import { isAxiosError } from 'axios'

import { generateGuide } from '@/api/guide'
import type { GuideRequest, GuideResponse } from '@/types'

export function useGuide() {
  return useMutation<GuideResponse, unknown, GuideRequest>({
    mutationFn: generateGuide,
  })
}

export function getGuideErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const detail = error.response?.data?.detail
    if (typeof detail === 'string') return detail
    if (!error.response) return `Network error: ${error.message}. Is the backend running?`
  }
  if (error instanceof Error) return error.message
  return 'Something went wrong while generating your guide.'
}
