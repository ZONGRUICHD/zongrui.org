import { createElement, useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import '@material/web/ripple/ripple.js'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { MaterialIconButton } from '../material/MaterialControls'
import {
  applyThemePreference,
  getMaterialPalette,
  getThemePreference,
  MATERIAL_PALETTES,
  PALETTE_CHANGE_EVENT,
  saveMaterialPalette,
  saveThemePreference,
  THEME_CHANGE_EVENT,
  type MaterialPalette,
  type ThemePreference,
} from '../material/theme'
import { PixelIcon, type PixelIconName } from './PixelIcons'

type NavItem = {
  label: string
  icon: PixelIconName
  to: string
  isActive: (pathname: string, hash: string) => boolean
}

const navItems: NavItem[] = [
  { label: '首页', icon: 'home', to: '/', isActive: (path, hash) => path === '/' && hash !== '#contact' },
  { label: '文章', icon: 'article', to: '/articles', isActive: (path) => path.startsWith('/articles') },
  { label: '图片', icon: 'gallery', to: '/gallery', isActive: (path) => path.startsWith('/gallery') },
  { label: '作品', icon: 'projects', to: '/projects', isActive: (path) => path.startsWith('/projects') },
  { label: '联系', icon: 'contact', to: '/#contact', isActive: (path, hash) => path === '/' && hash === '#contact' },
]

const routeTitles: ReadonlyArray<[RegExp, string]> = [
  [/^\/$/, 'ZongRui'],
  [/^\/articles\/?$/, '文章'],
  [/^\/articles\//, '阅读'],
  [/^\/gallery/, '图片'],
  [/^\/projects\/?$/, '技术作品'],
  [/^\/projects\//, '项目档案'],
  [/^\/console/, 'Console'],
]

type BatteryManagerLike = EventTarget & {
  charging: boolean
  level: number
}

type NavigatorWithBattery = Navigator & {
  getBattery?: () => Promise<BatteryManagerLike>
  connection?: { effectiveType?: string }
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<void> }
}

function PixelRipple() {
  return createElement('md-ripple', { className: 'pixel-ripple' })
}

function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 20_000)
    return () => window.clearInterval(timer)
  }, [])
  return now
}

function haptic() {
  if (document.documentElement.dataset.motion !== 'reduced') navigator.vibrate?.(8)
}

function pageTitle(pathname: string) {
  return routeTitles.find(([pattern]) => pattern.test(pathname))?.[1] ?? 'ZongRui'
}

function PixelStatusBar({ onPullDown }: { onPullDown: (event: PointerEvent<HTMLDivElement>) => void }) {
  const now = useClock()
  const [battery, setBattery] = useState<{ charging: boolean; level: number } | null>(null)
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine)
    window.addEventListener('online', updateOnline)
    window.addEventListener('offline', updateOnline)
    return () => {
      window.removeEventListener('online', updateOnline)
      window.removeEventListener('offline', updateOnline)
    }
  }, [])

  useEffect(() => {
    let active = true
    let manager: BatteryManagerLike | null = null
    const update = () => {
      if (active && manager) setBattery({ charging: manager.charging, level: Math.round(manager.level * 100) })
    }
    void (navigator as NavigatorWithBattery).getBattery?.().then((next) => {
      if (!active) return
      manager = next
      update()
      manager.addEventListener('levelchange', update)
      manager.addEventListener('chargingchange', update)
    })
    return () => {
      active = false
      manager?.removeEventListener('levelchange', update)
      manager?.removeEventListener('chargingchange', update)
    }
  }, [])

  return (
    <div className="pixel-status-bar" onPointerDown={onPullDown} aria-label="系统状态栏">
      <time dateTime={now.toISOString()}>{now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}</time>
      <div className="pixel-status-bar__icons">
        <PixelIcon name="signal" />
        <PixelIcon name="wifi" className={online ? '' : 'is-offline'} />
        {battery && <span>{battery.level}</span>}
        <PixelIcon name="battery" className={battery?.charging ? 'is-charging' : ''} />
      </div>
    </div>
  )
}

