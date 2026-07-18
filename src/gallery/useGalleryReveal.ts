import { useEffect, type RefObject } from 'react'

export function useGalleryReveal(container: RefObject<HTMLElement | null>, dependency: unknown) {
  useEffect(() => {
    const root = container.current
    if (!root) return
    const elements = Array.from(root.querySelectorAll<HTMLElement>('[data-gallery-reveal]'))
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
      elements.forEach((element) => element.classList.add('is-visible'))
      return
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        entry.target.classList.add('is-visible')
        observer.unobserve(entry.target)
      })
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 })
    elements.forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [container, dependency])
}
