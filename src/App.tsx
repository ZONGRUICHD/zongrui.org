import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { articleApi } from './articles/api'
import { formatArticleDate } from './articles/pageMeta'
import type { PublicArticleSummary } from './articles/types'
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

function ContactSection() {
  const contacts = [
    {
      label: 'Telegram',
      handle: '@zongruichd',
      href: 'https://t.me/zongruichd',
      mark: 'TG',
      note: '发消息给我',
    },
    {
      label: 'X',
      handle: '@zongruichd',
      href: 'https://x.com/zongruichd',
      mark: 'X',
      note: '看看我最近在说什么',
    },
  ]

  return (
    <section className="contact-section" id="contact" aria-labelledby="contact-title">
      <div className="contact-section__inner">
        <div className="contact-section__intro" data-reveal>
          <p className="section-kicker">CONTACT / ELSEWHERE</p>
          <h2 id="contact-title">找到我。</h2>
          <p>Telegram 和 X 都用同一个用户名。</p>
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
              <span className="contact-card__mark" aria-hidden="true">{contact.mark}</span>
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

function RecentWritingSection() {
  const [articles, setArticles] = useState<PublicArticleSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    let active = true

    articleApi.list().then((page) => {
      if (!active) return
      setArticles(page.items.slice(0, 3))
      setError(false)
    }).catch(() => {
      if (active) setError(true)
    }).finally(() => {
      if (active) setLoading(false)
    })

    return () => { active = false }
  }, [retryKey])

  return (
    <section className="recent-work" id="latest" aria-labelledby="recent-work-title">
      <div className="recent-work__inner">
        <div className="recent-work__intro" data-reveal>
          <div>
            <p className="section-kicker">RECENT ARTICLES</p>
            <h2 id="recent-work-title">最近文章</h2>
          </div>
          <p>最近写的文章。</p>
        </div>

        <div className="recent-work__layout">
          <div className="recent-articles" data-reveal>
            <div className="recent-articles__header">
              <h3>最近文章</h3>
              <Link to="/articles">全部文章 <Arrow /></Link>
            </div>

            <div className="recent-articles__list" aria-live="polite" aria-busy={loading}>
              {loading && (
                <div className="recent-articles__skeleton">
                  <span className="sr-only">正在读取最近文章…</span>
                  {Array.from({ length: 3 }, (_, index) => <i aria-hidden="true" key={index} />)}
                </div>
              )}
              {!loading && error && (
                <div className="recent-articles__state recent-articles__state--error">
                  <strong>最近文章暂时读不到。</strong>
                  <Link to="/articles">打开文章页 <Arrow /></Link>
                  <button type="button" onClick={() => { setLoading(true); setRetryKey((value) => value + 1) }}>重试</button>
                </div>
              )}
              {!loading && !error && articles.length === 0 && (
                <p className="recent-articles__state">还没有公开文章。</p>
              )}
              {!loading && !error && articles.length > 0 && (
                <ol>
                  {articles.map((article, index) => (
                    <li key={article.id}>
                      <span className="recent-article__number">{String(index + 1).padStart(2, '0')}</span>
                      <div className="recent-article__copy">
                        <p>{formatArticleDate(article.publishedAt)} · {article.readingMinutes} MIN READ</p>
                        <h4><Link to={`/articles/${article.slug}`}>{article.title}</Link></h4>
                        <span>{article.summary}</span>
                      </div>
                      <span className="recent-article__arrow" aria-hidden="true">
                        <Arrow />
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
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
            <div className="hero__copy" data-reveal>
              <p className="hero-kicker">RUST · ROBOMASTER · LINUX · NETWORKS</p>
              <h1 id="hero-title">{'Programming in Ciallo～(∠・ω< )⌒★'}</h1>
              <div className="hero-actions">
                <a className="button button--dark" href="/#work">看看项目</a>
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

        <RecentWritingSection />
        <ActivityWalls />
        <ContactSection />
        <SiteVisitorCounter visible />
      </main>
    </SitePage>
  )
}

export default App
