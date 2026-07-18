import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { ThemeSwitcher } from '../components/ThemeSwitcher'
import { articleApi } from './api'
import { usePageMeta } from './pageMeta'
import type { AuthSession } from './types'

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  access_denied: '你取消了 GitHub 授权，尚未登录。可以重新尝试。',
  authorization_denied: '你取消了 GitHub 授权，尚未登录。可以重新尝试。',
  denied: '你取消了 GitHub 授权，尚未登录。可以重新尝试。',
  invalid_state: '这次登录请求已经失效或使用过，请重新登录。',
  invalid_or_expired_state: '这次登录请求已经失效或使用过，请重新登录。',
  oauth_state_invalid: '这次登录请求已经失效或使用过，请重新登录。',
  state_expired: '这次登录请求已经过期，请重新登录。',
  account_not_allowed: '当前 GitHub 账号没有 Console 权限，请切换到指定账号后重试。',
  not_admin: '当前 GitHub 账号没有 Console 权限，请切换到指定账号后重试。',
  unauthorized_account: '当前 GitHub 账号没有 Console 权限，请切换到指定账号后重试。',
  exchange_failed: 'GitHub 登录确认失败，请稍后重试。',
  github_oauth_exchange_failed: 'GitHub 登录确认失败，请稍后重试。',
  oauth_exchange_failed: 'GitHub 登录确认失败，请稍后重试。',
  github_error: 'GitHub 没有完成这次授权，请重新登录。',
  github_unavailable: '暂时无法连接 GitHub，请稍后重试。',
  login_failed: 'GitHub 登录失败，请重新尝试。',
  redirect_uri_mismatch: 'GitHub OAuth 回调地址不匹配，请检查登录配置。',
  callback_mismatch: 'GitHub OAuth 回调地址不匹配，请检查登录配置。',
  not_configured: 'GitHub 登录尚未配置完成。',
  oauth_not_configured: 'GitHub 登录尚未配置完成。',
}

function authErrorMessage(code: string | null) {
  if (!code) return ''
  return AUTH_ERROR_MESSAGES[code.trim().toLowerCase()] ?? 'GitHub 登录没有完成，请重新尝试。'
}

export function ConsoleGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [error, setError] = useState('')
  const [retryKey, setRetryKey] = useState(0)
  const location = useLocation()
  const authError = authErrorMessage(new URLSearchParams(location.search).get('authError'))

  const login = () => {
    const params = new URLSearchParams(location.search)
    params.delete('authError')
    const search = params.toString()
    articleApi.login(`${location.pathname}${search ? `?${search}` : ''}${location.hash}`)
  }

  const retrySession = () => {
    setError('')
    setSession(null)
    setRetryKey((key) => key + 1)
  }

  usePageMeta({ title: 'Articles Console — ZongRui', noIndex: true, language: 'zh-CN', ogLocale: 'zh_CN' })

  useEffect(() => {
    let active = true
    articleApi.session().then((next) => {
      if (active) setSession(next)
    }).catch(() => {
      if (active) setError('暂时无法确认登录状态。')
    })
    return () => { active = false }
  }, [retryKey])

  if (error) {
    return (
      <main className="console-gate" id="main-content">
        <ThemeSwitcher className="console-gate__theme-switcher" />
        <div className="console-gate__notice" role="alert">
          <p className="articles-kicker">SESSION CHECK FAILED</p>
          <strong>Console 暂时不可用</strong>
          <p>{error}请检查网络后重试。</p>
        </div>
        <div className="console-gate__actions">
          <button className="articles-primary-button" type="button" onClick={retrySession}>重新检查</button>
          <Link to="/articles">← 回到文章</Link>
        </div>
      </main>
    )
  }
  if (!session) return <main className="console-gate" id="main-content" aria-busy="true"><p>正在检查管理员身份…</p></main>
  if (!session.authenticated) {
    return (
      <main className="console-gate" id="main-content">
        <ThemeSwitcher className="console-gate__theme-switcher" />
        <img src="/avatar.jpg" alt="" />
        <p className="articles-kicker">ZONGRUI ARTICLES / PRIVATE CONSOLE</p>
        <h1>文章管理台</h1>
        <p>只允许指定的 GitHub 账号进入。</p>
        {authError && <div className="console-gate__notice" role="alert"><strong>GitHub 登录未完成</strong><p>{authError}</p></div>}
        <button className="articles-primary-button" type="button" onClick={login}>GitHub 登录</button>
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
        <ThemeSwitcher className="console-theme-switcher" />
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
