import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import type { RefObject } from 'react'

gsap.registerPlugin(useGSAP, ScrollTrigger)

type MotionConditions = {
  motionOK?: boolean
  finePointer?: boolean
}

export function useHomeMotion(scope: RefObject<HTMLElement | null>) {
  useGSAP(() => {
    const root = scope.current
    if (!root) return

    const media = gsap.matchMedia()
    const refresh = () => ScrollTrigger.refresh()
    let refreshFrame = 0
    const scheduleRefresh = () => {
      window.cancelAnimationFrame(refreshFrame)
      refreshFrame = window.requestAnimationFrame(refresh)
    }

    media.add(
      {
        motionOK: '(prefers-reduced-motion: no-preference)',
        finePointer: '(hover: hover) and (pointer: fine)',
      },
      (context) => {
        const { motionOK, finePointer } = context.conditions as MotionConditions
        const cleanups: Array<() => void> = []

        if (!motionOK) {
          gsap.set(root.querySelectorAll('[data-hero-enter], [data-scroll-reveal], [data-motion-wall], .motion-line'), {
            clearProps: 'all',
          })
          return undefined
        }

        const hero = root.querySelector<HTMLElement>('.hero')
        const heroProfile = root.querySelector<HTMLElement>('[data-hero-enter="profile"]')
        if (hero && heroProfile) {
          gsap.timeline({ defaults: { ease: 'power3.out' } })
            .fromTo(hero, { autoAlpha: 0.94 }, { autoAlpha: 1, duration: 1.25 })
            .fromTo(
              heroProfile,
              { autoAlpha: 0, x: -56, rotateY: -7, transformPerspective: 900 },
              { autoAlpha: 1, x: 0, rotateY: 0, duration: 1.05 },
              0.12,
            )
            .fromTo(
              heroProfile.querySelectorAll('img, h1, p'),
              { autoAlpha: 0, y: 26 },
              { autoAlpha: 1, y: 0, duration: 0.75, stagger: 0.09 },
              0.24,
            )
        }

        const initTilt = (element: HTMLElement) => {
          if (!finePointer || element.dataset.tiltReady === 'true') return
          element.dataset.tiltReady = 'true'
          const rotateX = gsap.quickTo(element, 'rotationX', { duration: 0.5, ease: 'power3.out' })
          const rotateY = gsap.quickTo(element, 'rotationY', { duration: 0.5, ease: 'power3.out' })
          const moveX = gsap.quickTo(element, 'x', { duration: 0.5, ease: 'power3.out' })
          const moveY = gsap.quickTo(element, 'y', { duration: 0.5, ease: 'power3.out' })
          let frame = 0
          let latestEvent: PointerEvent | null = null

          const render = () => {
            frame = 0
            if (!latestEvent) return
            const bounds = element.getBoundingClientRect()
            const horizontal = (latestEvent.clientX - bounds.left) / bounds.width - 0.5
            const vertical = (latestEvent.clientY - bounds.top) / bounds.height - 0.5
            rotateX(vertical * -4.5)
            rotateY(horizontal * 5.5)
            moveX(horizontal * 5)
            moveY(vertical * 5)
          }
          const move = (event: PointerEvent) => {
            latestEvent = event
            if (!frame) frame = window.requestAnimationFrame(render)
          }
          const leave = () => {
            latestEvent = null
            window.cancelAnimationFrame(frame)
            frame = 0
            rotateX(0)
            rotateY(0)
            moveX(0)
            moveY(0)
          }

          element.addEventListener('pointermove', move)
          element.addEventListener('pointerleave', leave)
          cleanups.push(() => {
            window.cancelAnimationFrame(frame)
            element.removeEventListener('pointermove', move)
            element.removeEventListener('pointerleave', leave)
            delete element.dataset.tiltReady
          })
        }

        root.querySelectorAll<HTMLElement>('[data-pointer-tilt]:not([data-motion-wall])').forEach(initTilt)

        const animateNewWalls = () => {
          const walls = Array.from(root.querySelectorAll<HTMLElement>('[data-motion-wall]:not([data-motion-animated])'))
          if (!walls.length) return
          walls.forEach((wall) => { wall.dataset.motionAnimated = 'true' })
          gsap.fromTo(
            walls,
            {
              autoAlpha: 0,
              x: (index) => 92 + index * 28,
              y: (index) => index * 20,
              rotateY: -5,
              transformPerspective: 1100,
            },
            {
              autoAlpha: 1,
              x: 0,
              y: 0,
              rotateY: 0,
              duration: 1.05,
              stagger: 0.16,
              ease: 'power3.out',
              onComplete: () => {
                walls.forEach(initTilt)
                scheduleRefresh()
              },
            },
          )
        }

        animateNewWalls()
        const wallRoot = root.querySelector('.hero-activity') ?? root
        const wallObserver = new MutationObserver(animateNewWalls)
        wallObserver.observe(wallRoot, { childList: true, subtree: true })
        cleanups.push(() => wallObserver.disconnect())

        root.querySelectorAll<HTMLElement>('[data-scroll-reveal]').forEach((section, index) => {
          const children = section.querySelectorAll<HTMLElement>('[data-reveal-item]')
          const targets = children.length ? children : [section]
          gsap.fromTo(
            targets,
            { autoAlpha: 0, y: 58 },
            {
              autoAlpha: 1,
              y: 0,
              duration: 0.95,
              stagger: 0.1,
              ease: 'power3.out',
              scrollTrigger: {
                trigger: section,
                start: 'clamp(top 84%)',
                once: true,
                refreshPriority: index + 1,
              },
            },
          )
        })

        root.querySelectorAll<HTMLElement>('.motion-line').forEach((line, index) => {
          gsap.fromTo(
            line,
            { scaleX: 0, transformOrigin: line.dataset.lineOrigin ?? 'left center' },
            {
              scaleX: 1,
              ease: 'none',
              scrollTrigger: {
                trigger: line,
                start: 'clamp(top 92%)',
                end: 'clamp(top 52%)',
                scrub: 0.55,
                refreshPriority: index + 10,
              },
            },
          )
        })

        root.querySelectorAll<HTMLElement>('[data-scroll-drift]').forEach((element, index) => {
          gsap.fromTo(
            element,
            { yPercent: -9 - index * 2 },
            {
              yPercent: 10 + index * 2,
              ease: 'none',
              scrollTrigger: {
                trigger: element.closest('section') ?? element,
                start: 'top bottom',
                end: 'bottom top',
                scrub: 1.2,
              },
            },
          )
        })

        if (finePointer) {
          root.querySelectorAll<HTMLElement>('[data-pointer-surface]').forEach((surface) => {
            let frame = 0
            let latestEvent: PointerEvent | null = null
            const render = () => {
              frame = 0
              if (!latestEvent) return
              const bounds = surface.getBoundingClientRect()
              const x = ((latestEvent.clientX - bounds.left) / bounds.width) * 100
              const y = ((latestEvent.clientY - bounds.top) / bounds.height) * 100
              surface.style.setProperty('--pointer-x', `${x.toFixed(2)}%`)
              surface.style.setProperty('--pointer-y', `${y.toFixed(2)}%`)
            }
            const move = (event: PointerEvent) => {
              latestEvent = event
              if (!frame) frame = window.requestAnimationFrame(render)
            }
            const leave = () => {
              latestEvent = null
              window.cancelAnimationFrame(frame)
              frame = 0
              surface.style.setProperty('--pointer-x', '50%')
              surface.style.setProperty('--pointer-y', '50%')
            }
            surface.addEventListener('pointermove', move)
            surface.addEventListener('pointerleave', leave)
            cleanups.push(() => {
              window.cancelAnimationFrame(frame)
              surface.removeEventListener('pointermove', move)
              surface.removeEventListener('pointerleave', leave)
            })
          })
        }

        gsap.to(root.querySelectorAll('[data-ambient-float]'), {
          y: (index) => (index % 2 === 0 ? -18 : 22),
          x: (index) => (index % 2 === 0 ? 12 : -10),
          duration: (index) => 6 + index * 1.4,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut',
          stagger: 0.35,
        })

        return () => cleanups.forEach((cleanup) => cleanup())
      },
    )

    const imageListeners: Array<() => void> = []
    root.querySelectorAll<HTMLImageElement>('img').forEach((image) => {
      if (image.complete) return
      image.addEventListener('load', scheduleRefresh, { once: true })
      imageListeners.push(() => image.removeEventListener('load', scheduleRefresh))
    })
    document.fonts?.ready.then(scheduleRefresh).catch(() => undefined)

    return () => {
      imageListeners.forEach((cleanup) => cleanup())
      window.cancelAnimationFrame(refreshFrame)
      media.revert()
    }
  }, { scope })
}
