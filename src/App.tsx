import { useEffect, useMemo, useState, type MouseEvent } from 'react'

type Project = {
  index: string
  title: string
  category: string
  description: string
  tags: string[]
  href: string
  accent: 'lime' | 'cyan' | 'ember' | 'paper'
}

const projects: Project[] = [
  {
    index: '01',
    title: 'RM Robot Rust',
    category: 'ROBOTICS / RUST',
    description:
      '面向 RoboMaster 的 Rust 机器人控制框架，把 STM32、云台、视觉链路与上位机组织成一套可演进的系统。',
    tags: ['Rust', 'STM32', 'Control'],
    href: 'https://github.com/ZONGRUICHD/RM-Robot-Rust',
    accent: 'lime',
  },
  {
    index: '02',
    title: 'Arista Dashboard',
    category: 'NETWORK / OPERATIONS',
    description:
      '运行于 Arista EOS 的单文件 Web 仪表盘，把端口状态、流量趋势、VLAN、ARP/MAC 与路由概要收进一块屏幕。',
    tags: ['Python', 'EOS', 'Telemetry'],
    href: 'https://github.com/ZONGRUICHD/Arista-Switch-Web-Dashboard',
    accent: 'cyan',
  },
  {
    index: '03',
    title: '909 青春赛季',
    category: 'MEMORY / WEB',
    description:
      '把共同经历做成一枚可以反复打开的数字时间胶囊：克制、真诚，也保留网页应有的互动与生命力。',
    tags: ['React', 'TypeScript', 'Story'],
    href: 'https://2022314.xyz',
    accent: 'ember',
  },
  {
    index: '04',
    title: 'ZongTech',
    category: 'NOTES / FIELD LOG',
    description:
      '持续记录 Arch Linux、AI 编程工具、3D 设计和网络部署。不是教程仓库，而是一份公开的工程现场日志。',
    tags: ['Linux', 'AI Tools', 'Writing'],
    href: 'https://zongtech.xyz',
    accent: 'paper',
  },
]

const capabilities = [
  {
    index: 'A.01',
    title: 'Rust × Robotics',
    detail: '嵌入式控制、RoboMaster、传感器与设备间通信。',
  },
  {
    index: 'A.02',
    title: 'Linux × Networks',
    detail: '系统维护、代理网关、交换网络与可观测性。',
  },
  {
    index: 'A.03',
    title: 'AI × Automation',
    detail: '把模型接入真实工作流，让工具替人处理重复劳动。',
  },
  {
    index: 'A.04',
    title: 'Docs × Visual Systems',
    detail: '用清晰的文档、界面与叙事降低复杂系统的理解成本。',
  },
]

const portals = [
  {
    index: 'P.01',
    eyebrow: 'CODEBASE',
    title: 'GitHub',
    domain: 'github.com/zongruichd',
    detail: '代码、实验与持续生长的项目档案。',
    href: 'https://github.com/zongruichd',
  },
  {
    index: 'P.02',
    eyebrow: 'FIELD NOTES',
    title: 'ZongTech',
    domain: 'zongtech.xyz',
    detail: '系统、工具和折腾过程的长期记录。',
    href: 'https://zongtech.xyz',
  },
  {
    index: 'P.03',
    eyebrow: 'MEMORY',
    title: '2022314',
    domain: '2022314.xyz',
    detail: '一段青春被保存为网页之后的样子。',
    href: 'https://2022314.xyz',
  },
]

const interests = [
  'RUST',
  'ROBOTICS',
  'EMBEDDED',
  'LINUX',
  'NETWORKS',
  'AI TOOLS',
  'DOCUMENTATION',
  'ACG / VISUAL CULTURE',
]

function Arrow() {
  return <span aria-hidden="true">↗</span>
}

