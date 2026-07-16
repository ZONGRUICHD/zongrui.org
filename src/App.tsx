import { useEffect, useRef, useState } from 'react'
import { ActivityWalls } from './components/ActivityWalls'
import { galGames } from './data/galGames'

type FeatureBandProps = {
  eyebrow: string
  title: string
  titleAccent: string
  description: string
  supporting: string
  tags: string[]
  href: string
  cta: string
  tone: 'graphite' | 'indigo'
  visual: 'robot' | 'dashboard'
  reverse?: boolean
}

const focusAreas = [
  {
    index: '01',
    title: 'Rust 与机器人',
    description: 'STM32、RoboMaster、CAN 和各种传感器，最后都得落到实机上。',
  },
  {
    index: '02',
    title: 'Linux 与网络',
    description: '装服务、配交换机、抓包排障，也顺手记下踩过的坑。',
  },
  {
    index: '03',
    title: 'AI 与自动化',
    description: '把模型接进我每天用的工具里，能省一步是一步。',
  },
  {
    index: '04',
    title: '文档与网页',
    description: '项目能跑以后，我还会补 README、操作说明和网页界面。',
  },
]

const portals = [
  {
    index: '01',
    title: 'GitHub',
    domain: 'github.com/zongruichd',
    description: '代码都在这里，写完的和还在施工的都有。',
    href: 'https://github.com/zongruichd',
  },
  {
    index: '02',
    title: 'ZongTech',
    domain: 'zongtech.xyz',
    description: '服务器、工具、网络，还有各种踩坑记录。',
    href: 'https://zongtech.xyz',
  },
  {
    index: '03',
    title: '2022314',
    domain: '2022314.xyz',
    description: '909 的毕业纪念站，留给以前的同学和自己。',
    href: 'https://2022314.xyz',
  },
]

function Arrow() {
  return <span aria-hidden="true">↗</span>
}

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <img src="/avatar.jpg" alt="" />
    </span>
  )
}

function HeroVisual() {
  const keys = ['R', 'S', 'T', 'L', 'I', 'N', 'U', 'X', 'A', 'I', 'C', 'O', 'D', 'E']

  return (
    <figure className="hero-showcase" data-reveal>
      <div className="hero-showcase__blueprint" aria-hidden="true" />
      <div className="hero-module hero-module--rust" aria-hidden="true">
        <span>RUST</span>
        <small>NO_STD</small>
      </div>
      <div className="hero-module hero-module--linux" aria-hidden="true">
        <span>LINUX</span>
        <small>ONLINE</small>
      </div>
      <div className="hero-module hero-module--network" aria-hidden="true">
        <span>NETWORK</span>
        <small>10G</small>
      </div>
      <div className="hero-device">
        <div className="hero-device__lights" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <img src="/avatar.jpg" alt="ZongRui 使用的企鹅头像" />
        <div className="hero-device__label">
          <span>ZONGRUI</span>
          <small>BUILDER / 0831</small>
        </div>
      </div>
      <div className="hero-keyboard" aria-hidden="true">
        {keys.map((key, index) => (
          <span key={`${key}-${index}`}>{key}</span>
        ))}
      </div>
      <figcaption className="sr-only">
        由 Rust、Linux、网络模块和个人头像组成的工程工作台插画
      </figcaption>
    </figure>
  )
}

function RobotVisual() {
  return (
    <figure
      className="robot-visual"
    >
      <div className="robot-visual__frame">
        <img
          className="robot-visual__photo"
          src="/assets/xjtlu-robomaster-infantry.gif?v=39cca43"
          alt="2019 XJTLU RoboMaster 步兵机器人实机运行画面"
          loading="lazy"
          decoding="async"
        />
        <div className="robot-visual__rust" aria-label="使用 Rust 构建">
          <img src="/assets/rust-logo.svg" alt="" aria-hidden="true" />
          <span>BUILT WITH</span>
          <strong>RUST</strong>
        </div>
      </div>
      <figcaption>
        <span>ROBOMASTER INFANTRY / XJTLU 2019</span>
        <small>RUST · STM32 · CAN · NO_STD</small>
      </figcaption>
    </figure>
  )
}

