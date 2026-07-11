import client from '@/api/client'
import type { RatingResponse, RatingScore } from '@/types'

export async function submitRating(
  guideId: string,
  score: RatingScore,
): Promise<RatingResponse> {
  const { data } = await client.post<RatingResponse>('/v1/ratings', {
    guide_id: guideId,
    score,
  })
  return data
}
