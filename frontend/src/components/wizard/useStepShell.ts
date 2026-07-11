import { useEffect, useRef, useState } from 'react'

export function useStepShell(visible: boolean) {
  const [slideIn, setSlideIn] = useState(false)
  const [shaking, setShaking] = useState(false)
  const prevVisible = useRef(visible)

  useEffect(() => {
    if (visible && !prevVisible.current) {
      setSlideIn(true)
      const t = setTimeout(() => setSlideIn(false), 400)
      prevVisible.current = visible
      return () => clearTimeout(t)
    }
    prevVisible.current = visible
  }, [visible])

  function triggerShake() {
    setShaking(true)
    setTimeout(() => setShaking(false), 500)
  }

  const stepClassName = ['step', !visible && 'hidden', slideIn && 'slide-in', shaking && 'shake']
    .filter(Boolean)
    .join(' ')

  return { stepClassName, triggerShake }
}