function DashboardVisual() {
  const ports = Array.from({ length: 14 }, (_, index) => index)

  return (
    <div
      className="dashboard-visual"
      role="img"
      aria-label="Arista 交换机仪表盘界面，展示设备健康、接口流量和端口状态"
    >
      <div className="dashboard-window">
        <div className="dashboard-window__bar">
          <span />
          <span />
          <span />
          <strong>ARISTA / EOS</strong>
        </div>
        <div className="dashboard-window__body">
          <aside>
            <b>ZR</b>
            <i />
            <i />
            <i />
            <i />
          </aside>
          <div className="dashboard-content">
            <div className="dashboard-heading">
              <div>
                <small>CORE-SWITCH-01</small>
                <strong>System overview</strong>
              </div>
              <span>HEALTHY</span>
            </div>
            <div className="dashboard-metrics">
              <div><small>CPU</small><strong>12%</strong></div>
              <div><small>MEMORY</small><strong>38%</strong></div>
              <div><small>UPLINK</small><strong>40G</strong></div>
            </div>
            <div className="dashboard-chart">
              <span style={{ height: '34%' }} />
              <span style={{ height: '48%' }} />
              <span style={{ height: '42%' }} />
              <span style={{ height: '70%' }} />
              <span style={{ height: '58%' }} />
              <span style={{ height: '82%' }} />
              <span style={{ height: '66%' }} />
              <span style={{ height: '76%' }} />
              <span style={{ height: '54%' }} />
            </div>
            <div className="dashboard-ports">
              {ports.map((port) => <span key={port} className={port % 5 === 0 ? 'is-idle' : ''} />)}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function FeatureBand({
  eyebrow,
  title,
  titleAccent,
  description,
  supporting,
  tags,
  href,
  cta,
  tone,
  visual,
  reverse = false,
}: FeatureBandProps) {
  return (
    <article className={`feature-band feature-band--${tone}${reverse ? ' feature-band--reverse' : ''}`}>
      <div className="feature-band__pattern" aria-hidden="true" />
      <div className="feature-band__inner">
        <div className="feature-band__visual" data-reveal>
          {visual === 'robot' ? <RobotVisual /> : <DashboardVisual />}
        </div>
        <div className="feature-band__copy" data-reveal>
          <p className="feature-eyebrow">{eyebrow}</p>
          <h2>
            {title}
            <span>{titleAccent}</span>
          </h2>
          <p className="feature-description">{description}</p>
          <p className="feature-supporting">{supporting}</p>
          <div className="feature-tags" aria-label="项目技术栈">
            {tags.map((tag) => <span key={tag}>{tag}</span>)}
          </div>
          <a className="button button--light" href={href} target="_blank" rel="noreferrer">
            {cta} <Arrow />
          </a>
        </div>
      </div>
    </article>
  )
}

function GalLibrary() {
  const railRef = useRef<HTMLDivElement>(null)
  const firstSetRef = useRef<HTMLDivElement>(null)
  const loopSetRef = useRef<HTMLDivElement>(null)
  const manualPausedRef = useRef(false)
  const resumeAtRef = useRef(0)
  const [autoScrollPaused, setAutoScrollPaused] = useState(false)

  const pauseAutoScroll = (duration = 2400) => {
    resumeAtRef.current = performance.now() + duration
  }

  const scrollLibrary = (direction: -1 | 1) => {
    const rail = railRef.current
    if (!rail) return

    pauseAutoScroll()
    rail.scrollBy({
      left: direction * Math.max(rail.clientWidth * 0.82, 280),
      behavior: 'smooth',
    })
  }

  const toggleAutoScroll = () => {
    const nextPaused = !manualPausedRef.current
    manualPausedRef.current = nextPaused
    setAutoScrollPaused(nextPaused)
    if (!nextPaused) resumeAtRef.current = 0
  }

  useEffect(() => {
    const rail = railRef.current
    const firstSet = firstSetRef.current
    const loopSet = loopSetRef.current
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

    if (!rail || !firstSet || !loopSet || reducedMotion.matches) return

    let animationFrame = 0
    let previousTime = performance.now()
    let virtualScroll = rail.scrollLeft

    const stop = () => {
      if (animationFrame) cancelAnimationFrame(animationFrame)
      animationFrame = 0
    }

    const tick = (time: number) => {
      const elapsed = Math.min(time - previousTime, 48)
      previousTime = time

      const paused = manualPausedRef.current || time < resumeAtRef.current

      if (paused) {
        virtualScroll = rail.scrollLeft
      } else {
        const loopPoint = loopSet.offsetLeft - firstSet.offsetLeft

        if (loopPoint > 0) {
          virtualScroll += elapsed * 0.052

          if (virtualScroll >= loopPoint) {
            virtualScroll %= loopPoint
          }

          rail.scrollLeft = virtualScroll
        }
      }

      animationFrame = requestAnimationFrame(tick)
    }

    const start = () => {
      if (animationFrame) return
      virtualScroll = rail.scrollLeft
      previousTime = performance.now()
      animationFrame = requestAnimationFrame(tick)
    }

    let visibilityObserver: IntersectionObserver | null = null

    if ('IntersectionObserver' in window) {
      visibilityObserver = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) start()
          else stop()
        },
        { threshold: 0.05 },
      )
      visibilityObserver.observe(rail)
    } else {
      start()
    }

    return () => {
      visibilityObserver?.disconnect()
      stop()
    }
  }, [])

  const renderGames = (duplicate = false) => galGames.map((game, index) => (
    <a
      className="gal-card"
      href={`https://store.steampowered.com/app/${game.appId}`}
      target="_blank"
      rel="noreferrer"
      key={`${duplicate ? 'loop' : 'main'}-${game.appId}`}
      tabIndex={duplicate ? -1 : undefined}
      data-reveal={duplicate ? undefined : true}
    >
      <figure>
        <div className="gal-card__cover">
          <img
            src={`/assets/steam-gal/${game.appId}.webp`}
            alt={`${game.title} Steam 库竖版封面`}
            width="300"
            height="450"
            loading="lazy"
            decoding="async"
          />
          <span>APP {game.appId}</span>
        </div>
        <figcaption>
          <span className="gal-card__index">{String(index + 1).padStart(2, '0')}</span>
          <div>
            <p>{game.studio} / {game.year}</p>
            <h3>{game.title}</h3>
            <span>{game.caption}</span>
          </div>
          <span className="gal-card__arrow"><Arrow /></span>
        </figcaption>
      </figure>
    </a>
  ))

  return (
    <section className="gal-library" id="gal" aria-labelledby="gal-title">
      <div className="gal-library__inner">
        <header className="gal-library__header" data-reveal>
          <div>
            <p className="section-kicker">STEAM LIBRARY / GALGAME ARCHIVE</p>
            <h2 id="gal-title">我还是 Gal<br />老资历大师。</h2>
          </div>
          <div className="gal-library__summary">
            <div className="gal-library__count" aria-label={`Steam GalGame 收藏共 ${galGames.length} 款`}>
              <strong>{String(galGames.length).padStart(2, '0')}</strong>
              <span>STEAM COLLECTION</span>
            </div>
          </div>
        </header>

        <div className="gal-library__rail-toolbar" data-reveal>
          <p>{galGames.length} COVERS · AUTO LOOP</p>
          <div className="gal-library__rail-controls" aria-label="Galgame 封面滚动控制">
            <button
              type="button"
              className="gal-library__pause"
              onClick={toggleAutoScroll}
              aria-pressed={autoScrollPaused}
              aria-label={autoScrollPaused ? '继续自动滚动 Galgame 封面' : '暂停自动滚动 Galgame 封面'}
              title={autoScrollPaused ? '继续自动滚动' : '暂停自动滚动'}
            >
              <span aria-hidden="true">{autoScrollPaused ? '▶' : 'Ⅱ'}</span>
            </button>
            <button type="button" onClick={() => scrollLibrary(-1)} aria-label="向左滚动 Galgame 封面">
              ←
            </button>
            <button type="button" onClick={() => scrollLibrary(1)} aria-label="向右滚动 Galgame 封面">
              →
            </button>
          </div>
        </div>

        <div
          className="gal-grid"
          ref={railRef}
          tabIndex={0}
          aria-label="Steam GalGame 自动横向封面长廊"
          onFocusCapture={() => pauseAutoScroll()}
          onPointerDown={() => pauseAutoScroll(3000)}
          onPointerUp={() => pauseAutoScroll()}
          onPointerCancel={() => pauseAutoScroll()}
          onPointerMove={(event) => {
            if (event.buttons) pauseAutoScroll(1200)
          }}
          onTouchStart={() => pauseAutoScroll(3000)}
          onTouchEnd={() => pauseAutoScroll()}
          onTouchCancel={() => pauseAutoScroll()}
          onWheel={() => pauseAutoScroll(1800)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft') {
              event.preventDefault()
              scrollLibrary(-1)
            }
            if (event.key === 'ArrowRight') {
              event.preventDefault()
              scrollLibrary(1)
            }
          }}
        >
          <div className="gal-grid__group" ref={firstSetRef}>
            {renderGames()}
          </div>
          <div className="gal-grid__group" ref={loopSetRef} aria-hidden="true">
            {renderGames(true)}
          </div>
        </div>
      </div>
    </section>
  )
}

