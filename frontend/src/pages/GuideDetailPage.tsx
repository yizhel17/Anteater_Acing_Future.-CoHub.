import { Link, useNavigate, useParams } from 'react-router-dom'

import { GuideCard } from '@/components/result/GuideCard'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { useGuideDetail } from '@/hooks/useGuide'

// Mirrors the real .ai-response-wrap/.ai-response-header/.ai-response-body
// structure (index.css) so the skeleton doesn't introduce a shadow/shape
// flash when the real GuideCard mounts in its place.
function GuideDetailSkeleton() {
  return (
    <div className="animate-pulse overflow-hidden rounded-b-[10px] border border-[var(--border-ink)] border-t-4 border-t-[var(--accent)] bg-white">
      <div className="flex items-center gap-2.5 border-b border-[var(--border-ink)] bg-[var(--accent-bg)] px-6 py-3.5">
        <div className="h-5 w-5 rounded-full bg-[var(--border-ink)]" />
        <div className="h-4 w-48 rounded bg-[var(--border-ink)]" />
      </div>
      <div className="flex flex-col gap-3 px-8 py-7">
        <div className="h-4 w-full rounded bg-[var(--border-ink)]" />
        <div className="h-4 w-11/12 rounded bg-[var(--border-ink)]" />
        <div className="h-4 w-4/5 rounded bg-[var(--border-ink)]" />
        <div className="h-4 w-full rounded bg-[var(--border-ink)]" />
        <div className="h-4 w-3/4 rounded bg-[var(--border-ink)]" />
        <div className="h-4 w-2/3 rounded bg-[var(--border-ink)]" />
      </div>
    </div>
  )
}

export function GuideDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data, isPending, isError } = useGuideDetail(id)

  return (
    <div className="min-h-screen w-full bg-[var(--xuan-paper)] px-6 py-12">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6">
          <Link
            to="/history"
            className="group inline-flex shrink-0 items-center gap-3 rounded-lg bg-gradient-to-r from-sky-200 to-blue-300 px-8 py-3.5 text-[15px] font-bold tracking-wide text-[var(--ink-black)] no-underline shadow-sm transition-all hover:-translate-y-0.5 hover:from-sky-300 hover:to-blue-400 hover:no-underline hover:shadow-md"
          >
            <svg
              className="h-5 w-5 text-[var(--ink-black)] transition-transform duration-300 group-hover:-translate-x-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to History
          </Link>
        </div>

        {isPending && <GuideDetailSkeleton />}

        {isError && (
          <ErrorBanner message="Unable to load this guide. Please try again later or check your connection." />
        )}

        {data && <GuideCard guideId={data.guide_id} markdown={data.guide_markdown} onReset={() => navigate('/')} />}
      </div>
    </div>
  )
}
