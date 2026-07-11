import client from '@/api/client'
import type { ContributionRequest, ContributionResponse } from '@/types'

export async function submitContribution(
  req: ContributionRequest,
): Promise<ContributionResponse> {
  const { data } = await client.post<ContributionResponse>('/v1/contributions', req)
  return data
}

export async function listPendingContributions(): Promise<ContributionResponse[]> {
  const { data } = await client.get<ContributionResponse[]>('/v1/contributions')
  return data
}

export async function approveContribution(id: string): Promise<ContributionResponse> {
  const { data } = await client.post<ContributionResponse>(
    `/v1/contributions/${id}/approve`,
  )
  return data
}

export async function rejectContribution(id: string): Promise<void> {
  await client.delete(`/v1/contributions/${id}`)
}