function App() {
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const root = document.documentElement
    root.classList.add('js')

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.12 },
    )

    document.querySelectorAll<HTMLElement>('[data-reveal]').forEach((element) => {
      observer.observe(element)
    })

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }

    window.addEventListener('keydown', handleEscape)

    return () => {
      observer.disconnect()
      window.removeEventListener('keydown', handleEscape)
      root.classList.remove('js')
    }
  }, [])

  const closeMenu = () => setMenuOpen(false)

  return (
    <>
      <a className="skip-link" href="#main-content">跳到主要内容</a>

      <header className="site-header">
        <div className="masthead">
          <a className="brand" href="#top" aria-label="ZongRui 首页">
            <BrandMark />
            <span className="brand-copy">
              <strong>ZongRui</strong>
              <small>Rust · RoboMaster · Linux</small>
            </span>
          </a>
          <a className="masthead-github" href="https://github.com/zongruichd" target="_blank" rel="noreferrer">
            GitHub <Arrow />
          </a>
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
              <a href="#work" onClick={closeMenu}>技术作品</a>
              <a href="#web" onClick={closeMenu}>网页与故事</a>
              <a href="#gal" onClick={closeMenu}>Galgame 收藏</a>
              <a href="#activity" onClick={closeMenu}>活动墙</a>
            </div>
            <div className="site-nav__links">
              <a href="#about" onClick={closeMenu}>关于</a>
              <a href="#work" onClick={closeMenu}>作品</a>
              <a href="#focus" onClick={closeMenu}>方向</a>
              <a href="#links" onClick={closeMenu}>站点</a>
            </div>
          </div>
        </nav>
      </header>

      <main id="main-content">
        <section className="hero" id="top" aria-labelledby="hero-title">
          <div className="hero__inner">
            <div className="hero__copy" data-reveal>
              <p className="hero-kicker">RUST · ROBOMASTER · LINUX · NETWORKS</p>
              <h1 id="hero-title">
                <span>我写代码，</span>
                <strong>也折腾机器和网络。</strong>
              </h1>
              <p className="hero-intro">
                平时主要写 Rust，做 RoboMaster 控制，也会管 Linux 服务器和交换机。缺什么工具，就自己补一个。
              </p>
              <p className="hero-origin">Shenzhen, China · Student developer.</p>
              <div className="hero-actions">
                <a className="button button--dark" href="#work">看看项目</a>
                <a className="text-link" href="https://github.com/zongruichd" target="_blank" rel="noreferrer">
                  我的 GitHub <Arrow />
                </a>
              </div>
            </div>
            <HeroVisual />
          </div>
        </section>

        <section id="work" aria-label="代表作品">
          <FeatureBand
            eyebrow="EMBEDDED ROBOTICS / OPEN SOURCE"
            title="RM Robot Rust"
            titleAccent="Control Framework"
            description="面向 RoboMaster 的 Rust 整车控制框架。"
            supporting="把 STM32、四轮底盘、双轴云台、遥控安全门与 Linux SBC 视觉链路组织成一套可测试、可维护的实时系统。"
            tags={['Rust', 'STM32F407', 'RoboMaster', 'no_std']}
            href="https://github.com/ZONGRUICHD/RM-Robot-Rust"
            cta="查看项目源码"
            tone="graphite"
            visual="robot"
          />

          <FeatureBand
            eyebrow="NETWORK OPERATIONS / ON-BOX WEBUI"
            title="Arista Switch"
            titleAccent="Web Dashboard"
            description="把交换机运行状态，收进一块真正可用的屏幕。"
            supporting="运行于 Arista EOS 的单文件管理界面，覆盖端口、流量、VLAN、ARP/MAC、路由、环境健康与受控配置。"
            tags={['Python', 'Arista EOS', 'Telemetry', 'Operations']}
            href="https://github.com/ZONGRUICHD/Arista-Switch-Web-Dashboard"
            cta="打开项目仓库"
            tone="indigo"
            visual="dashboard"
            reverse
          />
        </section>

        <section className="web-stories" id="web" aria-labelledby="web-title">
          <div className="section-intro" data-reveal>
            <div>
              <p className="section-kicker">WEB / MEMORY / NOTES</p>
              <h2 id="web-title">有些东西，<br />我想留在网上。</h2>
            </div>
            <p>2022314 是毕业纪念站；ZongTech 用来记服务器、工具和踩坑。</p>
          </div>

          <div className="story-grid">
            <a className="story-card story-card--memory" href="https://2022314.xyz" target="_blank" rel="noreferrer" data-reveal>
              <div className="site-capture site-capture--memory">
                <img
                  src="/assets/2022314-home.webp"
                  alt="2022314.xyz 毕业纪念网站真实首屏，展示 909 标识与教室门口照片"
                  loading="lazy"
                  decoding="async"
                />
                <span>LIVE CAPTURE · 2022314.XYZ</span>
              </div>
              <div className="story-card__copy">
                <p>MEMORY / REACT</p>
                <h3>909 青春赛季</h3>
                <span>毕业纪念站，偶尔回去翻一翻。 <Arrow /></span>
              </div>
            </a>

            <a className="story-card story-card--notes" href="https://zongtech.xyz" target="_blank" rel="noreferrer" data-reveal>
              <div className="site-capture site-capture--notes">
                <img
                  src="/assets/zongtech-home.webp"
                  alt="zongtech.xyz 真实首屏，展示 ZONGRUICHD 导航与动漫主视觉"
                  loading="lazy"
                  decoding="async"
                />
                <span>LIVE CAPTURE · ZONGTECH.XYZ</span>
              </div>
              <div className="story-card__copy">
                <p>WRITING / BUILD LOG</p>
                <h3>ZongTech</h3>
                <span>装服务、改配置、排故，做过的都记一下。 <Arrow /></span>
              </div>
            </a>
          </div>
        </section>

        <GalLibrary />

        <ActivityWalls />

        <section className="about" id="about" aria-labelledby="about-title">
          <div className="about__inner">
            <div className="about__heading" data-reveal>
              <p className="section-kicker">ABOUT</p>
              <h2 id="about-title">ZongRui，<br />深圳。</h2>
            </div>
            <div className="about__body" data-reveal>
              <p>
                我目前还是学生，住在深圳。平时写 Rust，做 RoboMaster 控制，也折腾 Linux、交换机、服务器和各种 AI 工具。
              </p>
              <p>
                很多项目没什么宏大目标：我只是正好缺一个能用的东西，于是自己写。能跑之后，再慢慢补文档和界面。
              </p>
              <blockquote>{'Programming in Ciallo～(∠・ω< )⌒★'}</blockquote>
            </div>
          </div>
        </section>

        <section className="focus" id="focus" aria-labelledby="focus-title">
          <div className="focus__inner">
            <div className="focus__header" data-reveal>
              <p className="section-kicker">WHAT I AM WORKING ON</p>
              <h2 id="focus-title">最近常折腾的<br />几件事。</h2>
            </div>
            <div className="focus-list">
              {focusAreas.map((area) => (
                <article key={area.index} data-reveal>
                  <span>{area.index}</span>
                  <h3>{area.title}</h3>
                  <p>{area.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="portals" id="links" aria-labelledby="links-title">
          <div className="portals__inner">
            <div className="portals__header" data-reveal>
              <p className="section-kicker">ELSEWHERE</p>
              <h2 id="links-title">我还在这些地方<br />更新东西。</h2>
            </div>
            <div className="portal-list">
              {portals.map((portal) => (
                <a href={portal.href} target="_blank" rel="noreferrer" key={portal.index} data-reveal>
                  <span className="portal-index">{portal.index}</span>
                  <span className="portal-title">
                    <strong>{portal.title}</strong>
                    <small>{portal.domain}</small>
                  </span>
                  <span className="portal-description">{portal.description}</span>
                  <span className="portal-arrow"><Arrow /></span>
                </a>
              ))}
            </div>
          </div>
        </section>
      </main>

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
          </div>
          <div className="footer-meta">
            <span>© {new Date().getFullYear()} ZongRui</span>
            <span>No trackers. No cookies.</span>
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
            <span>Steam library cover artwork © respective developers and publishers; shown for collection identification.</span>
            <a href="#top">返回顶部 ↑</a>
          </div>
        </div>
      </footer>
    </>
  )
}

export default App
