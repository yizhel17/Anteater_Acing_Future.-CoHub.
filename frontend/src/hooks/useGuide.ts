import { useMutation, useQuery } from '@tanstack/react-query'
import { isAxiosError } from 'axios'

import { generateGuide, getGuide, getGuideHistory } from '@/api/guide'
import type { GuideHistoryResponse, GuideRequest, GuideResponse } from '@/types'

export function useGuide() {
  return useMutation<GuideResponse, unknown, GuideRequest>({
    mutationFn: generateGuide,
  })
}

export function useGuideHistory(limit = 20, offset = 0) {
  return useQuery<GuideHistoryResponse>({
    queryKey: ['guideHistory', limit, offset],
    queryFn: () => getGuideHistory(limit, offset),
  })
}

export function useGuideDetail(id: string | undefined) {
  return useQuery<GuideResponse>({
    queryKey: ['guide', id],
    queryFn: () => getGuide(id as string),
    enabled: Boolean(id),
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
