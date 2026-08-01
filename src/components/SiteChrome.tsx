import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ThemeSwitcher } from './ThemeSwitcher'

const HOME_SECTIONS = ['top', 'articles', 'web', 'contact'] as const
type HomeSection = (typeof HOME_SECTIONS)[number]

export function Arrow() {
  return <span aria-hidden="true">↗</span>
}

export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <img src="/avatar.jpg" alt="" />
    </span>
  )
}

type SiteHeaderProps = {
  compact?: boolean
}

export function SiteHeader({ compact = false }: SiteHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeSection, setActiveSection] = useState<HomeSection | ''>('')
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const location = useLocation()

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname, location.hash])

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && menuOpen) {
        setMenuOpen(false)
        window.requestAnimationFrame(() => menuButtonRef.current?.focus())
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [menuOpen])

  useEffect(() => {
    if (location.pathname !== '/') {
      setActiveSection('')
      return
    }

    const sections = HOME_SECTIONS
      .map((id) => document.getElementById(id))
      .filter((section): section is HTMLElement => section !== null)
    if (sections.length === 0) return

    let frame = 0
    const update = () => {
      frame = 0
      const marker = window.scrollY + Math.min(window.innerHeight * 0.32, 260)
      let current: HomeSection | '' = ''
      sections.forEach((section) => {
        const sectionTop = section.getBoundingClientRect().top + window.scrollY
        if (sectionTop <= marker) current = section.id as HomeSection
      })
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 8) {
        current = 'contact'
      }
      setActiveSection((previous) => previous === current ? previous : current)
    }
    const scheduleUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', scheduleUpdate, { passive: true })
    window.addEventListener('resize', scheduleUpdate)
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      window.removeEventListener('scroll', scheduleUpdate)
      window.removeEventListener('resize', scheduleUpdate)
    }
  }, [location.pathname])

  const articlePageActive = location.pathname.startsWith('/articles')
    || (location.pathname === '/' && activeSection === 'articles')
  const galleryPageActive = location.pathname.startsWith('/gallery')
  const projectsPageActive = location.pathname.startsWith('/projects')
  const homeSectionProps = (section: HomeSection) => {
    const active = location.pathname === '/' && activeSection === section
    return {
      className: active ? 'is-active' : undefined,
      'aria-current': active ? 'location' as const : undefined,
    }
  }

  return (
    <header className={`site-header${compact ? ' site-header--compact' : ''}`}>
      <div className="masthead">
        <Link className="brand" to="/" aria-label="ZongRui 首页">
          <BrandMark />
          <span className="brand-copy">
            <strong>ZongRui</strong>
            <small>Rust · RoboMaster · Linux</small>
          </span>
        </Link>
        <div className="masthead-actions">
          <ThemeSwitcher className="masthead-theme-switcher" />
          <a className="masthead-github" href="https://github.com/zongruichd" target="_blank" rel="noreferrer">
            GitHub <Arrow />
          </a>
        </div>
        <button
          ref={menuButtonRef}
          className="menu-button"
          type="button"
          aria-expanded={menuOpen}
          aria-controls="site-navigation"
          aria-label={menuOpen ? '关闭导航菜单' : '打开导航菜单'}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>

      <nav id="site-navigation" className={`site-nav${menuOpen ? ' is-open' : ''}`} aria-label="主导航">
        <div className="site-nav__inner">
          <div className="site-nav__modes">
            <Link className={articlePageActive ? 'is-active' : undefined} to="/articles" aria-current={articlePageActive ? 'page' : undefined}>
              文章
            </Link>
            <a href="/#web" {...homeSectionProps('web')}>网页与故事</a>
            <a href="/#contact" {...homeSectionProps('contact')}>联系方式</a>
            <Link className={galleryPageActive ? 'is-active' : undefined} to="/gallery" aria-current={galleryPageActive ? 'page' : undefined}>
              图片
            </Link>
            <Link className={projectsPageActive ? 'is-active' : undefined} to="/projects" aria-current={projectsPageActive ? 'page' : undefined}>
              技术作品
            </Link>
          </div>
        </div>
      </nav>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="footer-brand">
          <BrandMark />
          <div>
            <strong>ZongRui</strong>
            <span>Rust、机器人和最近在折腾的东西。</span>
          </div>
        </div>
        <div className="footer-links">
          <Link to="/articles">文章</Link>
          <Link to="/gallery">图片</Link>
          <Link to="/projects">技术作品</Link>
          <a href="https://github.com/zongruichd" target="_blank" rel="noreferrer">GitHub</a>
          <a href="https://zongtech.xyz" target="_blank" rel="noreferrer">ZongTech</a>
          <a href="https://2022314.xyz" target="_blank" rel="noreferrer">2022314</a>
          <a href="https://t.me/zongruichd" target="_blank" rel="noreferrer">Telegram</a>
          <a href="https://x.com/zongruichd" target="_blank" rel="noreferrer">X</a>
        </div>
        <div className="footer-meta" data-privacy="network-counter">
          <span>© {new Date().getFullYear()} ZongRui</span>
          <span>No ads. No cross-site tracking. Privacy-preserving network counters.</span>
          <span>
            Typography: JetBrains Mono · HarmonyOS Sans SC ·{' '}
            <a href="/assets/HarmonyOS-Sans-LICENSE.txt">License</a>
          </span>
          <span>
            Visual credits:{' '}
            <a href="https://github.com/AlchemicRonin/-STM32-RoboMaster-/blob/master/2019%20XJTLU%20Infantry/XJTLU%20Infantry.gif" target="_blank" rel="noreferrer">XJTLU Infantry — Alchemic Ronin</a>
            {' / '}
            <a href="/assets/XJTLU-INFANTRY-LICENSE.txt">MIT</a>
            {' · '}
            <a href="https://commons.wikimedia.org/wiki/File:Rust_programming_language_black_logo.svg" target="_blank" rel="noreferrer">Rust logo — Rust Foundation / CC BY 4.0</a>
          </span>
          <a href="#top">返回顶部 ↑</a>
        </div>
      </div>
    </footer>
  )
}

export function SitePage({
  children,
  compactHeader = false,
}: {
  children: ReactNode
  compactHeader?: boolean
}) {
  return (
    <>
      <a className="skip-link" href="#main-content">跳到主要内容</a>
      <SiteHeader compact={compactHeader} />
      {children}
      <SiteFooter />
    </>
  )
}
