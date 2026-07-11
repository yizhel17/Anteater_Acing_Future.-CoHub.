import { useMemo, useRef } from 'react'
import type { ComponentPropsWithoutRef } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import remarkGfm from 'remark-gfm'
import { Link } from 'react-router-dom'

import type { Role } from '@/types'

import { ExportMenu } from './ExportMenu'
import { RatingBar } from './RatingBar'

interface GuideCardProps {
  guideId: string
  markdown: string
  role: Role
  onReset: () => void
}

function countMarkdownTables(markdown: string): number {
  let count = 0
  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.trim()
    if (line.includes('-') && /^\|?[\s:|-]+\|?$/.test(line)) count++
  }
  return count
}

export function GuideCard({ guideId, markdown, role, onReset }: GuideCardProps) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const tableIndexRef = useRef(0)
  const totalTables = useMemo(() => countMarkdownTables(markdown), [markdown])
  tableIndexRef.current = 0

  const components = useMemo(
    () => ({
      table: (props: ComponentPropsWithoutRef<'table'>) => {
        tableIndexRef.current += 1
        const isLastTable = tableIndexRef.current === totalTables
        return (
          <>
            <table {...props} />
            {isLastTable && <ExportMenu containerRef={bodyRef} />}
          </>
        )
      },
    }),
    [totalTables],
  )

  return (
    <div className="ai-response-wrap" id="aafResult">
      <div className="ai-response-header">
        <span className="ai-response-icon">🐜</span>
        <span className="ai-response-title">Your Personalized Guide</span>
        <button type="button" className="ai-response-reset" onClick={onReset}>
          ← New Guide
        </button>
      </div>
      <div className="ai-response-body" id="aafBody" ref={bodyRef}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={components}>
          {markdown}
        </ReactMarkdown>

        {role === 'senior' && (
          <div className="senior-contrib-row">
            <Link className="btn-contrib" to="/contribute">
              Join As a Contributor of AAF
            </Link>
          </div>
        )}

        <RatingBar guideId={guideId} />
      </div>
    </div>
  )
}
