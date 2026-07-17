import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ThemeSwitcher } from './ThemeSwitcher'

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
  const location = useLocation()

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname, location.hash])

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [])

  const articleActive = location.pathname.startsWith('/articles')

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
            <a href="/#work">技术作品</a>
            <a href="/#web">网页与故事</a>
            <a href="/#activity">活动墙</a>
            <Link className={articleActive ? 'is-active' : undefined} to="/articles" aria-current={articleActive ? 'page' : undefined}>
              文章
            </Link>
            <a href="/#contact">联系方式</a>
          </div>
          <div className="site-nav__links">
            <a href="/#work">作品</a>
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
          <a href="https://github.com/zongruichd" target="_blank" rel="noreferrer">GitHub</a>
          <a href="https://zongtech.xyz" target="_blank" rel="noreferrer">ZongTech</a>
          <a href="https://2022314.xyz" target="_blank" rel="noreferrer">2022314</a>
          <a href="https://t.me/zongruichd" target="_blank" rel="noreferrer">Telegram</a>
          <a href="https://x.com/zongruichd" target="_blank" rel="noreferrer">X</a>
        </div>
        <div className="footer-meta">
          <span>© {new Date().getFullYear()} ZongRui</span>
          <span>No ads. No behavior tracking. Security cookies only.</span>
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

export function SitePage({ children, compactHeader = false }: { children: ReactNode; compactHeader?: boolean }) {
  return (
    <>
      <a className="skip-link" href="#main-content">跳到主要内容</a>
      <SiteHeader compact={compactHeader} />
      {children}
      <SiteFooter />
    </>
  )
}
