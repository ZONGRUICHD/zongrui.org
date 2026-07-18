import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { usePageMeta } from './articles/pageMeta'
import { ActivityWalls } from './components/ActivityWalls'
import { Arrow, SitePage } from './components/SiteChrome'
import { SiteVisitorCounter } from './components/SiteVisitorCounter'
import { useHomeMotion } from './motion/useHomeMotion'

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
    <section
      className="contact-section motion-surface"
      id="contact"
      aria-labelledby="contact-title"
      data-scroll-reveal
      data-pointer-surface
    >
      <span className="contact-section__orbit" data-scroll-drift aria-hidden="true" />
      <div className="contact-section__inner">
        <div className="contact-section__intro" data-reveal-item>
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
              data-reveal-item
              data-pointer-tilt
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
      <span className="motion-line contact-section__line" aria-hidden="true" />
    </section>
  )
}

function ArticlePortal() {
  return (
    <section
      className="article-portal motion-surface"
      id="articles"
      aria-label="文章"
      data-scroll-reveal
      data-pointer-surface
    >
      <div className="article-portal__grid" aria-hidden="true" />
      <span className="article-portal__orbit article-portal__orbit--one" data-scroll-drift aria-hidden="true" />
      <span className="article-portal__orbit article-portal__orbit--two" data-scroll-drift aria-hidden="true" />
      <Link
        className="article-portal__link"
        to="/articles"
        aria-label="进入文章"
        data-reveal-item
        data-pointer-tilt
      >
        <span>文章</span>
      </Link>
      <span className="motion-line article-portal__line" data-line-origin="center center" aria-hidden="true" />
    </section>
  )
}

function WebsiteStories() {
  return (
    <section
      className="web-stories motion-surface"
      id="web"
      aria-labelledby="web-title"
      data-scroll-reveal
      data-pointer-surface
    >
      <div className="section-intro" data-reveal-item>
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
          data-reveal-item
          data-pointer-tilt
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
          data-reveal-item
          data-pointer-tilt
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
      <span className="motion-line web-stories__line" aria-hidden="true" />
    </section>
  )
}

function App() {
  const pageRef = useRef<HTMLElement>(null)
  useHomeMotion(pageRef)

  usePageMeta({
    title: 'ZongRui — Rust / RoboMaster / Linux',
    description: 'ZongRui 的个人主页，放着文章、网站、GitHub 与 Codex 活动记录。',
    canonical: 'https://zongrui.org/',
    image: 'https://zongrui.org/og-image.png',
    language: 'zh-CN',
    ogLocale: 'zh_CN',
  })

  return (
    <SitePage>
      <main className="home-page" id="main-content" ref={pageRef}>
        <section
          className="hero motion-surface"
          id="top"
          aria-labelledby="hero-title"
          data-pointer-surface
        >
          <div className="hero__ambient" aria-hidden="true">
            <span className="hero__ambient-disc hero__ambient-disc--one" data-ambient-float />
            <span className="hero__ambient-disc hero__ambient-disc--two" data-ambient-float />
            <span className="hero__ambient-line" data-scroll-drift />
          </div>
          <div className="hero__inner">
            <div className="hero-profile" data-hero-enter="profile" data-pointer-tilt>
              <img className="hero-profile__avatar" src="/avatar.jpg" alt="ZongRui 的企鹅头像" />
              <h1 id="hero-title">ZongRui</h1>
              <p>{'Programming in Ciallo～(∠・ω< )⌒★'}</p>
            </div>
            <div className="hero-activity" data-hero-enter="walls">
              <ActivityWalls embedded />
            </div>
          </div>
          <span className="motion-line hero__exit-line" aria-hidden="true" />
        </section>

        <ArticlePortal />
        <WebsiteStories />
        <ContactSection />
        <div className="home-visitors" data-scroll-reveal>
          <div data-reveal-item><SiteVisitorCounter visible /></div>
        </div>
      </main>
    </SitePage>
  )
}

export default App
