import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { articleApi } from './articles/api'
import { usePageMeta } from './articles/pageMeta'
import { ActivityWalls } from './components/ActivityWalls'
import { Arrow, SitePage } from './components/SiteChrome'
import { SiteVisitorCounter } from './components/SiteVisitorCounter'

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
  projectLogTag?: string
  projectLogLabel?: string
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

function TelegramIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M23.91 3.79 20.3 20.84c-.27 1.21-.98 1.5-1.99.93l-5.5-4.05-2.65 2.55c-.29.29-.54.54-1.11.54l.4-5.6 10.19-9.2c.44-.4-.1-.62-.69-.23L6.36 13.7.94 12c-1.18-.37-1.2-1.18.25-1.75L22.4 2.08c.98-.36 1.84.24 1.51 1.71Z" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
    </svg>
  )
}

function ContactSection() {
  const contacts = [
    {
      label: 'Telegram',
      handle: '@zongruichd',
      href: 'https://t.me/zongruichd',
      icon: <TelegramIcon />,
      note: '发消息给我',
    },
    {
      label: 'X',
      handle: '@zongruichd',
      href: 'https://x.com/zongruichd',
      icon: <XIcon />,
      note: '看看我最近在说什么',
    },
  ]

  return (
    <section className="contact-section" id="contact" aria-labelledby="contact-title">
      <div className="contact-section__inner">
        <div className="contact-section__intro" data-reveal>
          <p className="section-kicker">CONTACT / ELSEWHERE</p>
          <h2 id="contact-title">联系方式</h2>
        </div>
        <div className="contact-grid" aria-label="联系方式">
          {contacts.map((contact, index) => (
            <a
              className="contact-card"
              href={contact.href}
              target="_blank"
              rel="noreferrer"
              key={contact.label}
              data-reveal
            >
              <span className="contact-card__index">0{index + 1}</span>
              <span className="contact-card__mark">{contact.icon}</span>
              <span className="contact-card__copy">
                <small>{contact.label}</small>
                <strong>{contact.handle}</strong>
                <span>{contact.note}</span>
              </span>
              <Arrow />
            </a>
          ))}
        </div>
      </div>
    </section>
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
  projectLogTag,
  projectLogLabel = '查看项目日志',
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
          <div className="feature-band__actions">
            <a className="button button--light" href={href} target="_blank" rel="noreferrer">
              {cta} <Arrow />
            </a>
            {projectLogTag && (
              <Link className="feature-band__log-link" to={`/articles?tag=${encodeURIComponent(projectLogTag)}`}>
                {projectLogLabel} <Arrow />
              </Link>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

function App() {
  const [articleTags, setArticleTags] = useState<Set<string>>(() => new Set())

  usePageMeta({
    title: 'ZongRui — Rust / RoboMaster / Linux',
    description: 'ZongRui 的个人主页，放着我写的 Rust、RoboMaster、Linux、网络和网页项目。',
    canonical: 'https://zongrui.org/',
    image: 'https://zongrui.org/og-image.png',
    language: 'zh-CN',
    ogLocale: 'zh_CN',
  })

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

    return () => {
      observer.disconnect()
      root.classList.remove('js')
    }
  }, [])

  useEffect(() => {
    let active = true
    articleApi.tags().then(({ items }) => {
      if (active) setArticleTags(new Set(items.map((tag) => tag.slug)))
    }).catch(() => {
      // Project-log links stay hidden when the tag index is unavailable.
    })
    return () => { active = false }
  }, [])

  return (
    <SitePage>
      <main id="main-content">
        <section className="hero" id="top" aria-labelledby="hero-title">
          <div className="hero__inner">
            <div className="hero-profile" data-reveal>
              <img className="hero-profile__avatar" src="/avatar.jpg" alt="ZongRui 的企鹅头像" />
              <h1 id="hero-title">ZongRui</h1>
              <p>{'Programming in Ciallo～(∠・ω< )⌒★'}</p>
            </div>
            <ActivityWalls embedded />
          </div>
        </section>

        <section className="about-placeholder" id="about" aria-labelledby="about-placeholder-title">
          <h2 className="sr-only" id="about-placeholder-title">个人介绍</h2>
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
            projectLogTag={articleTags.has('robomaster') ? 'robomaster' : undefined}
            projectLogLabel="RoboMaster 项目日志"
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
            projectLogTag={articleTags.has('arista') ? 'arista' : undefined}
            projectLogLabel="Arista 项目日志"
          />
        </section>

        <section className="web-stories" id="web" aria-labelledby="web-title">
          <div className="section-intro" data-reveal>
            <div>
              <p className="section-kicker">WEB / MEMORY / NOTES</p>
              <h2 id="web-title">我的网站们</h2>
            </div>
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
                <h3>初中毕业纪念</h3>
                <span className="story-card__arrow"><Arrow /></span>
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
                <span className="story-card__arrow"><Arrow /></span>
              </div>
            </a>
          </div>
        </section>

        <ContactSection />
        <SiteVisitorCounter visible />
      </main>
    </SitePage>
  )
}

export default App