function PixelNavLink({ item, closeDrawer }: { item: NavItem; closeDrawer?: () => void }) {
  const location = useLocation()
  const navigate = useNavigate()
  const active = item.isActive(location.pathname, location.hash)
  const follow = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    haptic()
    closeDrawer?.()
    const documentWithTransitions = document as ViewTransitionDocument
    if (documentWithTransitions.startViewTransition && document.documentElement.dataset.motion !== 'reduced') {
      documentWithTransitions.startViewTransition(() => navigate(item.to))
    } else {
      navigate(item.to)
    }
  }

  return (
    <Link className={`pixel-nav-item${active ? ' is-active' : ''}`} to={item.to} onClick={follow} aria-current={active ? 'page' : undefined}>
      <span className="pixel-nav-item__indicator">
        <PixelIcon name={item.icon} />
      </span>
      <span className="pixel-nav-item__label">{item.label}</span>
      <PixelRipple />
    </Link>
  )
}

function PixelNavigation({ openDrawer }: { openDrawer: () => void }) {
  return (
    <>
      <nav className="pixel-navigation-rail" aria-label="主导航">
        <button className="pixel-rail-avatar" type="button" onClick={openDrawer} aria-label="打开应用抽屉">
          <img src="/avatar.jpg" alt="" />
          <PixelRipple />
        </button>
        <div className="pixel-navigation-rail__items">
          {navItems.map((item) => <PixelNavLink item={item} key={item.to} />)}
        </div>
      </nav>
      <nav className="pixel-navigation-bar" aria-label="主导航">
        {navItems.map((item) => <PixelNavLink item={item} key={item.to} />)}
      </nav>
      <span className="pixel-gesture-bar" aria-hidden="true" />
    </>
  )
}

function PixelAppBar({ compact, openDrawer, openSettings, elevated }: {
  compact: boolean
  openDrawer: () => void
  openSettings: () => void
  elevated: boolean
}) {
  const { pathname } = useLocation()
  return (
    <header className={`pixel-app-bar${compact ? ' pixel-app-bar--compact' : ''}${elevated ? ' is-elevated' : ''}`}>
      <MaterialIconButton className="pixel-app-bar__menu" aria-label="打开应用抽屉" onClick={openDrawer}>
        <PixelIcon name="menu" />
      </MaterialIconButton>
      <div className="pixel-app-bar__title">
        <span>{pageTitle(pathname)}</span>
        <small>zongrui.org</small>
      </div>
      <MaterialIconButton className="pixel-app-bar__palette" aria-label="打开快捷设置" onClick={openSettings}>
        <PixelIcon name="palette" />
      </MaterialIconButton>
      <a className="pixel-app-bar__avatar" href="https://github.com/zongruichd" target="_blank" rel="noreferrer" aria-label="打开 GitHub">
        <img src="/avatar.jpg" alt="" />
        <PixelRipple />
      </a>
    </header>
  )
}

function PixelDrawer({ open, close }: { open: boolean; close: () => void }) {
  const closeButton = useRef<HTMLElement>(null)
  useEffect(() => {
    if (open) window.requestAnimationFrame(() => closeButton.current?.focus())
  }, [open])

  return (
    <div className={`pixel-drawer-layer${open ? ' is-open' : ''}`} aria-hidden={!open}>
      <button className="pixel-scrim" type="button" aria-label="关闭应用抽屉" onClick={close} />
      <aside className="pixel-drawer" role="dialog" aria-modal="true" aria-label="应用抽屉">
        <header>
          <img src="/avatar.jpg" alt="ZongRui 的企鹅头像" />
          <div><strong>ZongRui</strong><span>Programming in Ciallo～</span></div>
          <MaterialIconButton ref={closeButton} aria-label="关闭应用抽屉" onClick={close}><PixelIcon name="close" /></MaterialIconButton>
        </header>
        <nav aria-label="应用">
          {navItems.map((item) => <PixelNavLink item={item} closeDrawer={close} key={item.to} />)}
        </nav>
        <div className="pixel-drawer__external">
          <a href="https://github.com/zongruichd" target="_blank" rel="noreferrer"><PixelIcon name="github" /><span><strong>GitHub</strong><small>github.com/zongruichd</small></span><PixelIcon name="chevron" /><PixelRipple /></a>
          <a href="https://zongtech.xyz" target="_blank" rel="noreferrer"><span className="pixel-drawer__letter">Z</span><span><strong>ZongTech</strong><small>zongtech.xyz</small></span><PixelIcon name="chevron" /><PixelRipple /></a>
          <a href="https://2022314.xyz" target="_blank" rel="noreferrer"><span className="pixel-drawer__letter">9</span><span><strong>2022314</strong><small>毕业纪念</small></span><PixelIcon name="chevron" /><PixelRipple /></a>
        </div>
      </aside>
    </div>
  )
}

