import { useEffect, useMemo, useRef, useState } from 'react'

import { CourseChip } from '@/components/ui/CourseChip'
import { UCI_COURSES } from '@/data/courses'
import { useWizardStore } from '@/store/wizardStore'

import { useStepShell } from './useStepShell'

interface StepCoursesProps {
  visible: boolean
  onBack: () => void
  onNext: () => void
}

type Division = 'all' | 'lower' | 'upper'

const TRENDING_COURSES: { code: string; name: string; div: 'lower' | 'upper' }[] = [
  { code: 'ICS 31', name: 'Introduction to Programming', div: 'lower' },
  { code: 'ICS 32', name: 'Programming with Software Libraries', div: 'lower' },
  { code: 'ICS 33', name: 'Intermediate Programming', div: 'lower' },
  { code: 'ICS 45C', name: 'Programming in C/C++ as a Second Language', div: 'upper' },
  { code: 'ICS 46', name: 'Data Structure Implementation and Analysis', div: 'upper' },
  { code: 'ICS 51', name: 'Introductory Computer Organization', div: 'upper' },
  { code: 'MATH 3A', name: 'Introduction to Linear Algebra', div: 'lower' },
  { code: 'MATH 2B', name: 'Single-Variable Calculus II', div: 'lower' },
]

function searchCourses(rawQuery: string) {
  const q = rawQuery.trim().toLowerCase()
  if (!q) return []
  return UCI_COURSES.filter((c) => {
    const code = c.code.toLowerCase()
    const dept = c.dept.toLowerCase()
    const name = c.name.toLowerCase()

    if (code.startsWith(q) || code.replace(/\s/g, '').startsWith(q.replace(/\s/g, ''))) return true
    if (dept.split(' ').some((d) => d.startsWith(q))) return true
    if (q.length >= 3 && (name.split(/\s+/).some((word) => word.startsWith(q)) || name.includes(q))) {
      return true
    }
    return false
  }).slice(0, 8)
}

export function StepCourses({ visible, onBack, onNext }: StepCoursesProps) {
  const role = useWizardStore((s) => s.role)
  const courses = useWizardStore((s) => s.courses)
  const toggleCourse = useWizardStore((s) => s.toggleCourse)
  const otherSelectedCourses = useWizardStore((s) => s.otherSelectedCourses)
  const addOtherCourse = useWizardStore((s) => s.addOtherCourse)
  const removeOtherCourse = useWizardStore((s) => s.removeOtherCourse)
  const { stepClassName, triggerShake } = useStepShell(visible)

  const [division, setDivision] = useState<Division>('all')
  const [query, setQuery] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const widgetRef = useRef<HTMLDivElement>(null)

  const results = useMemo(() => searchCourses(query), [query])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (widgetRef.current && !widgetRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  const visibleCourses = TRENDING_COURSES.filter((c) => division === 'all' || c.div === division)

  function handleSelectOther(code: string) {
    addOtherCourse(code)
    setQuery('')
    setDropdownOpen(false)
  }

  function handleNext() {
    if (courses.length + otherSelectedCourses.size === 0) {
      triggerShake()
      return
    }
    onNext()
  }

  const title = role === 'senior' ? 'Which course(s) have you completed?' : 'Which course(s) are you interested in?'
  const hint =
    role === 'senior'
      ? 'Select the ones you feel confident sharing advice about.'
      : "Select all that apply — we'll create a separate hub for each one."

  return (
    <div className={stepClassName} id="step-2">
      <p className="step-question">{title}</p>
      <p className="step-hint">{hint}</p>

      <div className="course-search-wrap">
        <div className="trending-title">Today's trending...</div>
        <div className="division-tabs">
          <button
            type="button"
            className={`div-tab${division === 'all' ? ' active' : ''}`}
            onClick={() => setDivision('all')}
          >
            All
          </button>
          <button
            type="button"
            className={`div-tab${division === 'lower' ? ' active' : ''}`}
            onClick={() => setDivision('lower')}
          >
            Lower Division
          </button>
          <button
            type="button"
            className={`div-tab${division === 'upper' ? ' active' : ''}`}
            onClick={() => setDivision('upper')}
          >
            Upper Division
          </button>
        </div>
      </div>

      <div className="course-grid">
        {visibleCourses.map((c) => (
          <CourseChip
            key={c.code}
            code={c.code}
            name={c.name}
            checked={courses.includes(c.code)}
            onToggle={() => toggleCourse(c.code)}
          />
        ))}

        <div className="other-search-widget" ref={widgetRef}>
          <div className="other-search-inner">
            <span className="other-search-icon">🔎</span>
            <input
              type="text"
              placeholder="Search any UCI course… (e.g. mat, law, lin)"
              autoComplete="off"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setDropdownOpen(e.target.value.trim().length > 0)
              }}
              onFocus={() => {
                if (query.trim()) setDropdownOpen(true)
              }}
            />
          </div>
          <div className={`other-dropdown${dropdownOpen ? ' open' : ''}`}>
            {results.length === 0 ? (
              query.trim() && <div className="other-dropdown-empty">No UCI courses found for "{query}"</div>
            ) : (
              results.map((c) => (
                <div key={c.code} className="other-dropdown-item" onClick={() => handleSelectOther(c.code)}>
                  <strong>{c.code}</strong>
                  <span>{c.name}</span>
                </div>
              ))
            )}
          </div>
          <div className="other-tags">
            {Array.from(otherSelectedCourses).map((code) => {
              const course = UCI_COURSES.find((c) => c.code === code)
              return (
                <span key={code} className="other-tag">
                  <strong>{code}</strong> {course?.name ?? ''}
                  <button type="button" onClick={() => removeOtherCourse(code)}>
                    ✕
                  </button>
                </span>
              )
            })}
          </div>
        </div>
      </div>

      <div className="nav-row">
        <button type="button" className="btn-back" onClick={onBack}>
          ← Back
        </button>
        <button type="button" className="btn-next" onClick={handleNext}>
          Next <span className="arrow">→</span>
        </button>
      </div>
    </div>
  )
}
