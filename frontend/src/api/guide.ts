import client from '@/api/client'
import type { DocxExportResponse, GuideHistoryResponse, GuideRequest, GuideResponse } from '@/types'

export async function generateGuide(req: GuideRequest): Promise<GuideResponse> {
  const { data } = await client.post<GuideResponse>('/v1/guide/generate', req)
  return data
}

export async function getGuideHistory(
  limit = 20,
  offset = 0,
): Promise<GuideHistoryResponse> {
  const { data } = await client.get<GuideHistoryResponse>('/v1/guide/history', {
    params: { limit, offset },
  })
  return data
}

export async function getGuide(id: string): Promise<GuideResponse> {
  const { data } = await client.get<GuideResponse>(`/v1/guide/${id}`)
  return data
}

export async function exportGuideDocx(guideId: string): Promise<DocxExportResponse> {
  const { data } = await client.post<DocxExportResponse>(`/v1/guide/${guideId}/export/docx`)
  return data
}
