import { useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'

import { GuideCard } from '@/components/result/GuideCard'
import { AtomLoader } from '@/components/ui/AtomLoader'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { StepCourses } from '@/components/wizard/StepCourses'
import { StepGoals } from '@/components/wizard/StepGoals'
import { StepIdentity } from '@/components/wizard/StepIdentity'
import { getGuideErrorMessage, useGuide } from '@/hooks/useGuide'
import { AdminContributionsPage } from '@/pages/AdminContributionsPage'
import { ContributePage } from '@/pages/ContributePage'
import { GuideDetailPage } from '@/pages/GuideDetailPage'
import { GuideHistoryPage } from '@/pages/GuideHistoryPage'
import { LoginPage } from '@/pages/LoginPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { useAuthStore } from '@/store/authStore'
import { useWizardStore } from '@/store/wizardStore'
import type { GuideRequest } from '@/types'

const queryClient = new QueryClient()

function Wizard() {
  const currentStep = useWizardStore((s) => s.currentStep)
  const setCurrentStep = useWizardStore((s) => s.setCurrentStep)
  const role = useWizardStore((s) => s.role)
  const courses = useWizardStore((s) => s.courses)
  const otherSelectedCourses = useWizardStore((s) => s.otherSelectedCourses)
  const confidence = useWizardStore((s) => s.confidence)
  const goals = useWizardStore((s) => s.goals)
  const expertise = useWizardStore((s) => s.expertise)
  const userQuery = useWizardStore((s) => s.userQuery)
  const resetWizard = useWizardStore((s) => s.reset)

  const { mutate, data, isPending, isError, error, reset: resetMutation } = useGuide()

  useEffect(() => {
    if (isPending) {
      document.querySelector('.atom-loader')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [isPending])

  useEffect(() => {
    if (!data) return
    const t = setTimeout(() => {
      document.getElementById('aafResult')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
    return () => clearTimeout(t)
  }, [data])

  function handleSubmit() {
    if (!role) return
    const req: GuideRequest = {
      role,
      courses: [...courses, ...Array.from(otherSelectedCourses)],
      confidence,
      goals: role === 'senior' ? expertise : goals,
      user_query: userQuery.trim() || null,
    }
    mutate(req)
  }

  function handleReset() {
    resetMutation()
    resetWizard()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (data && role) {
    return <GuideCard guideId={data.guide_id} markdown={data.guide_markdown} role={role} onReset={handleReset} />
  }

  return (
    <>
      <ProgressBar currentStep={currentStep} />

      <div>
        <StepIdentity visible={currentStep === 1 && !isPending && !isError} onNext={() => setCurrentStep(2)} />
        <StepCourses
          visible={currentStep === 2 && !isPending && !isError}
          onBack={() => setCurrentStep(1)}
          onNext={() => setCurrentStep(3)}
        />
        <StepGoals
          visible={currentStep === 3 && !isPending && !isError}
          onBack={() => setCurrentStep(2)}
          onSubmit={handleSubmit}
        />
      </div>

      <AtomLoader active={isPending} />

      {isError && (
        <div className="ai-response-wrap" id="aafResult" style={{ display: 'block' }}>
          <div className="ai-response-body" id="aafBody">
            <p style={{ fontWeight: 700, color: '#c0392b', marginBottom: 12 }}>⚠️ {getGuideErrorMessage(error)}</p>
            <button
              type="button"
              onClick={() => resetMutation()}
              style={{
                marginTop: 16,
                padding: '10px 22px',
                background: '#86351C',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              ← Try Again
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function WizardPage() {
  return (
    <div className="container">
      <div className="header-group">
        <div className="badge">✦ Infinite possibility ahead</div>
        <h1 className="english-title">
          <span className="uci-blue">ACING YOUR</span> <span className="uci-gold">FUTURE</span>
        </h1>
        <p className="subtitle-main">Let's get you started.</p>
        <p className="subtitle">Tell us where you are so we can guide you better.</p>
      </div>

      <Wizard />
    </div>
  )
}

function RequireAuth() {
  const isAuthenticated = useAuthStore((s) => !!s.accessToken)
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }
  return <Outlet />
}

function RedirectIfAuthed() {
  const isAuthenticated = useAuthStore((s) => !!s.accessToken)

  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }
  return <Outlet />
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<RedirectIfAuthed />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Route>

          <Route element={<RequireAuth />}>
            <Route path="/" element={<WizardPage />} />
            <Route path="/history" element={<GuideHistoryPage />} />
            <Route path="/guide/:id" element={<GuideDetailPage />} />
            <Route path="/contribute" element={<ContributePage />} />
            <Route path="/admin/contributions" element={<AdminContributionsPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
