import { useEffect, useRef, useState, type FormEvent } from 'react'
import { articleApi } from './api'
import { formatArticleDate } from './pageMeta'
import type { ArticleComment } from './types'

const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined

function Turnstile({ onToken, resetKey }: { onToken: (token: string) => void; resetKey: number }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetRef = useRef<string | null>(null)

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !containerRef.current) return
    let cancelled = false

    const render = () => {
      if (cancelled || !window.turnstile || !containerRef.current || widgetRef.current) return
      widgetRef.current = window.turnstile.render(containerRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        action: 'turnstile-spin-v1',
        theme: 'light',
        size: 'flexible',
        callback: onToken,
        'expired-callback': () => onToken(''),
        'error-callback': () => onToken(''),
      })
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${TURNSTILE_SCRIPT}"]`)
    if (window.turnstile) render()
    else if (existing) existing.addEventListener('load', render, { once: true })
    else {
      const script = document.createElement('script')
      script.src = TURNSTILE_SCRIPT
      script.async = true
      script.defer = true
      script.addEventListener('load', render, { once: true })
      document.head.appendChild(script)
    }

    return () => {
      cancelled = true
      existing?.removeEventListener('load', render)
    }
  }, [onToken])

  useEffect(() => {
    if (!widgetRef.current) return
    window.turnstile?.reset(widgetRef.current)
    onToken('')
  }, [onToken, resetKey])

  if (!TURNSTILE_SITE_KEY) {
    return <p className="turnstile-missing" role="status">评论安全校验尚未配置。</p>
  }

  return <div className="turnstile-slot" ref={containerRef} aria-label="Cloudflare Turnstile 安全校验" />
}

function CommentEntry({ comment, onReply }: { comment: ArticleComment; onReply: (comment: ArticleComment) => void }) {
  const deleted = comment.status === 'deleted'
  return (
    <li className={`comment${comment.status !== 'visible' ? ` comment--${comment.status}` : ''}`}>
      <article>
        <header>
          <strong>{deleted ? '已删除的评论' : comment.nickname}</strong>
          <time dateTime={comment.createdAt}>{formatArticleDate(comment.createdAt)}</time>
        </header>
        <p>{deleted ? '这条评论已被删除。' : comment.body}</p>
        {!deleted && comment.status === 'visible' && <button type="button" onClick={() => onReply(comment)}>回复</button>}
      </article>
      {comment.replies.length > 0 && (
        <ol className="comment-replies">
          {comment.replies.map((reply) => <CommentEntry comment={reply} onReply={() => onReply(comment)} key={reply.id} />)}
        </ol>
      )}
    </li>
  )
}

export function Comments({ slug }: { slug: string }) {
  const [comments, setComments] = useState<ArticleComment[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [nickname, setNickname] = useState(() => localStorage.getItem('zr-comment-nickname') ?? '')
  const [body, setBody] = useState('')
  const [replyTo, setReplyTo] = useState<ArticleComment | null>(null)
  const [token, setToken] = useState('')
  const [resetKey, setResetKey] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState('')

  const load = async (cursor?: string) => {
    try {
      const page = await articleApi.comments(slug, cursor)
      setComments((current) => cursor ? [...current, ...page.items] : page.items)
      setNextCursor(page.nextCursor)
      setError('')
    } catch {
      setError('评论暂时无法读取。')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    void load()
  }, [slug])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const cleanNickname = nickname.trim()
    const cleanBody = body.trim()
    if (!cleanNickname || !cleanBody || !token) return
    setSubmitting(true)
    setNotice('')
    try {
      const { comment } = await articleApi.comment(slug, {
        nickname: cleanNickname,
        body: cleanBody,
        parentId: replyTo?.id,
        turnstileToken: token,
      })
      localStorage.setItem('zr-comment-nickname', cleanNickname)
      if (replyTo) {
        setComments((current) => current.map((item) => item.id === replyTo.id ? { ...item, replies: [...item.replies, comment] } : item))
      } else {
        setComments((current) => [...current, comment])
      }
      setBody('')
      setReplyTo(null)
      setResetKey((value) => value + 1)
      setNotice('评论已发布。')
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : '评论发布失败。')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="article-comments" aria-labelledby="comments-title">
      <div className="article-comments__heading">
        <p className="articles-kicker">COMMENTS</p>
        <h2 id="comments-title">评论</h2>
      </div>

      <form className="comment-form" onSubmit={submit}>
        {replyTo && <div className="comment-replying">正在回复 {replyTo.nickname}<button type="button" onClick={() => setReplyTo(null)}>取消</button></div>}
        <label htmlFor="comment-nickname">昵称</label>
        <input id="comment-nickname" value={nickname} maxLength={24} required onChange={(event) => setNickname(event.target.value)} autoComplete="nickname" />
        <label htmlFor="comment-body">评论</label>
        <textarea id="comment-body" value={body} minLength={1} maxLength={2000} required rows={5} onChange={(event) => setBody(event.target.value)} />
        <p className="comment-privacy">只保存你填写的昵称和评论。Turnstile 用于防止垃圾信息，不要在评论中留下私密资料。</p>
        <Turnstile onToken={setToken} resetKey={resetKey} />
        <button className="articles-primary-button" type="submit" disabled={submitting || !token || !nickname.trim() || !body.trim()}>{submitting ? '正在发布…' : '发布评论'}</button>
        {notice && <p className="comment-notice" role="status">{notice}</p>}
      </form>

      <div className="comments-list" aria-live="polite" aria-busy={loading}>
        {loading && <p>正在读取评论…</p>}
        {error && <p role="alert">{error}</p>}
        {!loading && !error && comments.length === 0 && <p>还没有评论。</p>}
        {comments.length > 0 && <ol>{comments.map((comment) => <CommentEntry comment={comment} onReply={setReplyTo} key={comment.id} />)}</ol>}
        {nextCursor && <button type="button" className="articles-secondary-button" onClick={() => void load(nextCursor)}>更多评论</button>}
      </div>
    </section>
  )
}
