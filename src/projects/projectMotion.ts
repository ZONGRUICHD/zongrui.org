import { useEffect, type PointerEvent } from 'react'

type PointerFrame = {
  frame: number
  pointerX: number
  pointerY: number
  tiltX: number
  tiltY: number
}

const pointerFrames = new WeakMap<HTMLElement, PointerFrame>()
let finePointerQuery: MediaQueryList | null = null
let motionPreferenceQuery: MediaQueryList | null = null

function pointerMediaQueries() {
  if (typeof window === 'undefined') return null
  finePointerQuery ??= window.matchMedia('(pointer: fine)')
  motionPreferenceQuery ??= window.matchMedia('(prefers-reduced-motion: no-preference)')
  return { finePointer: finePointerQuery, motionPreference: motionPreferenceQuery }
}

function pointerMotionAllowed() {
  const queries = pointerMediaQueries()
  return Boolean(queries?.finePointer.matches && queries.motionPreference.matches)
}

function clearPointerMotion(element: HTMLElement, removePosition = true) {
  const pending = pointerFrames.get(element)
  if (pending) window.cancelAnimationFrame(pending.frame)
  pointerFrames.delete(element)
  element.style.removeProperty('--project-tilt-x')
  element.style.removeProperty('--project-tilt-y')
  if (removePosition) {
    element.style.removeProperty('--project-pointer-x')
    element.style.removeProperty('--project-pointer-y')
  }
}

function schedulePointerFrame(
  element: HTMLElement,
  next: Omit<PointerFrame, 'frame'>,
) {
  const pending = pointerFrames.get(element)
  if (pending) {
    pending.pointerX = next.pointerX
    pending.pointerY = next.pointerY
    pending.tiltX = next.tiltX
    pending.tiltY = next.tiltY
    return
  }

  const state: PointerFrame = { frame: 0, ...next }
  state.frame = window.requestAnimationFrame(() => {
    pointerFrames.delete(element)
    element.style.setProperty('--project-pointer-x', `${state.pointerX}%`)
    element.style.setProperty('--project-pointer-y', `${state.pointerY}%`)
    element.style.setProperty('--project-tilt-x', `${state.tiltX}deg`)
    element.style.setProperty('--project-tilt-y', `${state.tiltY}deg`)
  })
  pointerFrames.set(element, state)
}

export function useProjectReveals() {
  useEffect(() => {
    const targets = Array.from(document.querySelectorAll<HTMLElement>('[data-project-reveal]'))
    const pointerTargets = Array.from(document.querySelectorAll<HTMLElement>('.project-index-card'))
    const queries = pointerMediaQueries()
    if (!queries) return
    const { finePointer, motionPreference } = queries
    let observer: IntersectionObserver | null = null

    if (!motionPreference.matches || !('IntersectionObserver' in window)) {
      targets.forEach((target) => target.classList.add('is-project-visible'))
    } else {
      observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          entry.target.classList.add('is-project-visible')
          observer?.unobserve(entry.target)
        })
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 })

      targets.forEach((target) => observer?.observe(target))
    }

    const handleMotionPreference = () => {
      if (motionPreference.matches) return
      observer?.disconnect()
      observer = null
      targets.forEach((target) => target.classList.add('is-project-visible'))
      pointerTargets.forEach((target) => clearPointerMotion(target))
    }

    const handlePointerCapability = () => {
      if (finePointer.matches && motionPreference.matches) return
      pointerTargets.forEach((target) => clearPointerMotion(target))
    }

    motionPreference.addEventListener('change', handleMotionPreference)
    finePointer.addEventListener('change', handlePointerCapability)

    return () => {
      observer?.disconnect()
      motionPreference.removeEventListener('change', handleMotionPreference)
      finePointer.removeEventListener('change', handlePointerCapability)
      pointerTargets.forEach((target) => clearPointerMotion(target))
    }
  }, [])
}

export function moveProjectCard(event: PointerEvent<HTMLElement>) {
  const element = event.currentTarget
  if (event.pointerType === 'touch' || !pointerMotionAllowed()) {
    clearPointerMotion(element)
    return
  }

  const bounds = element.getBoundingClientRect()
  if (bounds.width === 0 || bounds.height === 0) return
  const x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width))
  const y = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height))
  schedulePointerFrame(element, {
    pointerX: x * 100,
    pointerY: y * 100,
    tiltX: (0.5 - y) * 3,
    tiltY: (x - 0.5) * 3,
  })
}

export function resetProjectCard(event: PointerEvent<HTMLElement>) {
  const element = event.currentTarget
  if (!pointerMotionAllowed()) {
    clearPointerMotion(element)
    return
  }

  const pending = pointerFrames.get(element)
  schedulePointerFrame(element, {
    pointerX: pending?.pointerX ?? 50,
    pointerY: pending?.pointerY ?? 50,
    tiltX: 0,
    tiltY: 0,
  })
}
