import { useRef, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { formatArticleDate } from '../articles/pageMeta'
import type { PublicArticleSummary, Tag } from '../articles/types'
import { useF1PageMotion } from './useF1Motion'

type F1ArticleIndexViewProps = {
  query: string
  search: string
  selectedTag: string
  archive: string
  articles: PublicArticleSummary[]
  tags: Tag[]
  nextCursor: string | null
  loading: boolean
  loadingMore: boolean
  error: string
  setSearch: (value: string) => void
  updateFilter: (next: { q?: string; tag?: string; archive?: string }) => void
  submitSearch: (event: FormEvent) => void
  loadMore: () => void
}
export function F1ArticleIndexView({
  query,
  search,
  selectedTag,
  archive,
  articles,
  tags,
  nextCursor,
  loading,
  loadingMore,
  error,
  setSearch,
  updateFilter,
  submitSearch,
  loadMore,
}: F1ArticleIndexViewProps) {
  const pageRef = useRef<HTMLElement>(null)
  useF1PageMotion(pageRef, `${articles.length}-${loading}`)
  const lead = articles.find((article) => article.isPinned) ?? articles[0]
  const remaining = lead ? articles.filter((article) => article.id !== lead.id) : []

  return (
    <main className="f1-articles" id="main-content" ref={pageRef}>
      <header className="f1-editorial-hero" id="top">
        <div>
          <p className="f1-kicker"><span>ART</span> NOTES / PERSONAL LOG / LONG READ</p>
          <h1>
            <span className="f1-line-mask"><span data-f1-hero-line>文章</span></span>
            <span className="f1-line-mask"><span data-f1-hero-line>档案<i>.</i></span></span>
          </h1>
        </div>
        <div className="f1-editorial-hero__summary" data-f1-media>
          <span>{String(articles.length).padStart(2, '0')}</span>
          <p>个人介绍、项目纪录，还有我想留下来的东西。</p>
          <a href="/api/articles/v1/rss.xml">RSS FEED ↗</a>
        </div>
      </header>

      <section className="f1-article-controls" aria-label="文章筛选" data-f1-reveal>
        <form onSubmit={submitSearch} role="search">
          <label htmlFor="f1-article-search">SEARCH</label>
          <div>
            <input
              id="f1-article-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="标题、摘要或正文"
            />
            <button type="submit" aria-label="搜索文章">→</button>
          </div>
        </form>
        <div className="f1-article-controls__tags">
          <span>FILTER</span>
          <button type="button" className={!selectedTag ? 'is-active' : ''} onClick={() => updateFilter({ tag: '' })}>全部</button>
          {tags.map((tag) => (
            <button type="button" className={selectedTag === tag.slug ? 'is-active' : ''} onClick={() => updateFilter({ tag: tag.slug })} key={tag.slug}>
              {tag.name}{typeof tag.count === 'number' ? ` ${tag.count}` : ''}
            </button>
          ))}
        </div>
        <label className="f1-article-controls__archive">
          <span>SEASON</span>
          <select value={archive} onChange={(event) => updateFilter({ archive: event.target.value })}>
            <option value="">ALL</option>
            {Array.from({ length: 8 }, (_, index) => String(new Date().getFullYear() - index)).map((year) => <option value={year} key={year}>{year}</option>)}
          </select>
        </label>
      </section>

      <section className="f1-article-feed" aria-live="polite" aria-busy={loading}>
        {loading && <div className="f1-state f1-state--loading"><span /><span /><span /><strong>LOADING THE GRID</strong></div>}
        {!loading && error && <div className="f1-state" role="alert"><small>ORIGIN OFFLINE</small><strong>文章服务器暂时离线。</strong><p>{error}</p></div>}
        {!loading && !error && articles.length === 0 && (
          <div className="f1-state"><small>NO RESULT</small><strong>没找到文章。</strong><p>清空筛选，或者换一个关键词。</p></div>
        )}

        {!loading && lead && (
          <article className="f1-article-lead" data-f1-reveal>
            <div className="f1-article-lead__number"><span>POLE</span><strong>01</strong></div>
            <div className="f1-article-lead__copy">
              <p>{lead.isPinned && <em>置顶</em>}{formatArticleDate(lead.publishedAt)} / {lead.readingMinutes} MIN READ</p>
              <h2><Link to={`/articles/${lead.slug}`}>{lead.title}</Link></h2>
              <p>{lead.summary}</p>
              <div>{lead.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
            </div>
            <Link className="f1-article-lead__arrow" to={`/articles/${lead.slug}`} aria-label={`阅读《${lead.title}》`}>↗</Link>
          </article>
        )}

        <div className="f1-article-grid">
          {remaining.map((article, index) => (
            <article className="f1-article-card" key={article.id} data-f1-reveal>
              <header><span>{String(index + 2).padStart(2, '0')}</span><small>{formatArticleDate(article.publishedAt)}</small></header>
              <p className="f1-article-card__meta">{article.readingMinutes} MIN READ {article.isPinned && <em> / 置顶</em>}</p>
              <h2><Link to={`/articles/${article.slug}`}>{article.title}</Link></h2>
              <p>{article.summary}</p>
              <footer>
                <div>{article.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
                <Link to={`/articles/${article.slug}`} aria-label={`阅读《${article.title}》`}>→</Link>
              </footer>
            </article>
          ))}
        </div>

        {query && !loading && <p className="f1-article-feed__query">RESULTS FOR / {query.toUpperCase()}</p>}
        {nextCursor && <button className="f1-load-more" type="button" onClick={loadMore} disabled={loadingMore}>{loadingMore ? 'LOADING…' : '加载更多文章 →'}</button>}
      </section>
    </main>
  )
}
