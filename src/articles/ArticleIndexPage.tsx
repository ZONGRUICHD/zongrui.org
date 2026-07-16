import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { SitePage } from '../components/SiteChrome'
import { articleApi } from './api'
import { formatArticleDate, usePageMeta } from './pageMeta'
import type { PublicArticleSummary, Tag } from './types'

export function ArticleIndexPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''
  const selectedTag = searchParams.get('tag') ?? ''
  const archive = searchParams.get('archive') ?? ''
  const [search, setSearch] = useState(query)
  const [articles, setArticles] = useState<PublicArticleSummary[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')

  usePageMeta({
    title: '文章 — ZongRui',
    description: 'ZongRui 的个人介绍、技术记录和项目文章。',
    canonical: 'https://zongrui.org/articles',
  })

  useEffect(() => setSearch(query), [query])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    Promise.all([
      articleApi.list({ q: query, tag: selectedTag, archive, limit: 12 }),
      articleApi.tags(),
    ]).then(([page, tagPage]) => {
      if (!active) return
      setArticles(page.items)
      setNextCursor(page.nextCursor)
      setTags(tagPage.items)
    }).catch(() => {
      if (active) setError('文章服务器暂时离线。已缓存的文章仍可直接打开。')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [archive, query, selectedTag])

  const updateFilter = (next: { q?: string; tag?: string; archive?: string }) => {
    const params = new URLSearchParams(searchParams)
    Object.entries(next).forEach(([key, value]) => {
      if (value) params.set(key, value)
      else params.delete(key)
    })
    setSearchParams(params)
  }

  const submitSearch = (event: FormEvent) => {
    event.preventDefault()
    updateFilter({ q: search.trim() })
  }

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const page = await articleApi.list({ q: query, tag: selectedTag, archive, cursor: nextCursor, limit: 12 })
      setArticles((current) => [...current, ...page.items])
      setNextCursor(page.nextCursor)
    } catch {
      setError('后续文章暂时无法读取，可以稍后再试。')
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <SitePage compactHeader>
      <main id="main-content" className="articles-page">
        <section className="articles-hero" id="top">
          <div className="articles-shell">
            <p className="articles-kicker">ARTICLES / NOTES / PERSONAL LOG</p>
            <h1>文章</h1>
            <p>个人介绍、项目纪录，还有我想留下来的东西。</p>
            <a className="articles-rss-link" href="/api/articles/v1/rss.xml">RSS 订阅 ↗</a>
          </div>
        </section>

        <section className="articles-browser" aria-label="文章列表">
          <div className="articles-shell articles-browser__layout">
            <aside className="articles-filters">
              <form onSubmit={submitSearch} role="search">
                <label htmlFor="article-search">搜索文章</label>
                <div className="articles-search">
                  <input id="article-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="标题、摘要或正文" />
                  <button type="submit">搜索</button>
                </div>
              </form>
              <div className="articles-filter-group">
                <p>标签</p>
                <div className="articles-tag-list">
                  <button type="button" className={!selectedTag ? 'is-active' : ''} onClick={() => updateFilter({ tag: '' })}>全部</button>
                  {tags.map((tag) => (
                    <button type="button" className={selectedTag === tag.slug ? 'is-active' : ''} onClick={() => updateFilter({ tag: tag.slug })} key={tag.slug}>
                      {tag.name}{typeof tag.count === 'number' ? ` ${tag.count}` : ''}
                    </button>
                  ))}
                </div>
              </div>
              <label className="articles-archive">
                <span>归档</span>
                <select value={archive} onChange={(event) => updateFilter({ archive: event.target.value })}>
                  <option value="">全部时间</option>
                  {Array.from({ length: 8 }, (_, index) => String(new Date().getFullYear() - index)).map((year) => <option value={year} key={year}>{year}</option>)}
                </select>
              </label>
            </aside>

            <div className="articles-list" aria-live="polite" aria-busy={loading}>
              {loading && Array.from({ length: 3 }, (_, index) => <div className="article-row article-row--loading" key={index} />)}
              {!loading && error && <div className="articles-state articles-state--error" role="alert"><strong>连接不上后端</strong><p>{error}</p></div>}
              {!loading && !error && articles.length === 0 && (
                <div className="articles-state"><strong>没找到文章</strong><p>试试其他关键词，或清空标签和归档筛选。</p></div>
              )}
              {articles.map((article, index) => (
                <article className="article-row" key={article.id}>
                  <div className="article-row__number">{String(index + 1).padStart(2, '0')}</div>
                  <div className="article-row__body">
                    <p className="article-row__meta">{formatArticleDate(article.publishedAt)} · {article.readingMinutes} MIN READ</p>
                    <h2><Link to={`/articles/${article.slug}`}>{article.title}</Link></h2>
                    <p>{article.summary}</p>
                    <div className="article-row__tags">{article.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
                  </div>
                  <Link className="article-row__arrow" to={`/articles/${article.slug}`} aria-label={`阅读《${article.title}》`}>→</Link>
                </article>
              ))}
              {nextCursor && <button className="articles-load-more" type="button" onClick={loadMore} disabled={loadingMore}>{loadingMore ? '正在读取…' : '更多文章'}</button>}
            </div>
          </div>
        </section>
      </main>
    </SitePage>
  )
}
