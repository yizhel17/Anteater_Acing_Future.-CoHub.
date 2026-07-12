import { isAxiosError } from 'axios'

export function getErrorMessage(error: unknown): string {
  if (!isAxiosError(error)) {
    return 'Something went wrong. Please try again.'
  }

  if (!error.response) {
    return "Can't reach the server right now. Please check your connection and try again."
  }

  const status = error.response.status

  if (status === 502 || status === 504) {
    return 'The server is waking up. Please wait a moment and try again.'
  }
  if (status === 401) {
    return 'Invalid credentials or session expired. Please log in again.'
  }
  if (status === 500) {
    return 'Something went wrong on our end. Please try again shortly.'
  }

  const detail = error.response.data?.detail
  if (typeof detail === 'string' && detail.trim()) {
    return detail
  }

  if (status === 400) {
    return 'That request could not be processed. Please check your input and try again.'
  }
  if (status === 403) {
    return "You don't have permission to do that."
  }
  if (status === 404) {
    return "We couldn't find what you're looking for."
  }

  return 'Something went wrong. Please try again.'
}
