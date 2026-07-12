import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  approveContribution,
  listPendingContributions,
  rejectContribution,
  submitContribution,
} from '@/api/contributions'
import type { ContributionRequest, ContributionResponse } from '@/types'

const PENDING_CONTRIBUTIONS_KEY = ['contributions', 'pending']

export function useSubmitContribution() {
  return useMutation<ContributionResponse, unknown, ContributionRequest>({
    mutationFn: submitContribution,
  })
}

export function usePendingContributions(enabled: boolean) {
  return useQuery<ContributionResponse[]>({
    queryKey: PENDING_CONTRIBUTIONS_KEY,
    queryFn: listPendingContributions,
    enabled,
  })
}

export function useApproveContribution() {
  const queryClient = useQueryClient()
  return useMutation<ContributionResponse, unknown, string>({
    mutationFn: approveContribution,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PENDING_CONTRIBUTIONS_KEY }),
  })
}

export function useRejectContribution() {
  const queryClient = useQueryClient()
  return useMutation<void, unknown, string>({
    mutationFn: rejectContribution,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PENDING_CONTRIBUTIONS_KEY }),
  })
}
