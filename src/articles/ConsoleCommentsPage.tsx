import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { articleApi } from './api'
import { ConsoleGate } from './ConsoleLayout'
import { formatArticleDate } from './pageMeta'
import type { AdminComment } from './types'

export function ConsoleCommentsPage() {
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? ''
  const [comments, setComments] = useState<AdminComment[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const load = async (cursor?: string) => {
    try {
      const page = await articleApi.adminComments(status || undefined, cursor)
      setComments((current) => cursor ? [...current, ...page.items] : page.items)
      setNextCursor(page.nextCursor)
      setError('')
    } catch {
      setError('评论列表读取失败。')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    void load()
  }, [status])

  const moderate = async (comment: AdminComment, action: 'hide' | 'restore' | 'delete') => {
    setBusy(comment.id)
    try {
      const { comment: updated } = await articleApi.moderateComment(comment.id, action)
      setComments((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '评论处理失败。')
    } finally {
      setBusy('')
    }
  }

  return (
    <ConsoleGate>
      <main className="console-main" id="main-content">
        <header className="console-page-heading"><div><p className="articles-kicker">COMMENTS / MODERATION</p><h1>评论</h1></div></header>
        <div className="console-status-tabs" role="group" aria-label="评论状态">
          {[['', '全部'], ['visible', '可见'], ['hidden', '已隐藏'], ['deleted', '已删除']].map(([value, label]) => (
            <button type="button" className={status === value ? 'is-active' : ''} aria-pressed={status === value} onClick={() => setParams(value ? { status: value } : {})} key={value}>{label}</button>
          ))}
        </div>
        <div className="console-comment-list" aria-busy={loading}>
          {loading && <p>正在读取评论…</p>}
          {error && <p role="alert">{error}</p>}
          {!loading && comments.length === 0 && <div className="console-empty"><strong>还没有评论。</strong></div>}
          {comments.map((comment) => (
            <article className="console-comment" key={comment.id}>
              <header><div><strong>{comment.nickname}</strong><time dateTime={comment.createdAt}>{formatArticleDate(comment.createdAt)}</time></div><span>{comment.status}</span></header>
              <p>{comment.status === 'deleted' ? '这条评论已删除。' : comment.body}</p>
              <footer>
                <Link to={`/articles/${comment.article.slug}`} target="_blank">《{comment.article.title}》 ↗</Link>
                <div>
                  {comment.status === 'visible' && <button type="button" disabled={busy === comment.id} onClick={() => void moderate(comment, 'hide')}>隐藏</button>}
                  {comment.status !== 'visible' && comment.status !== 'deleted' && <button type="button" disabled={busy === comment.id} onClick={() => void moderate(comment, 'restore')}>恢复</button>}
                  {comment.status !== 'deleted' && <button type="button" disabled={busy === comment.id} onClick={() => void moderate(comment, 'delete')}>删除</button>}
                </div>
              </footer>
            </article>
          ))}
          {nextCursor && <button className="articles-secondary-button" type="button" onClick={() => void load(nextCursor)}>更多评论</button>}
        </div>
      </main>
    </ConsoleGate>
  )
}
