import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { articleApi } from './api'
import { usePageMeta } from './pageMeta'
import type { AuthSession } from './types'

export function ConsoleGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [error, setError] = useState('')
  const location = useLocation()

  usePageMeta({ title: 'Articles Console — ZongRui', noIndex: true, language: 'zh-CN', ogLocale: 'zh_CN' })

  useEffect(() => {
    let active = true
    articleApi.session().then((next) => {
      if (active) setSession(next)
    }).catch(() => {
      if (active) setError('暂时无法确认登录状态。')
    })
    return () => { active = false }
  }, [])

  if (error) {
    return <main className="console-gate" id="main-content" role="alert"><strong>Console 不可用</strong><p>{error}</p><Link to="/articles">回到文章</Link></main>
  }
  if (!session) return <main className="console-gate" id="main-content" aria-busy="true"><p>正在检查管理员身份…</p></main>
  if (!session.authenticated) {
    return (
      <main className="console-gate" id="main-content">
        <img src="/avatar.jpg" alt="" />
        <p className="articles-kicker">ZONGRUI ARTICLES / PRIVATE CONSOLE</p>
        <h1>文章管理台</h1>
        <p>只允许指定的 GitHub 账号进入。</p>
        <button className="articles-primary-button" type="button" onClick={() => articleApi.login(`${location.pathname}${location.search}`)}>GitHub 登录</button>
        <Link to="/articles">← 回到文章</Link>
      </main>
    )
  }

  return <ConsoleLayout session={session}>{children}</ConsoleLayout>
}

function ConsoleLayout({ session, children }: { session: AuthSession; children: ReactNode }) {
  const [loggingOut, setLoggingOut] = useState(false)
  const logout = async () => {
    setLoggingOut(true)
    try {
      await articleApi.logout()
      window.location.assign('/articles')
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <div className="console-app">
      <header className="console-header">
        <Link className="console-brand" to="/articles/console"><img src="/avatar.jpg" alt="" /><span><strong>Articles Console</strong><small>ZongRui / Editor</small></span></Link>
        <nav aria-label="Console 导航">
          <NavLink end to="/articles/console">文章</NavLink>
          <NavLink to="/articles/console/new">写文章</NavLink>
          <NavLink to="/articles/console/comments">评论</NavLink>
          <Link to="/articles" target="_blank">查看网站 ↗</Link>
        </nav>
        <div className="console-user">
          {session.user?.avatarUrl && <img src={session.user.avatarUrl} alt="" />}
          <span>{session.user?.login ?? 'ZONGRUICHD'}</span>
          <button type="button" disabled={loggingOut} onClick={logout}>{loggingOut ? '正在退出…' : '退出'}</button>
        </div>
      </header>
      {children}
    </div>
  )
}
