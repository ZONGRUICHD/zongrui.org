import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { articleApi } from './api'
import { ConsoleGate } from './ConsoleLayout'
import { formatArticleDate } from './pageMeta'
import type { AdminArticleSummary, ArticleStatus } from './types'

const statuses: Array<{ value: '' | ArticleStatus; label: string }> = [
  { value: '', label: '全部' },
  { value: 'draft', label: '草稿' },
  { value: 'scheduled', label: '定时' },
  { value: 'published', label: '已发布' },
  { value: 'archived', label: '已归档' },
]

const statusLabel: Record<ArticleStatus, string> = {
  draft: '草稿',
  scheduled: '定时发布',
  published: '已发布',
  archived: '已归档',
}

export function ConsolePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const status = searchParams.get('status') ?? ''
  const [articles, setArticles] = useState<AdminArticleSummary[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async (cursor?: string) => {
    try {
      const page = await articleApi.adminList(status || undefined, cursor)
      setArticles((current) => cursor ? [...current, ...page.items] : page.items)
      setNextCursor(page.nextCursor)
      setError('')
    } catch {
      setError('文章列表读取失败。')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    void load()
  }, [status])

  return (
    <ConsoleGate>
      <main className="console-main" id="main-content">
        <header className="console-page-heading">
          <div><p className="articles-kicker">CONTENT / {articles.length} ITEMS</p><h1>文章</h1></div>
          <Link className="articles-primary-button" to="/articles/console/new">+  新文章</Link>
        </header>
        <div className="console-status-tabs" role="group" aria-label="文章状态">
          {statuses.map((item) => (
            <button type="button" className={status === item.value ? 'is-active' : ''} aria-pressed={status === item.value} onClick={() => setSearchParams(item.value ? { status: item.value } : {})} key={item.value}>
              {item.label}
            </button>
          ))}
        </div>
        <div className="console-article-list" aria-busy={loading}>
          {loading && <p>正在读取文章…</p>}
          {error && <p role="alert">{error}</p>}
          {!loading && !error && articles.length === 0 && <div className="console-empty"><strong>这里还是空的。</strong><p>写第一篇文章，它会先保存为草稿。</p><Link to="/articles/console/new">开始写 →</Link></div>}
          {articles.map((article) => (
            <article className="console-article-row" key={article.id}>
              <div className={`console-status console-status--${article.status}`}>{statusLabel[article.status]}</div>
              <div><h2><Link to={`/articles/console/edit/${article.id}`}>{article.title || '无标题'}</Link></h2><p>{article.summary || '还没有摘要。'}</p></div>
              <div className="console-article-row__meta"><span>REV {article.revision}</span><time dateTime={article.updatedAt}>{formatArticleDate(article.updatedAt)}</time></div>
              <Link className="console-edit-link" to={`/articles/console/edit/${article.id}`}>编辑 →</Link>
            </article>
          ))}
          {nextCursor && <button className="articles-secondary-button" type="button" onClick={() => void load(nextCursor)}>更多文章</button>}
        </div>
      </main>
    </ConsoleGate>
  )
}
