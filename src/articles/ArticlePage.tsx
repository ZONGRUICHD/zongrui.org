import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { SitePage } from '../components/SiteChrome'
import { articleApi, ApiError } from './api'
import { Comments } from './Comments'
import { formatArticleDate, usePageMeta } from './pageMeta'
import type { PublicArticle } from './types'

type Heading = { id: string; text: string; level: number }

function prepareArticleHtml(source: string) {
  const documentFragment = new DOMParser().parseFromString(source, 'text/html')
  const headings: Heading[] = []
  documentFragment.querySelectorAll<HTMLHeadingElement>('h2, h3').forEach((heading, index) => {
    const id = heading.id || `section-${index + 1}`
    heading.id = id
    headings.push({ id, text: heading.textContent?.trim() ?? '', level: Number(heading.tagName.slice(1)) })
  })
  return { html: documentFragment.body.innerHTML, headings }
}

export function ArticlePage() {
  const { slug = '' } = useParams()
  const [article, setArticle] = useState<PublicArticle | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setNotFound(false)
    setError('')
    articleApi.get(slug).then(({ article: loaded }) => {
      if (active) setArticle(loaded)
    }).catch((caught) => {
      if (!active) return
      if (caught instanceof ApiError && caught.status === 404) setNotFound(true)
      else setError('文章服务器暂时离线。如果你以前读过这篇文章，可以尝试刷新以使用边缘缓存。')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [slug])

  const prepared = useMemo(() => article ? prepareArticleHtml(article.contentHtml) : { html: '', headings: [] }, [article])
  const jsonLd = useMemo(() => article ? {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.summary,
    datePublished: article.publishedAt,
    dateModified: article.updatedAt,
    image: article.coverUrl || undefined,
    author: { '@type': 'Person', name: 'ZongRui', url: 'https://zongrui.org' },
    mainEntityOfPage: `https://zongrui.org/articles/${article.slug}`,
  } : undefined, [article])

  usePageMeta({
    title: article ? `${article.title} — ZongRui` : '文章 — ZongRui',
    description: article?.summary,
    canonical: article ? `https://zongrui.org/articles/${article.slug}` : undefined,
    image: article?.coverUrl,
    noIndex: notFound,
    jsonLd,
  })

  return (
    <SitePage compactHeader>
      <main id="main-content" className="article-page">
        {loading && <div className="article-loading" aria-label="正在读取文章" aria-busy="true"><span /><span /><span /></div>}
        {!loading && notFound && (
          <section className="article-error" id="top">
            <p className="articles-kicker">404 / ARTICLE NOT FOUND</p>
            <h1>这篇文章不在这里。</h1>
            <Link className="articles-primary-button" to="/articles">回到文章列表</Link>
          </section>
        )}
        {!loading && error && (
          <section className="article-error" id="top" role="alert">
            <p className="articles-kicker">ORIGIN OFFLINE</p>
            <h1>暂时读不到这篇文章。</h1>
            <p>{error}</p>
            <button type="button" className="articles-primary-button" onClick={() => window.location.reload()}>重试</button>
          </section>
        )}
        {!loading && article && (
          <>
            <header className="article-header" id="top">
              <div className="article-header__inner">
                <Link className="article-back" to="/articles">← 所有文章</Link>
                <p className="articles-kicker">ARTICLE / {formatArticleDate(article.publishedAt)}</p>
                <h1>{article.title}</h1>
                <p className="article-deck">{article.summary}</p>
                <div className="article-byline">
                  <span>ZongRui</span>
                  <span>{article.readingMinutes} MIN READ</span>
                  <time dateTime={article.updatedAt}>更新于 {formatArticleDate(article.updatedAt)}</time>
                </div>
                <div className="article-row__tags">{article.tags.map((tag) => <Link to={`/articles?tag=${encodeURIComponent(tag)}`} key={tag}>{tag}</Link>)}</div>
              </div>
              {article.coverUrl && <img className="article-cover" src={article.coverUrl} alt="" />}
            </header>
            <div className="article-layout">
              {prepared.headings.length > 0 && (
                <aside className="article-toc" aria-label="文章目录">
                  <p>ON THIS PAGE</p>
                  <ol>{prepared.headings.map((heading) => <li className={`is-level-${heading.level}`} key={heading.id}><a href={`#${heading.id}`}>{heading.text}</a></li>)}</ol>
                </aside>
              )}
              <article className="article-prose" dangerouslySetInnerHTML={{ __html: prepared.html }} />
            </div>
            <div className="article-comments-wrap"><Comments slug={article.slug} /></div>
          </>
        )}
      </main>
    </SitePage>
  )
}
