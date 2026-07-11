import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { UCI_COURSES } from '@/data/courses'
import { getContributionErrorMessage, useSubmitContribution } from '@/hooks/useContributions'

// 保持半透明磨砂质感
const inputClassName =
  'w-full rounded-xl border border-[var(--border-ink)]/20 bg-white/50 px-5 py-3.5 text-[15px] text-[var(--ink-black)] outline-none transition-all placeholder:text-gray-400 focus:bg-white focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent)]/10'

const labelClassName = 'mb-2 flex items-center gap-1.5 text-[15px] font-bold text-[var(--ink-black)] tracking-wide'

export function ContributePage() {
  // 核心逻辑升级：将 course 拆分为“下拉选择”和“自定义输入”两个状态
  const [courseSelect, setCourseSelect] = useState('')
  const [customCourse, setCustomCourse] = useState('')
  
  const [dangerZone, setDangerZone] = useState('')
  const [setupTips, setSetupTips] = useState('')
  const [careerValue, setCareerValue] = useState('')

  const { mutate, isPending, isError, error, isSuccess } = useSubmitContribution()

  // 动态计算最终提交的 course 值
  const finalCourse = courseSelect === 'other' ? customCourse.trim() : courseSelect.trim()

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!finalCourse) return
    mutate({
      course: finalCourse,
      danger_zone: dangerZone.trim() || null,
      setup_tips: setupTips.trim() || null,
      career_value: careerValue.trim() || null,
    })
  }

  return (
    <div className="min-h-screen w-full bg-[var(--xuan-paper)] px-6 py-12">
      <div className="mx-auto max-w-2xl">
        
        {/* 
          1. 按钮升级：复刻蓝调渐变方框
          使用 rounded-lg、px-8 py-3.5 保持方正硬朗，并加入了一个向左的动态小箭头 
        */}
        <Link
          to="/"
          className="group mb-12 inline-flex w-fit items-center gap-3 rounded-lg bg-gradient-to-r from-sky-200 to-blue-300 px-8 py-3.5 text-[15px] font-bold tracking-wide text-[var(--ink-black)] no-underline shadow-sm transition-all hover:from-sky-300 hover:to-blue-400 hover:shadow-md hover:-translate-y-0.5 hover:no-underline"
        >
          <svg 
            className="h-5 w-5 text-[var(--ink-black)] transition-transform duration-300 group-hover:-translate-x-1" 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor" 
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Guide
        </Link>

        <div className="flex flex-col">
          {isSuccess ? (
            <div className="py-12 text-center">
              <div className="mb-6 text-6xl">🎉</div>
              <h1 className="mb-4 text-3xl font-extrabold text-[var(--ink-black)]">Thanks for contributing!</h1>
              <p className="text-base font-medium text-[var(--ink-mid)]">
                Your submission is in review. Once approved, it'll help future students navigating this course.
              </p>
            </div>
          ) : (
            <>
              <h1 className="mb-3 text-4xl font-extrabold tracking-tight text-[var(--ink-black)]">Join As a Contributor</h1>
              <p className="mb-10 text-base font-medium text-[var(--ink-mid)]">
                Share what you wish you knew in your freshman year — it gets folded into the guide for students taking this course next.
              </p>

              <form onSubmit={handleSubmit} className="flex flex-col gap-8">
                <div>
                  <label htmlFor="course" className={labelClassName}>
                    <span>📚</span> Course Name
                  </label>
                  
                  {/* 2. 混合式菜单：下拉框 */}
                  <select
                    id="course"
                    value={courseSelect}
                    onChange={(e) => setCourseSelect(e.target.value)}
                    required
                    className={inputClassName}
                  >
                    <option value="" disabled>Select a course...</option>
                    {UCI_COURSES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} — {c.name}
                      </option>
                    ))}
                    <option value="other">✨ Other (Type your own)</option>
                  </select>

                  {/* 如果选择了 Other，则丝滑呈现文本输入框 */}
                  {courseSelect === 'other' && (
                    <div className="mt-3 animate-in fade-in slide-in-from-top-2 duration-300">
                      <input
                        type="text"
                        value={customCourse}
                        onChange={(e) => setCustomCourse(e.target.value)}
                        required
                        autoFocus
                        placeholder="e.g. ICS 33 or CS 161"
                        className={inputClassName}
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label htmlFor="dangerZone" className={labelClassName}>
                    <span>🔥</span> Danger Zone 
                    <span className="font-normal text-sm text-[var(--ink-light)] ml-1">(optional)</span>
                  </label>
                  <textarea
                    id="dangerZone"
                    value={dangerZone}
                    onChange={(e) => setDangerZone(e.target.value)}
                    rows={3}
                    placeholder="Common pitfalls, tricky assignments, or things that catch people off guard…"
                    className={inputClassName}
                  />
                </div>

                <div>
                  <label htmlFor="setupTips" className={labelClassName}>
                    <span>🛠️</span> Setup Tips 
                    <span className="font-normal text-sm text-[var(--ink-light)] ml-1">(optional)</span>
                  </label>
                  <textarea
                    id="setupTips"
                    value={setupTips}
                    onChange={(e) => setSetupTips(e.target.value)}
                    rows={3}
                    placeholder="How to get started, tools to install, or how to hit the ground running…"
                    className={inputClassName}
                  />
                </div>

                <div>
                  <label htmlFor="careerValue" className={labelClassName}>
                    <span>🚀</span> Career Value 
                    <span className="font-normal text-sm text-[var(--ink-light)] ml-1">(optional)</span>
                  </label>
                  <textarea
                    id="careerValue"
                    value={careerValue}
                    onChange={(e) => setCareerValue(e.target.value)}
                    rows={3}
                    placeholder="How this course paid off — interviews, jobs, projects it unlocked…"
                    className={inputClassName}
                  />
                </div>

                {isError && <ErrorBanner message={getContributionErrorMessage(error)} />}

                <button
                  type="submit"
                  disabled={!finalCourse || isPending}
                  className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-200 to-blue-300 px-8 py-4 text-[16px] font-bold tracking-wide text-[var(--ink-black)] shadow-sm transition-all hover:-translate-y-0.5 hover:from-sky-300 hover:to-blue-400 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
                >
                  {isPending ? 'Submitting…' : 'Submit Contribution'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
