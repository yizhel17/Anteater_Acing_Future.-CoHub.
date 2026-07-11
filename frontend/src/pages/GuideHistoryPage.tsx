import { Link, useNavigate } from 'react-router-dom'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { useGuideHistory } from '@/hooks/useGuide'
import type { GuideHistoryItem } from '@/types'

// 保持宽阔的列比例
const ROW_GRID = 'grid grid-cols-[180px_1fr_180px_50px] items-center gap-6'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function TableHeaderRow() {
  return (
    <div className={`${ROW_GRID} border-b border-[var(--border-ink)] px-4 py-4 mb-2`}>
      <span className="text-sm font-semibold tracking-wider text-[var(--ink-mid)] uppercase">Role</span>
      <span className="text-sm font-semibold tracking-wider text-[var(--ink-mid)] uppercase">Courses</span>
      <span className="text-sm font-semibold tracking-wider text-[var(--ink-mid)] uppercase">Date</span>
      <span />
    </div>
  )
}

function SkeletonRow() {
  return (
    <div className={`${ROW_GRID} animate-pulse border-b border-[var(--border-ink)]/30 px-4 py-6`}>
      <div className="h-4 w-24 rounded bg-[var(--border-ink)]" />
      <div className="h-4 w-2/3 rounded bg-[var(--border-ink)]" />
      <div className="h-4 w-24 rounded bg-[var(--border-ink)]" />
      <div className="h-4 w-6 justify-self-end rounded bg-[var(--border-ink)]" />
    </div>
  )
}

function HistoryRow({ item, onNavigate }: { item: GuideHistoryItem; onNavigate: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onNavigate(item.guide_id)}
      className={`group ${ROW_GRID} w-full cursor-pointer rounded-xl px-4 py-6 text-left transition-all duration-300 ease-out hover:bg-white/60 border-b border-[var(--border-ink)]/30 hover:border-transparent last:border-none`}
    >
      <span className="text-[15px] font-bold text-[var(--accent)] uppercase tracking-wide">
        {item.role}
      </span>
      <span className="truncate text-base font-semibold text-[var(--ink-black)]">
        {item.courses.join(', ')}
      </span>
      <span className="text-[15px] font-medium text-[var(--ink-mid)]">
        {formatDate(item.created_at)}
      </span>
      <span className="justify-self-end text-lg opacity-40 transition-opacity duration-300 ease-out group-hover:opacity-100">
        ➡️
      </span>
    </button>
  )
}

export function GuideHistoryPage() {
  const navigate = useNavigate()
  const { data, isPending, isError } = useGuideHistory()

  return (
    <div className="min-h-screen w-full bg-[var(--xuan-paper)] py-12 px-6">
      <div className="mx-auto max-w-6xl">
        
        {/* 顶部标题与操作区 */}
        <div className="mb-16 flex items-center justify-between px-4">
          <h1 className="text-4xl font-extrabold text-[var(--ink-black)] tracking-tight">
            Your Guide History
          </h1>
          
          {/* 
            核心修改：
            - rounded-lg: 变成更硬朗的方框
            - px-8 py-3.5: 加大内部留白，把文字完美包裹
            - gap-3: 拉开图标与文字的距离
          */}
          <Link
            to="/"
            className="group shrink-0 whitespace-nowrap inline-flex items-center gap-3 rounded-lg bg-gradient-to-r from-sky-200 to-blue-300 px-8 py-3.5 text-[15px] font-bold tracking-wide text-[var(--ink-black)] no-underline shadow-sm transition-all hover:from-sky-300 hover:to-blue-400 hover:shadow-md hover:-translate-y-0.5 hover:no-underline"
          >
            <svg 
              className="h-5 w-5 text-[var(--ink-black)] transition-transform duration-300 group-hover:scale-110" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor" 
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            More Guides ahead!
          </Link>
        </div>

        {isError ? (
          <div className="px-4">
            <ErrorBanner message="Unable to load history. Please try again later or check your connection." />
          </div>
        ) : (
          <div className="flex flex-col">
            <TableHeaderRow />
            
            <div className="flex flex-col mt-2">
              {isPending && Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}

              {data && data.items.length === 0 && (
                <div className="py-24 text-center">
                  <p className="text-base font-medium text-[var(--ink-light)]">
                    No guides yet — generate one from the wizard and it'll show up here.
                  </p>
                </div>
              )}

              {data?.items.map((item) => (
                <HistoryRow key={item.guide_id} item={item} onNavigate={(id) => navigate(`/guide/${id}`)} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
