interface ProgressBarProps {
  currentStep: number
}

const TOTAL = 3

const STEP_LABELS = ['① Identity', '② Your Courses', '③ Your Goals']

export function ProgressBar({ currentStep }: ProgressBarProps) {
  const fillPct = ((currentStep - 1) / (TOTAL - 1)) * 100

  return (
    <div className="progress-wrap">
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${fillPct}%` }} />
      </div>
      <div className="step-labels">
        {STEP_LABELS.map((label, i) => (
          <span key={label} className={`step-label${i + 1 <= currentStep ? ' active' : ''}`}>
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}
