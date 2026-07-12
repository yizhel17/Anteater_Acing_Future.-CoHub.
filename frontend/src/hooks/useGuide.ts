import { useMutation, useQuery } from '@tanstack/react-query'

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
