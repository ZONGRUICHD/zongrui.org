import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { articleApi } from './articles/api'
import { usePageMeta } from './articles/pageMeta'
import { ActivityWalls } from './components/ActivityWalls'
import { DEFAULT_PROFILE_BIO, ProfileBio } from './components/ProfileBio'
import { Arrow, SitePage } from './components/SiteChrome'
import { SiteVisitorCounter } from './components/SiteVisitorCounter'
import { PixelIcon } from './pixel/PixelIcons'

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

function WeChatIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M9.2 3C4.67 3 1 6.14 1 10c0 2.18 1.18 4.13 3.03 5.42l-.77 2.55 2.93-1.45c.94.31 1.95.48 3.01.48.34 0 .68-.02 1.01-.05A6.75 6.75 0 0 1 9.5 14c0-3.66 3.14-6.63 7.13-6.63.18 0 .36.01.54.02C15.98 4.8 12.89 3 9.2 3Zm-2.7 5.25a1.05 1.05 0 1 1 0-2.1 1.05 1.05 0 0 1 0 2.1Zm5.4 0a1.05 1.05 0 1 1 0-2.1 1.05 1.05 0 0 1 0 2.1Z" />
      <path d="M23 14c0-3.04-2.85-5.5-6.37-5.5s-6.38 2.46-6.38 5.5 2.86 5.5 6.38 5.5c.82 0 1.6-.13 2.32-.36l2.28 1.13-.6-2A5.28 5.28 0 0 0 23 14Zm-8.48-.72a.82.82 0 1 1 0-1.64.82.82 0 0 1 0 1.64Zm4.22 0a.82.82 0 1 1 0-1.64.82.82 0 0 1 0 1.64Z" />
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
    {
      label: '微信',
      handle: 'zongruichd',
      href: 'weixin://dl/chat?zongruichd',
      icon: <WeChatIcon />,
      note: '微信号',
    },
  ]

  return (
    <section
      className="contact-section"
      id="contact"
      aria-labelledby="contact-title"
    >
      <div className="contact-section__inner">
        <div className="contact-section__intro">
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

function WebsiteStories() {
  return (
    <section
      className="web-stories"
      id="web"
      aria-labelledby="web-title"
    >
      <div className="section-intro">
        <div>
          <p className="section-kicker">WEB / MEMORY / NOTES</p>
          <h2 id="web-title">我的网站们</h2>
        </div>
      </div>

      <div className="story-grid">
        <a
          className="story-card story-card--memory"
          href="https://2022314.xyz"
          target="_blank"
          rel="noreferrer"
        >
          <div className="site-capture site-capture--memory">
            <img
              src="/assets/2022314-home.webp"
              alt="2022314.xyz 初中毕业纪念网站首页"
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

        <a
          className="story-card story-card--notes"
          href="https://zongtech.xyz"
          target="_blank"
          rel="noreferrer"
        >
          <div className="site-capture site-capture--notes">
            <img
              src="/assets/zongtech-home.webp"
              alt="zongtech.xyz 网站首页"
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
  )
}

function App() {
  const navigate = useNavigate()
  const [bio, setBio] = useState(DEFAULT_PROFILE_BIO)
  const [search, setSearch] = useState('')
  const today = new Date()

  useEffect(() => {
    const controller = new AbortController()
    articleApi.profile()
      .then(({ profile }) => {
        if (!controller.signal.aborted && profile.bio.trim()) setBio(profile.bio)
      })
      .catch(() => undefined)
    return () => controller.abort()
  }, [])

  usePageMeta({
    title: 'ZongRui — Rust / RoboMaster / Linux',
    description: 'ZongRui 的个人主页，放着文章、网站、GitHub 与 Codex 活动记录。',
    canonical: 'https://zongrui.org/',
    image: 'https://zongrui.org/og-image.png',
    language: 'zh-CN',
    ogLocale: 'zh_CN',
  })

  const submitSearch = (event: FormEvent) => {
    event.preventDefault()
    const query = search.trim()
    navigate(query ? `/articles?q=${encodeURIComponent(query)}` : '/articles')
  }

  return (
    <SitePage>
      <main className="home-page" id="main-content">
        <section
          className="hero"
          id="top"
          aria-labelledby="hero-title"
        >
          <div className="hero__ambient" aria-hidden="true">
            <span className="hero__ambient-disc hero__ambient-disc--one" />
            <span className="hero__ambient-disc hero__ambient-disc--two" />
          </div>
          <div className="hero__inner">
            <div className="pixel-at-a-glance">
              <time dateTime={today.toISOString()}>{today.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}</time>
              <span>深圳 · ZongRui 的个人空间</span>
            </div>
            <div className="hero-profile">
              <img className="hero-profile__avatar" src="/avatar.jpg" alt="ZongRui 的企鹅头像" />
              <h1 id="hero-title">ZongRui</h1>
              <p>{'Programming in Ciallo～(∠・ω< )⌒★'}</p>
            </div>
            <div className="hero-bio-wrap">
              <ProfileBio bio={bio} className="hero-bio" idPrefix="home-profile" />
            </div>
            <form className="pixel-launcher-search" role="search" onSubmit={submitSearch}>
              <PixelIcon name="article" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索文章" aria-label="搜索文章" />
              <button type="submit" aria-label="开始搜索"><img src="/avatar.jpg" alt="" /></button>
            </form>
          </div>
        </section>

        <WebsiteStories />
        <ContactSection />
        <div className="home-visitors">
          <div><SiteVisitorCounter visible /></div>
        </div>
        <div className="home-activity" data-activity-root>
          <div><ActivityWalls /></div>
        </div>
      </main>
    </SitePage>
  )
}

export default App
