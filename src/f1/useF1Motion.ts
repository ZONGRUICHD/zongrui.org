import { useLayoutEffect, useRef, type RefObject } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger, useGSAP)

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

export function useF1PageMotion(scope: RefObject<HTMLElement | null>, refreshKey: unknown = '') {
  useGSAP(() => {
    const root = scope.current
    if (!root) return
    const heroLines = Array.from(root.querySelectorAll<HTMLElement>('[data-f1-hero-line]'))
    const heroMedia = Array.from(root.querySelectorAll<HTMLElement>('[data-f1-media]'))
    const heroRules = Array.from(root.querySelectorAll<HTMLElement>('[data-f1-hero-rule]'))
    const revealElements = Array.from(root.querySelectorAll<HTMLElement>('[data-f1-reveal]'))

    if (window.matchMedia(REDUCED_MOTION_QUERY).matches) {
      const reducedTargets = [...revealElements, ...heroLines, ...heroMedia]
      if (reducedTargets.length > 0) {
        gsap.set(reducedTargets, { clearProps: 'all', autoAlpha: 1 })
      }
      return
    }

    const heroTimeline = gsap.timeline({ defaults: { ease: 'power4.out' } })
    if (heroLines.length > 0) {
      heroTimeline.fromTo(heroLines, { yPercent: 115, rotate: 1.5 }, {
        yPercent: 0,
        rotate: 0,
        duration: 0.95,
        stagger: 0.08,
      })
    }
    if (heroMedia.length > 0) {
      heroTimeline.fromTo(heroMedia, { scale: 1.09, autoAlpha: 0 }, {
        scale: 1,
        autoAlpha: 1,
        duration: 1.05,
        stagger: 0.08,
      }, 0.16)
    }
    if (heroRules.length > 0) {
      heroTimeline.fromTo(heroRules, { scaleX: 0 }, {
        scaleX: 1,
        duration: 0.8,
        transformOrigin: 'left center',
      }, 0.22)
    }

    if (revealElements.length > 0) {
      gsap.set(revealElements, { y: 46, autoAlpha: 0 })
      ScrollTrigger.batch(revealElements, {
        start: 'top 88%',
        once: true,
        onEnter: (elements) => {
          gsap.to(elements, {
            y: 0,
            autoAlpha: 1,
            duration: 0.72,
            stagger: 0.055,
            ease: 'power3.out',
            clearProps: 'transform',
          })
        },
      })
    }

    const parallaxMedia = gsap.utils.toArray<HTMLElement>('[data-f1-parallax]', root)
    if (window.matchMedia('(min-width: 900px) and (pointer: fine)').matches) {
      parallaxMedia.forEach((element) => {
        gsap.fromTo(element, { yPercent: -4 }, {
          yPercent: 4,
          ease: 'none',
          scrollTrigger: {
            trigger: element,
            start: 'top bottom',
            end: 'bottom top',
            scrub: 0.7,
          },
        })
      })
    }

    document.fonts?.ready.then(() => ScrollTrigger.refresh())
  }, { scope, dependencies: [refreshKey], revertOnUpdate: true })
}

export function useF1ScrollProgress() {
  const progressRef = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const progress = progressRef.current
    if (!progress) return

    let frame = 0
    const update = () => {
      frame = 0
      const maximum = Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
      progress.style.transform = `scaleX(${Math.min(1, Math.max(0, window.scrollY / maximum))})`
    }
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [])

  return progressRef
}

export function useF1StartSequence() {
  const overlayRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const overlay = overlayRef.current
    if (!overlay) return
    const reduceMotion = window.matchMedia(REDUCED_MOTION_QUERY).matches
    let alreadyPlayed = false
    try {
      alreadyPlayed = window.sessionStorage.getItem('zongrui-f1-started') === '1'
    } catch {
      // The start sequence still works when storage is unavailable.
    }
    if (reduceMotion || alreadyPlayed) {
      overlay.hidden = true
      return
    }

    try {
      window.sessionStorage.setItem('zongrui-f1-started', '1')
    } catch {
      // Privacy modes may disable session storage.
    }
    const lamps = overlay.querySelectorAll('.f1-start__lamp')
    const timeline = gsap.timeline({
      onComplete: () => {
        overlay.hidden = true
      },
    })
    timeline
      .set(overlay, { autoAlpha: 1 })
      .to(lamps, { backgroundColor: '#ff1801', boxShadow: '0 0 28px rgba(255,24,1,.9)', duration: 0.12, stagger: 0.1 })
      .to(lamps, { backgroundColor: '#111', boxShadow: 'none', duration: 0.05 }, '+=0.1')
      .to(overlay, { xPercent: 110, duration: 0.48, ease: 'power4.inOut' }, '+=0.03')
    return () => {
      timeline.kill()
    }
  }, [])

  return overlayRef
}
