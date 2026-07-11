import { useState } from 'react'

import { submitRating } from '@/api/ratings'
import type { RatingScore } from '@/types'

interface RatingBarProps {
  guideId: string
}

type RatingValue = 'good' | 'neutral' | 'bad'
type Status = 'idle' | 'submitting' | 'done' | 'error'

const SCORE_MAP: Record<RatingValue, RatingScore> = { good: 1, neutral: 0, bad: -1 }
const EMOJI_MAP: Record<RatingValue, string> = { good: '😄', neutral: '🧐', bad: '😕' }

export function RatingBar({ guideId }: RatingBarProps) {
  const [selected, setSelected] = useState<RatingValue | null>(null)
  const [status, setStatus] = useState<Status>('idle')

  if (status === 'done' && selected) {
    return (
      <div className="aaf-rating">
        <span className="aaf-rating-thanks">
          {EMOJI_MAP[selected]} Thank you for your feedback — it helps James make AAF better for every Anteater. Zot!
        </span>
      </div>
    )
  }

  function handleSelect(val: RatingValue) {
    setSelected(val)
    setStatus((s) => (s === 'error' ? 'idle' : s))
    if (navigator.vibrate) navigator.vibrate(30)
  }

  async function handleSubmit() {
    if (!selected) return
    setStatus('submitting')
    try {
      await submitRating(guideId, SCORE_MAP[selected])
      setStatus('done')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="aaf-rating">
      <span className="aaf-rating-label">
        {status === 'error' ? 'Something went wrong — please try sending again.' : 'Does this guide spark something in you?'}
      </span>
      <div className="aaf-rating-btns">
        <button
          type="button"
          className={`aaf-rating-btn${selected === 'good' ? ' selected' : ''}`}
          title="Love it!"
          onClick={() => handleSelect('good')}
        >
          😄
        </button>
        <button
          type="button"
          className={`aaf-rating-btn${selected === 'neutral' ? ' selected' : ''}`}
          title="It's okay"
          onClick={() => handleSelect('neutral')}
        >
          🧐
        </button>
        <button
          type="button"
          className={`aaf-rating-btn${selected === 'bad' ? ' selected' : ''}`}
          title="Not quite"
          onClick={() => handleSelect('bad')}
        >
          😕
        </button>
        <button
          type="button"
          className={`aaf-rating-submit${selected ? ' visible' : ''}`}
          disabled={status === 'submitting'}
          onClick={handleSubmit}
        >
          {status === 'submitting' ? 'Sending…' : 'Send ↗'}
        </button>
      </div>
    </div>
  )
}
