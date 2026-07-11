import { useWizardStore } from '@/store/wizardStore'
import type { Role } from '@/types'

import { useStepShell } from './useStepShell'

interface StepIdentityProps {
  visible: boolean
  onNext: () => void
}

export function StepIdentity({ visible, onNext }: StepIdentityProps) {
  const role = useWizardStore((s) => s.role)
  const setRole = useWizardStore((s) => s.setRole)
  const { stepClassName, triggerShake } = useStepShell(visible)

  function cardClassName(cardRole: Role) {
    if (role === cardRole) return 'role-card selected'
    if (role) return 'role-card dimmed'
    return 'role-card'
  }

  function handleNext() {
    if (!role) {
      triggerShake()
      return
    }
    onNext()
  }

  return (
    <div className={stepClassName} id="step-1">
      <p className="step-question">First, who are you?</p>
      <p className="step-hint">Pick the one that fits — we'll tailor everything from here.</p>

      <div className="role-grid">
        <label className={cardClassName('student')}>
          <input
            type="radio"
            name="role"
            value="student"
            checked={role === 'student'}
            onChange={() => setRole('student')}
            required
          />
          <div className="check-badge">
            <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
              <path
                d="M1 5L4.5 8.5L11 1"
                stroke="white"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div className="role-card-inner">
            <div className="role-icon">📚</div>
            <div className="role-title">Ready to Go</div>
            <div className="role-desc">
              I'm taking or planning to take these courses and want to make the most out of them.
            </div>
            <div className="role-micro">New here? Start with guidance.</div>
          </div>
        </label>

        <label className={cardClassName('senior')}>
          <input
            type="radio"
            name="role"
            value="senior"
            checked={role === 'senior'}
            onChange={() => setRole('senior')}
          />
          <div className="check-badge">
            <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
              <path
                d="M1 5L4.5 8.5L11 1"
                stroke="white"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div className="role-card-inner">
            <div className="role-icon">🎓</div>
            <div className="role-title">On the Road</div>
            <div className="role-desc">I've completed these courses and want to help others succeed.</div>
            <div className="role-micro">
              Want to give back? Share your experience.
              <br />
              <span style={{ color: 'var(--accent)', fontWeight: 600, display: 'inline-block', marginTop: 6 }}>
                💼 Unlock benefits: Resume referrals & review. LLMs credits...
              </span>
            </div>
          </div>
        </label>
      </div>

      <div className="nav-row justify-end">
        <button type="button" className="btn-next" onClick={handleNext}>
          Get Started <span className="arrow">→</span>
        </button>
      </div>
    </div>
  )
}