function App() {
  const [time, setTime] = useState(() => new Date())

  const shenzhenTime = useMemo(
    () =>
      new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(time),
    [time],
  )

  useEffect(() => {
    const root = document.documentElement
    root.classList.add('motion-ready')

    const clock = window.setInterval(() => setTime(new Date()), 30_000)

    const handlePointer = (event: PointerEvent) => {
      const x = (event.clientX / window.innerWidth - 0.5) * 18
      const y = (event.clientY / window.innerHeight - 0.5) * 18
      root.style.setProperty('--pointer-x', `${x}px`)
      root.style.setProperty('--pointer-y', `${y}px`)
    }

    const handleScroll = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight
      const progress = scrollable > 0 ? (window.scrollY / scrollable) * 100 : 0
      root.style.setProperty('--scroll-progress', `${progress}%`)
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.14 },
    )

    document.querySelectorAll<HTMLElement>('[data-reveal]').forEach((element) => {
      observer.observe(element)
    })

    window.addEventListener('pointermove', handlePointer, { passive: true })
    window.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()

    return () => {
      window.clearInterval(clock)
      observer.disconnect()
      window.removeEventListener('pointermove', handlePointer)
      window.removeEventListener('scroll', handleScroll)
      root.classList.remove('motion-ready')
    }
  }, [])

  const handleCardPointer = (event: MouseEvent<HTMLAnchorElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    event.currentTarget.style.setProperty('--card-x', `${event.clientX - bounds.left}px`)
    event.currentTarget.style.setProperty('--card-y', `${event.clientY - bounds.top}px`)
  }

  return (
    <>
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      <div className="scroll-progress" aria-hidden="true" />
      <div className="page-noise" aria-hidden="true" />

      <header className="site-header">
        <a className="wordmark" href="#top" aria-label="返回首页">
          ZR<span>//</span>ORG
        </a>
        <nav className="primary-nav" aria-label="主导航">
          <a href="#about">ABOUT</a>
          <a href="#work">WORK</a>
          <a href="#links">LINKS</a>
        </nav>
        <a
          className="header-link"
          href="https://github.com/zongruichd"
          target="_blank"
          rel="noreferrer"
        >
          GITHUB <Arrow />
        </a>
      </header>

      <main id="main-content">
        <section className="hero" id="top" aria-labelledby="hero-title">
          <div className="hero-coordinate hero-coordinate--left" aria-hidden="true">
            22.5431° N
          </div>
          <div className="hero-coordinate hero-coordinate--right" aria-hidden="true">
            114.0579° E
          </div>

          <div className="hero-copy">
            <div className="eyebrow" data-reveal>
              <span>STUDENT BUILDER / SHENZHEN</span>
              <span className="status"><i /> SYSTEM ONLINE</span>
            </div>
            <h1 id="hero-title" className="hero-title" aria-label="ZongRui">
              <span className="hero-title__line" aria-hidden="true" data-reveal>
                ZONG
              </span>
              <span className="hero-title__line hero-title__line--shift" aria-hidden="true" data-reveal>
                RUI<span className="hero-title__mark">*</span>
              </span>
            </h1>
            <div className="hero-bottom" data-reveal>
              <p className="hero-lede">
                把想法变成能运行、
                <br />
                可维护、可长期演进的系统。
              </p>
              <a className="round-link" href="#work" aria-label="查看代表作品">
                <span>EXPLORE</span>
                <span>↓</span>
              </a>
            </div>
          </div>

          <div className="signal-stage" data-reveal>
            <div className="signal-stage__parallax">
              <div className="signal-ring signal-ring--outer" aria-hidden="true" />
              <div className="signal-ring signal-ring--middle" aria-hidden="true" />
              <div className="signal-ring signal-ring--inner" aria-hidden="true" />
              <div className="signal-cross signal-cross--x" aria-hidden="true" />
              <div className="signal-cross signal-cross--y" aria-hidden="true" />
              <figure className="portrait-frame">
                <img src="/avatar.jpg" alt="ZongRui 的 GitHub 头像" />
                <figcaption>SUBJECT // ZR-0831</figcaption>
              </figure>
              <span className="orbit-label orbit-label--one">BUILD / 01</span>
              <span className="orbit-label orbit-label--two">ITERATE / 02</span>
              <span className="orbit-label orbit-label--three">DOCUMENT / 03</span>
            </div>
          </div>
        </section>

        <div className="ticker" aria-label={`兴趣方向：${interests.join('、')}`}>
          <div className="ticker__track" aria-hidden="true">
            {[...interests, ...interests].map((item, index) => (
              <span key={`${item}-${index}`}>
                {item} <b>✦</b>
              </span>
            ))}
          </div>
        </div>

        <section className="about section-shell" id="about" aria-labelledby="about-title">
          <div className="section-rail" data-reveal>
            <span>01</span>
            <span>PERSONAL OPERATING SYSTEM</span>
          </div>
          <div className="about-grid">
            <div className="about-heading" data-reveal>
              <p className="micro-label">NOT A BIO. A BUILD LOG.</p>
              <h2 id="about-title">
                BETWEEN
                <br />
                <em>BITS</em> &amp; BOLTS.
              </h2>
            </div>
            <div className="about-body" data-reveal>
              <p className="about-intro">
                你好，我是 ZongRui，一名来自深圳的学生开发者。我关注 Rust、嵌入式与机器人、
                Linux 运维、网络基础设施和 AI 工具，喜欢把想法迅速变成能运行的系统，再用文档与迭代把它打磨得可靠、清晰、可维护。
              </p>
              <p>
                代码之外，我也把校园记忆与 ACG 兴趣做成网页作品。这里记录我如何在比特与机械、工具与故事之间，持续构建真正有用的东西。
              </p>
              <div className="principle">
                <span>CORE PRINCIPLE</span>
                <strong>Make it real. Make it legible. Keep it evolving.</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="capabilities section-shell" aria-labelledby="capabilities-title">
          <div className="section-rail" data-reveal>
            <span>02</span>
            <span>WHAT I KEEP RETURNING TO</span>
          </div>
          <div className="capabilities-header" data-reveal>
            <p className="micro-label">SYSTEM MAP</p>
            <h2 id="capabilities-title">FOUR AXES,<br />ONE PRACTICE.</h2>
          </div>
          <div className="capability-list">
            {capabilities.map((capability) => (
              <article className="capability-row" key={capability.index} data-reveal>
                <span>{capability.index}</span>
                <h3>{capability.title}</h3>
                <p>{capability.detail}</p>
                <i aria-hidden="true">↘</i>
              </article>
            ))}
          </div>
        </section>

        <section className="work section-shell" id="work" aria-labelledby="work-title">
          <div className="section-rail section-rail--light" data-reveal>
            <span>03</span>
            <span>SELECTED WORK / PUBLIC SIGNALS</span>
          </div>
          <div className="work-header" data-reveal>
            <div>
              <p className="micro-label">BUILT, SHIPPED, REMEMBERED</p>
              <h2 id="work-title">WORK THAT<br />LEFT THE SCREEN.</h2>
            </div>
            <p>
              从机器人控制到交换机运维，
              <br />
              从系统工具到记忆型网页。
            </p>
          </div>
          <div className="project-grid">
            {projects.map((project) => (
              <a
                className={`project-card project-card--${project.accent}`}
                href={project.href}
                target="_blank"
                rel="noreferrer"
                key={project.index}
                onMouseMove={handleCardPointer}
                data-reveal
              >
                <span className="project-card__glow" aria-hidden="true" />
                <div className="project-card__top">
                  <span>{project.index}</span>
                  <span>{project.category}</span>
                </div>
                <div className="project-card__visual" aria-hidden="true">
                  <span>{project.title.slice(0, 2).toUpperCase()}</span>
                  <i />
                  <i />
                </div>
                <div className="project-card__content">
                  <h3>{project.title}</h3>
                  <p>{project.description}</p>
                  <div className="project-card__footer">
                    <span>{project.tags.join(' / ')}</span>
                    <Arrow />
                  </div>
                </div>
              </a>
            ))}
          </div>
        </section>

        <section className="portals section-shell" id="links" aria-labelledby="links-title">
          <div className="section-rail" data-reveal>
            <span>04</span>
            <span>THREE COORDINATES</span>
          </div>
          <div className="portals-header" data-reveal>
            <p className="micro-label">FOLLOW THE SIGNAL</p>
            <h2 id="links-title">THREE DOORS.<br />SAME BUILDER.</h2>
          </div>
          <div className="portal-list">
            {portals.map((portal) => (
              <a
                className="portal-row"
                href={portal.href}
                target="_blank"
                rel="noreferrer"
                key={portal.index}
                data-reveal
              >
                <span className="portal-row__index">{portal.index}</span>
                <span className="portal-row__eyebrow">{portal.eyebrow}</span>
                <span className="portal-row__name">
                  <strong>{portal.title}</strong>
                  <small>{portal.domain}</small>
                </span>
                <span className="portal-row__detail">{portal.detail}</span>
                <span className="portal-row__arrow"><Arrow /></span>
              </a>
            ))}
          </div>
        </section>

        <section className="manifesto" aria-label="个人宣言">
          <div className="manifesto__grid" aria-hidden="true" />
          <div className="manifesto__content" data-reveal>
            <span className="micro-label">// KEEP BUILDING</span>
            <p>
              让代码离开屏幕，
              <br />
              进入设备、网络与
              <br />
              <em>真实生活。</em>
            </p>
          </div>
          <div className="manifesto__meta" data-reveal>
            <span>SHENZHEN / CN</span>
            <span>{shenzhenTime} CST</span>
            <span>BUILD STATUS: ALWAYS ITERATING</span>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div>
          <a className="wordmark" href="#top">
            ZR<span>//</span>ORG
          </a>
          <p>Systems, robots &amp; useful things.</p>
        </div>
        <div className="footer-links">
          <a href="https://github.com/zongruichd" target="_blank" rel="noreferrer">GITHUB</a>
          <a href="https://zongtech.xyz" target="_blank" rel="noreferrer">ZONGTECH</a>
          <a href="https://2022314.xyz" target="_blank" rel="noreferrer">2022314</a>
        </div>
        <div className="footer-end">
          <span>© {new Date().getFullYear()} ZONGRUI</span>
          <a href="#top">BACK TO TOP ↑</a>
        </div>
      </footer>
    </>
  )
}

export default App
