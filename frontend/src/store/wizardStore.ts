import { create } from 'zustand'

import type { Role } from '@/types'

interface WizardState {
  currentStep: number
  role: Role | null
  courses: string[]
  otherSelectedCourses: Set<string>
  confidence: number
  goals: string[]
  expertise: string[]
  userQuery: string
  setCurrentStep: (step: number) => void
  setRole: (role: Role) => void
  toggleCourse: (code: string) => void
  addOtherCourse: (code: string) => void
  removeOtherCourse: (code: string) => void
  setConfidence: (value: number) => void
  toggleGoal: (value: string) => void
  toggleExpertise: (value: string) => void
  setUserQuery: (value: string) => void
  reset: () => void
}

function toggleInArray(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

const initialFields = {
  currentStep: 1,
  role: null,
  courses: [],
  confidence: 5,
  goals: [],
  expertise: [],
  userQuery: '',
} satisfies Partial<WizardState>

export const useWizardStore = create<WizardState>()((set) => ({
  ...initialFields,
  otherSelectedCourses: new Set<string>(),
  setCurrentStep: (step) => set({ currentStep: step }),
  setRole: (role) => set({ role, userQuery: '' }),
  toggleCourse: (code) => set((s) => ({ courses: toggleInArray(s.courses, code) })),
  addOtherCourse: (code) =>
    set((s) => ({ otherSelectedCourses: new Set(s.otherSelectedCourses).add(code) })),
  removeOtherCourse: (code) =>
    set((s) => {
      const next = new Set(s.otherSelectedCourses)
      next.delete(code)
      return { otherSelectedCourses: next }
    }),
  setConfidence: (value) => set({ confidence: value }),
  toggleGoal: (value) => set((s) => ({ goals: toggleInArray(s.goals, value) })),
  toggleExpertise: (value) => set((s) => ({ expertise: toggleInArray(s.expertise, value) })),
  setUserQuery: (value) => set({ userQuery: value }),
  reset: () => set({ ...initialFields, otherSelectedCourses: new Set<string>() }),
}))
