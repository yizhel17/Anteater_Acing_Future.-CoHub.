import { useMemo, useRef } from 'react'

import { useWizardStore } from '@/store/wizardStore'

import { getUserQueryPlaceholder } from './placeholders'
import { useStepShell } from './useStepShell'

interface StepGoalsProps {
  visible: boolean
  onBack: () => void
  onSubmit: () => void
}

const GOAL_OPTIONS = [
  { value: 'ace_grade', label: '🏆  Get an A+/A the most feasible way' },
  { value: 'understand', label: '🧠  Actually understand the material' },
  { value: 'career', label: '💼  Build career-relevant skills' },
  { value: 'project', label: '🚀  Launch a real project or demo' },
]
const GOAL_OTHER = { value: 'other', label: '✦  Others' }

const EXPERTISE_OPTIONS = [
  { value: 'setup', label: '🔧  IDE Setup & GitHub Integration (Pre-class Checklist)' },
  { value: 'concepts', label: '🧠  Explaining hard concepts' },
  { value: 'exams', label: '📄  Exams Strategy & Syllabus Guidance' },
  { value: 'career', label: '💼  Careerpath & Projects Advice (LinkedIn experiences)' },
]
const EXPERTISE_OTHER = { value: 'other', label: '✦  Other Expertise' }

export function StepGoals({ visible, onBack, onSubmit }: StepGoalsProps) {
  const role = useWizardStore((s) => s.role)
  const courses = useWizardStore((s) => s.courses)
  const otherSelectedCourses = useWizardStore((s) => s.otherSelectedCourses)
  const confidence = useWizardStore((s) => s.confidence)
  const setConfidence = useWizardStore((s) => s.setConfidence)
  const goals = useWizardStore((s) => s.goals)
  const toggleGoal = useWizardStore((s) => s.toggleGoal)
  const expertise = useWizardStore((s) => s.expertise)
  const toggleExpertise = useWizardStore((s) => s.toggleExpertise)
  const userQuery = useWizardStore((s) => s.userQuery)
  const setUserQuery = useWizardStore((s) => s.setUserQuery)
  const { stepClassName } = useStepShell(visible)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const isSenior = role === 'senior'

  const checkedCourses = useMemo(
    () => [...courses, ...Array.from(otherSelectedCourses)],
    [courses, otherSelectedCourses],
  )
  const placeholder = useMemo(
    () => getUserQueryPlaceholder(role ?? 'student', checkedCourses),
    [role, checkedCourses],
  )

  const sliderPct = ((confidence - 1) / (10 - 1)) * 100
  const sliderBackground = `linear-gradient(to right, var(--accent) 0%, var(--accent) ${sliderPct}%, var(--border-ink) ${sliderPct}%)`

  function handleOtherToggle(checked: boolean) {
    if (isSenior) {
      toggleExpertise(EXPERTISE_OTHER.value)
    } else {
      toggleGoal(GOAL_OTHER.value)
    }
    if (checked) textareaRef.current?.focus()
  }

  const title = isSenior ? 'Last step — how can you help?' : 'Future Prospects — share your plans with us.'
  const hint = isSenior
    ? "Your experience is gold. Tell us what you're best at."
    : 'The more context you give, the more precise your guide will be.'
  const goalLabel = isSenior
    ? 'What kind of guidance can you offer?'
    : 'What do you want to achieve through this / these course(s)?'
  const textareaLabel = isSenior ? 'Any specific tips you want to share right away?' : 'Anything specific on your mind?'
  const submitLabel = isSenior ? 'Save My Experience to the Hive →' : 'Map My Quarter →'

  return (
    <div className={stepClassName} id="step-3">
      <p className="step-question">{title}</p>
      <p className="step-hint">{hint}</p>

      {!isSenior && (
        <div className="field-block" id="slider-block">
          <label className="field-label">
            Current confidence level
            <span className="slider-value">{confidence.toFixed(1)} / 10</span>
          </label>
          <div className="slider-wrap">
            <span className="slider-edge">Just starting</span>
            <input
              type="range"
              min={1}
              max={10}
              step={0.5}
              value={confidence}
              onChange={(e) => setConfidence(parseFloat(e.target.value))}
              style={{ background: sliderBackground }}
            />
            <span className="slider-edge">Very confident</span>
          </div>
        </div>
      )}

      <div className="field-block">
        <label className="field-label">{goalLabel}</label>
        <p className="step-hint" style={{ marginBottom: 14 }}>
          Select all that apply.
        </p>

        <div className="goal-grid">
          {(isSenior ? EXPERTISE_OPTIONS : GOAL_OPTIONS).map((opt) => {
            const checked = isSenior ? expertise.includes(opt.value) : goals.includes(opt.value)
            return (
              <label key={opt.value} className={`goal-chip${checked ? ' selected' : ''}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => (isSenior ? toggleExpertise(opt.value) : toggleGoal(opt.value))}
                />
                <span>{opt.label}</span>
              </label>
            )
          })}
          {(() => {
            const other = isSenior ? EXPERTISE_OTHER : GOAL_OTHER
            const checked = isSenior ? expertise.includes(other.value) : goals.includes(other.value)
            return (
              <label className={`goal-chip goal-chip-other${checked ? ' selected' : ''}`}>
                <input type="checkbox" checked={checked} onChange={(e) => handleOtherToggle(e.target.checked)} />
                <span>{other.label}</span>
              </label>
            )
          })()}
        </div>
      </div>

      <div className="field-block">
        <label className="field-label" htmlFor="user_query">
          {textareaLabel} <span className="optional">(optional)</span>
        </label>
        <textarea
          ref={textareaRef}
          id="user_query"
          rows={4}
          placeholder={placeholder}
          value={userQuery}
          onChange={(e) => setUserQuery(e.target.value)}
        />
      </div>

      <div className="nav-row">
        <button type="button" className="btn-back" onClick={onBack}>
          ← Back
        </button>
        <button type="button" className="btn-submit" onClick={onSubmit}>
          {submitLabel}
        </button>
      </div>
    </div>
  )
}
