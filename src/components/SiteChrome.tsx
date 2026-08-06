import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { PixelShell } from '../pixel/PixelShell'

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
        <nav className="footer-links" aria-label="页尾链接">
          <Link to="/articles">文章</Link>
          <Link to="/gallery">图片</Link>
          <Link to="/projects">技术作品</Link>
          <a href="https://github.com/zongruichd" target="_blank" rel="noreferrer">GitHub</a>
          <a href="https://zongtech.xyz" target="_blank" rel="noreferrer">ZongTech</a>
          <a href="https://2022314.xyz" target="_blank" rel="noreferrer">2022314</a>
        </nav>
        <details className="footer-meta" data-privacy="network-counter">
          <summary>关于此网站</summary>
          <span>© {new Date().getFullYear()} ZongRui</span>
          <span>No ads. No cross-site tracking. Privacy-preserving network counters.</span>
          <span>
            Typography: JetBrains Mono · HarmonyOS Sans SC ·{' '}
            <a href="/assets/HarmonyOS-Sans-LICENSE.txt">License</a>
          </span>
          <a href="#top">返回顶部</a>
        </details>
      </div>
    </footer>
  )
}

export function SitePage({
  children,
  compactHeader = false,
}: {
  children: ReactNode
  compactHeader?: boolean
}) {
  return (
    <PixelShell compact={compactHeader}>
      {children}
      <SiteFooter />
    </PixelShell>
  )
}
