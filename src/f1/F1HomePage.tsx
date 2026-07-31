import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { ActivityWalls } from '../components/ActivityWalls'
import { SiteVisitorCounter } from '../components/SiteVisitorCounter'
import { useF1PageMotion } from './useF1Motion'

const websites = [
  {
    index: '01',
    kicker: 'MEMORY / ARCHIVE',
    title: '初中毕业纪念',
    url: 'https://2022314.xyz',
    domain: '2022314.XYZ',
    image: '/assets/2022314-home.webp',
    alt: '2022314.xyz 初中毕业纪念网站首页',
  },
  {
    index: '02',
    kicker: 'WRITING / BUILD LOG',
    title: 'ZongTech',
    url: 'https://zongtech.xyz',
    domain: 'ZONGTECH.XYZ',
    image: '/assets/zongtech-home.webp',
    alt: 'zongtech.xyz 网站首页',
  },
] as const

const contacts = [
  { index: '01', label: 'TELEGRAM', value: '@zongruichd', href: 'https://t.me/zongruichd' },
  { index: '02', label: 'X', value: '@zongruichd', href: 'https://x.com/zongruichd' },
  { index: '03', label: 'WECHAT', value: 'zongruichd', href: 'weixin://dl/chat?zongruichd' },
] as const

export function F1HomePage() {
  const pageRef = useRef<HTMLElement>(null)
  useF1PageMotion(pageRef)

  return (
    <main className="f1-home" id="main-content" ref={pageRef}>
      <section className="f1-hero" id="top" aria-labelledby="f1-hero-title">
        <div className="f1-hero__speed" aria-hidden="true">
          <span /><span /><span /><span />
        </div>
        <div className="f1-hero__copy">
          <p className="f1-kicker"><span>01</span> PERSONAL PADDOCK / SHENZHEN</p>
          <h1 id="f1-hero-title">
            <span className="f1-line-mask"><span data-f1-hero-line>ZONG</span></span>
            <span className="f1-line-mask"><span data-f1-hero-line>RUI<i>.</i></span></span>
          </h1>
          <p className="f1-hero__epitaph" data-f1-hero-line>
            Programming in Ciallo～<br />(∠・ω&lt; )⌒★
          </p>
          <div className="f1-hero__actions" data-f1-hero-line>
            <Link className="f1-button f1-button--red" to="/projects"><span>查看技术作品</span><i>↗</i></Link>
            <Link className="f1-text-link" to="/articles">进入文章区 <span>→</span></Link>
          </div>
          <span className="f1-hero__rule" data-f1-hero-rule aria-hidden="true" />
        </div>

        <div className="f1-hero__portrait" data-f1-media>
          <div className="f1-hero__portrait-frame">
            <img src="/avatar.jpg" alt="ZongRui 的企鹅头像" data-f1-parallax />
            <span className="f1-hero__portrait-scan" aria-hidden="true" />
          </div>
          <div className="f1-hero__identity">
            <span>ZR</span>
            <div><strong>ZONGRUI</strong><small>BUILDER / DEVELOPER / EXPLORER</small></div>
          </div>
          <dl className="f1-hero__telemetry">
            <div><dt>FOCUS</dt><dd>RUST</dd></div>
            <div><dt>FIELD</dt><dd>ROBOTICS</dd></div>
            <div><dt>UPLINK</dt><dd>LINUX</dd></div>
          </dl>
        </div>

        <div className="f1-hero__side-code" aria-hidden="true">
          <span>ZR / 0831</span><span>22.5431° N</span><span>114.0579° E</span>
        </div>
        <div className="f1-scroll-cue" aria-hidden="true"><span>SCROLL TO RACE</span><i /></div>
      </section>

      <section className="f1-telemetry" aria-labelledby="f1-telemetry-title">
        <header className="f1-section-head" data-f1-reveal>
          <div>
            <p className="f1-kicker"><span>02</span> LIVE DEVELOPMENT TELEMETRY</p>
            <h2 id="f1-telemetry-title">代码活动</h2>
          </div>
          <p>GitHub 提交与 Codex 使用记录，按时间留在这条数据线上。</p>
        </header>
        <div className="f1-telemetry__walls" data-f1-reveal>
          <ActivityWalls embedded />
        </div>
      </section>

      <section className="f1-project-callout" aria-labelledby="f1-project-callout-title">
        <div className="f1-project-callout__number" aria-hidden="true">03</div>
        <div className="f1-project-callout__copy" data-f1-reveal>
          <p className="f1-kicker"><span>03</span> FEATURED ENGINEERING</p>
          <h2 id="f1-project-callout-title">让机器<br />真正跑起来。</h2>
          <p>Rust、RoboMaster、Linux 和交换网络。项目页记录系统怎么连接、为什么这样做，以及目前能跑到哪一步。</p>
          <Link className="f1-button f1-button--light" to="/projects"><span>打开技术档案</span><i>→</i></Link>
        </div>
        <div className="f1-project-callout__spec" data-f1-reveal>
          <span>PROJECT 01</span>
          <strong>RM ROBOT RUST CONTROL FRAMEWORK</strong>
          <small>STM32F407 / CAN / NO_STD / ROBOMASTER</small>
          <Link to="/projects/rm-robot-rust">查看完整项目 ↗</Link>
        </div>
      </section>

      <section className="f1-websites" id="web" aria-labelledby="f1-websites-title">
        <header className="f1-section-head f1-section-head--dark" data-f1-reveal>
          <div>
            <p className="f1-kicker"><span>04</span> WEB / MEMORY / NOTES</p>
            <h2 id="f1-websites-title">我的网站们</h2>
          </div>
          <p>做过的网页，留下来的照片和日志。</p>
        </header>
        <div className="f1-websites__grid">
          {websites.map((website) => (
            <a href={website.url} target="_blank" rel="noreferrer" className="f1-website-card" key={website.url} data-f1-reveal>
              <div className="f1-website-card__image">
                <img src={website.image} alt={website.alt} loading="lazy" data-f1-parallax />
                <span>{website.domain} / LIVE CAPTURE</span>
              </div>
              <div className="f1-website-card__copy">
                <span>{website.index}</span>
                <div><small>{website.kicker}</small><strong>{website.title}</strong></div>
                <i aria-hidden="true">↗</i>
              </div>
            </a>
          ))}
        </div>
      </section>

      <section className="f1-contact" id="contact" aria-labelledby="f1-contact-title">
        <header data-f1-reveal>
          <p className="f1-kicker"><span>05</span> OPEN RADIO CHANNEL</p>
          <h2 id="f1-contact-title">联系<br />方式。</h2>
        </header>
        <div className="f1-contact__list">
          {contacts.map((contact) => (
            <a href={contact.href} target="_blank" rel="noreferrer" key={contact.label} data-f1-reveal>
              <small>{contact.index}</small><span>{contact.label}</span><strong>{contact.value}</strong><i>↗</i>
            </a>
          ))}
        </div>
      </section>

      <section className="f1-visitors" aria-label="网站访问统计" data-f1-reveal>
        <div>
          <p className="f1-kicker"><span>06</span> SITE COUNTER / LIVE</p>
          <h2>有人<br />来过。</h2>
        </div>
        <SiteVisitorCounter visible />
      </section>
    </main>
  )
}