function PixelQuickSettings({ open, close, notify }: { open: boolean; close: () => void; notify: (message: string) => void }) {
  const now = useClock()
  const [theme, setTheme] = useState<ThemePreference>(getThemePreference)
  const [palette, setPalette] = useState<MaterialPalette>(getMaterialPalette)
  const [motion, setMotion] = useState(() => window.localStorage.getItem('zongrui-motion') !== 'reduced')
  const [contrast, setContrast] = useState(() => window.localStorage.getItem('zongrui-contrast') === 'high')
  const [brightness, setBrightness] = useState(() => Number(window.localStorage.getItem('zongrui-brightness') ?? 100))
  const closeButton = useRef<HTMLElement>(null)

  useEffect(() => {
    document.documentElement.dataset.motion = motion ? 'full' : 'reduced'
    window.localStorage.setItem('zongrui-motion', motion ? 'full' : 'reduced')
  }, [motion])
  useEffect(() => {
    document.documentElement.dataset.contrast = contrast ? 'high' : 'normal'
    window.localStorage.setItem('zongrui-contrast', contrast ? 'high' : 'normal')
  }, [contrast])
  useEffect(() => {
    const safeValue = Math.min(100, Math.max(40, brightness))
    document.documentElement.style.setProperty('--pixel-screen-dim', String((100 - safeValue) / 180))
    window.localStorage.setItem('zongrui-brightness', String(safeValue))
  }, [brightness])
  useEffect(() => {
    if (open) window.requestAnimationFrame(() => closeButton.current?.focus())
  }, [open])

  const changeTheme = (next: ThemePreference) => {
    haptic()
    setTheme(next)
    saveThemePreference(next)
    applyThemePreference(next)
    window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: next }))
    notify(next === 'system' ? '主题已跟随系统' : next === 'dark' ? '已切换深色主题' : '已切换浅色主题')
  }
  const changePalette = (next: MaterialPalette) => {
    haptic()
    setPalette(next)
    saveMaterialPalette(next)
    notify(`壁纸与颜色：${MATERIAL_PALETTES.find((item) => item.value === next)?.label}`)
  }

  return (
    <div className={`pixel-settings-layer${open ? ' is-open' : ''}`} aria-hidden={!open}>
      <button className="pixel-scrim" type="button" aria-label="关闭快捷设置" onClick={close} />
      <aside className="pixel-quick-settings" role="dialog" aria-modal="true" aria-label="快捷设置">
        <header className="pixel-quick-settings__header">
          <div><time>{now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}</time><span>{now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })}</span></div>
          <MaterialIconButton ref={closeButton} aria-label="关闭快捷设置" onClick={close}><PixelIcon name="close" /></MaterialIconButton>
        </header>

        <label className="pixel-brightness">
          <PixelIcon name="palette" />
          <input type="range" min="40" max="100" value={brightness} onChange={(event) => setBrightness(Number(event.target.value))} aria-label="界面亮度" />
        </label>

        <div className="pixel-quick-tiles">
          <button className={theme === 'dark' ? 'is-active' : ''} type="button" aria-pressed={theme === 'dark'} onClick={() => changeTheme(theme === 'dark' ? 'light' : 'dark')}>
            <PixelIcon name="palette" /><span><strong>深色主题</strong><small>{theme === 'dark' ? '开启' : '关闭'}</small></span><PixelRipple />
          </button>
          <button className={motion ? 'is-active' : ''} type="button" aria-pressed={motion} onClick={() => { haptic(); setMotion((value) => !value); notify(motion ? '动效已减少' : '完整动效已开启') }}>
            <PixelIcon name="motion" /><span><strong>系统动效</strong><small>{motion ? '完整' : '减少'}</small></span><PixelRipple />
          </button>
          <button className={contrast ? 'is-active' : ''} type="button" aria-pressed={contrast} onClick={() => { haptic(); setContrast((value) => !value); notify(contrast ? '标准对比度' : '高对比度') }}>
            <span className="pixel-contrast-icon">Aa</span><span><strong>对比度</strong><small>{contrast ? '高' : '标准'}</small></span><PixelRipple />
          </button>
          <a href="https://github.com/zongruichd" target="_blank" rel="noreferrer">
            <PixelIcon name="github" /><span><strong>GitHub</strong><small>ZONGRUICHD</small></span><PixelRipple />
          </a>
        </div>

        <section className="pixel-wallpaper-settings" aria-labelledby="pixel-wallpaper-title">
          <div><h2 id="pixel-wallpaper-title">壁纸与样式</h2><span>动态取色</span></div>
          <div className="pixel-palette-grid">
            {MATERIAL_PALETTES.map((item) => (
              <button
                className={palette === item.value ? 'is-selected' : ''}
                type="button"
                key={item.value}
                aria-pressed={palette === item.value}
                aria-label={item.label}
                title={item.label}
                style={{ '--palette-seed': item.seed } as React.CSSProperties}
                onClick={() => changePalette(item.value)}
              ><span /><span /><span /></button>
            ))}
          </div>
        </section>

        <div className="pixel-theme-modes" role="group" aria-label="主题模式">
          {(['light', 'system', 'dark'] as const).map((value) => (
            <button className={theme === value ? 'is-selected' : ''} type="button" key={value} aria-pressed={theme === value} onClick={() => changeTheme(value)}>
              {value === 'light' ? '浅色' : value === 'dark' ? '深色' : '系统'}
            </button>
          ))}
        </div>
      </aside>
    </div>
  )
}

