import client from '@/api/client'
import type { CalendarUrlResponse } from '@/types'

export async function getCalendarUrl(): Promise<CalendarUrlResponse> {
  const { data } = await client.get<CalendarUrlResponse>('/v1/calendar/me/url')
  return data
}
