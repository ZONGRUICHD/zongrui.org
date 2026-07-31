import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { ThemeSwitcher } from '../components/ThemeSwitcher'
import { VisualStyleSwitcher } from '../components/VisualStyleSwitcher'
import { useF1ScrollProgress, useF1StartSequence } from './useF1Motion'

const navigation = [
  { to: '/', label: '首页', index: '01' },
  { to: '/articles', label: '文章', index: '02' },
  { to: '/projects', label: '技术作品', index: '03' },
  { to: '/gallery', label: '图片', index: '04' },
] as const

function F1Footer() {
  return (
    <footer className="f1-footer">
      <div className="f1-footer__line" aria-hidden="true" />
      <div className="f1-footer__grid">
        <div className="f1-footer__identity">
          <span>ZR</span>
          <div><strong>ZONGRUI</strong><small>PERSONAL PADDOCK / SHENZHEN</small></div>
        </div>
        <nav aria-label="页脚导航">
          <Link to="/articles">文章</Link>
          <Link to="/projects">技术作品</Link>
          <Link to="/gallery">图片</Link>
          <a href="https://github.com/zongruichd" target="_blank" rel="noreferrer">GitHub ↗</a>
        </nav>
        <div className="f1-footer__meta">
          <span>© {new Date().getFullYear()} ZONGRUI</span>
          <span>No ads. No cross-site tracking.</span>
          <span>Race-inspired original interface. No Formula 1 affiliation.</span>
        </div>
      </div>
    </footer>
  )
}

export function F1SitePage({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const location = useLocation()
  const progressRef = useF1ScrollProgress()
  const startRef = useF1StartSequence()

  useEffect(() => setMenuOpen(false), [location.pathname, location.hash])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!menuOpen) return
      if (event.key === 'Escape') {
        setMenuOpen(false)
        window.requestAnimationFrame(() => menuButtonRef.current?.focus())
        return
      }
      if (event.key === 'Tab') {
        const focusable = Array.from(menuRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? []).filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true')
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    document.documentElement.classList.toggle('f1-menu-open', menuOpen)
    const background = [
      document.querySelector<HTMLElement>('.f1-page-stage'),
      document.querySelector<HTMLElement>('.f1-footer'),
    ].filter((element): element is HTMLElement => element !== null)
    const menu = menuRef.current
    if (menuOpen) menu?.removeAttribute('inert')
    else menu?.setAttribute('inert', '')
    background.forEach((element) => {
      if (menuOpen) element.setAttribute('inert', '')
      else element.removeAttribute('inert')
    })
    if (menuOpen) {
      window.requestAnimationFrame(() => menuRef.current?.querySelector<HTMLElement>('a[href]')?.focus())
    }
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.documentElement.classList.remove('f1-menu-open')
      menu?.removeAttribute('inert')
      background.forEach((element) => element.removeAttribute('inert'))
    }
  }, [menuOpen])

  return (
    <div className="f1-site">
      <a className="skip-link" href="#main-content">跳到主要内容</a>
      <div className="f1-start" ref={startRef} aria-hidden="true">
        <div className="f1-start__lamps">
          {Array.from({ length: 5 }, (_, index) => <span className="f1-start__lamp" key={index} />)}
        </div>
        <p>ZONGRUI / READY</p>
      </div>
      <header className="f1-header">
        <div className="f1-header__progress" aria-hidden="true"><span ref={progressRef} /></div>
        <Link className="f1-brand" to="/" aria-label="ZongRui 首页">
          <img src="/avatar.jpg" alt="" />
          <span className="f1-brand__monogram">ZR</span>
          <span className="f1-brand__copy"><strong>ZONGRUI</strong><small>RUST / ROBOMASTER / LINUX</small></span>
        </Link>
        <nav className="f1-header__nav" aria-label="主导航">
          {navigation.map((item) => (
            <NavLink className={({ isActive }) => isActive ? 'is-active' : ''} end={item.to === '/'} to={item.to} key={item.to}>
              <small>{item.index}</small>{item.label}
            </NavLink>
          ))}
        </nav>
        <div className="f1-header__tools">
          <ThemeSwitcher className="f1-theme-switcher" />
          <VisualStyleSwitcher className="f1-style-switcher" variant="f1" />
          <button
            className="f1-menu-button"
            ref={menuButtonRef}
            type="button"
            aria-expanded={menuOpen}
            aria-controls="f1-navigation-panel"
            aria-label={menuOpen ? '关闭导航菜单' : '打开导航菜单'}
            onClick={() => setMenuOpen((value) => !value)}
          >
            <span /><span />
          </button>
        </div>
      </header>

      <div
        className={`f1-menu${menuOpen ? ' is-open' : ''}`}
        id="f1-navigation-panel"
        ref={menuRef}
        role="dialog"
        aria-modal={menuOpen ? 'true' : undefined}
        aria-label="网站导航"
        aria-hidden={!menuOpen}
      >
        <div className="f1-menu__rail"><span>ZR</span><small>SELECT SECTOR</small></div>
        <nav aria-label="全屏导航">
          {navigation.map((item) => (
            <NavLink end={item.to === '/'} to={item.to} key={item.to} tabIndex={menuOpen ? 0 : -1}>
              <small>{item.index}</small><span>{item.label}</span><i aria-hidden="true">↗</i>
            </NavLink>
          ))}
          <a href="/#web" tabIndex={menuOpen ? 0 : -1}><small>05</small><span>我的网站们</span><i>↗</i></a>
          <a href="/#contact" tabIndex={menuOpen ? 0 : -1}><small>06</small><span>联系方式</span><i>↗</i></a>
        </nav>
        <div className="f1-menu__bottom">
          <div>
            <a href="https://github.com/zongruichd" target="_blank" rel="noreferrer" tabIndex={menuOpen ? 0 : -1}>GITHUB ↗</a>
            <span>PROGRAMMING IN CIALLO</span>
          </div>
          <div className="f1-menu__controls">
            <ThemeSwitcher />
            <VisualStyleSwitcher variant="f1" />
          </div>
        </div>
      </div>

      <div className="f1-page-stage" key={location.pathname}>
        <span className="f1-page-stage__sector" aria-hidden="true">SECTOR / {location.pathname === '/' ? 'HOME' : location.pathname.slice(1).toUpperCase()}</span>
        {children}
      </div>
      <F1Footer />
    </div>
  )
}