export function PixelShell({ children, compact = false }: { children: ReactNode; compact?: boolean }) {
  const location = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [elevated, setElevated] = useState(false)
  const [snackbar, setSnackbar] = useState('')
  const swipeStart = useRef<number | null>(null)
  const snackbarTimer = useRef(0)

  useEffect(() => {
    setDrawerOpen(false)
    setSettingsOpen(false)
  }, [location.pathname, location.hash])
  useEffect(() => {
    const update = () => setElevated(window.scrollY > 6)
    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [])
  useEffect(() => {
    const overlayOpen = drawerOpen || settingsOpen
    document.body.classList.toggle('pixel-overlay-open', overlayOpen)
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDrawerOpen(false)
        setSettingsOpen(false)
      }
    }
    window.addEventListener('keydown', escape)
    return () => {
      document.body.classList.remove('pixel-overlay-open')
      window.removeEventListener('keydown', escape)
    }
  }, [drawerOpen, settingsOpen])
  useEffect(() => {
    const syncPalette = () => document.documentElement.dataset.materialPalette = getMaterialPalette()
    window.addEventListener(PALETTE_CHANGE_EVENT, syncPalette)
    return () => window.removeEventListener(PALETTE_CHANGE_EVENT, syncPalette)
  }, [])

  const notify = (message: string) => {
    setSnackbar(message)
    window.clearTimeout(snackbarTimer.current)
    snackbarTimer.current = window.setTimeout(() => setSnackbar(''), 2800)
  }
  const startPullDown = (event: PointerEvent<HTMLDivElement>) => {
    swipeStart.current = event.clientY
    const move = (moveEvent: globalThis.PointerEvent) => {
      if (swipeStart.current !== null && moveEvent.clientY - swipeStart.current > 42) {
        haptic()
        setSettingsOpen(true)
        swipeStart.current = null
        window.removeEventListener('pointermove', move)
      }
    }
    const end = () => {
      swipeStart.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
    }
    window.addEventListener('pointermove', move, { passive: true })
    window.addEventListener('pointerup', end, { once: true })
  }

  return (
    <div className="pixel-os-shell">
      <a className="skip-link" href="#main-content">跳到主要内容</a>
      <PixelStatusBar onPullDown={startPullDown} />
      <PixelNavigation openDrawer={() => { haptic(); setDrawerOpen(true) }} />
      <div className="pixel-app-surface">
        <PixelAppBar compact={compact} elevated={elevated} openDrawer={() => { haptic(); setDrawerOpen(true) }} openSettings={() => { haptic(); setSettingsOpen(true) }} />
        <div className="pixel-app-content">{children}</div>
      </div>
      <div className="pixel-screen-dimmer" aria-hidden="true" />
      <PixelDrawer open={drawerOpen} close={() => setDrawerOpen(false)} />
      <PixelQuickSettings open={settingsOpen} close={() => setSettingsOpen(false)} notify={notify} />
      <div className={`pixel-snackbar${snackbar ? ' is-visible' : ''}`} role="status" aria-live="polite">{snackbar}</div>
    </div>
  )
}
