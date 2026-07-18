import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { Link, useParams } from 'react-router-dom'
import { SitePage } from '../components/SiteChrome'
import { articleApi, ApiError } from './api'
import { Comments } from './Comments'
import { formatArticleDate, usePageMeta } from './pageMeta'
import type { PublicArticle, PublicArticleSummary } from './types'
import { trackAfterVisibleDwell } from './visitTracking'

type Heading = { id: string; text: string; level: number }
type LightboxImage = { src: string; alt: string; caption: string }
type AdjacentArticles = {
  newer: PublicArticleSummary | null
  older: PublicArticleSummary | null
}

const emptyAdjacentArticles: AdjacentArticles = { newer: null, older: null }
const readerCountFormatter = new Intl.NumberFormat('zh-CN')

function readBootstrappedArticle(slug: string) {
  const element = document.getElementById('__ZR_ARTICLE_DATA__')
  if (!element?.textContent) return null
  try {
    const payload = JSON.parse(element.textContent) as { article?: PublicArticle }
    return payload.article?.slug === slug ? payload.article : null
  } catch {
    return null
  }
}

function prepareArticleHtml(source: string) {
  const documentFragment = new DOMParser().parseFromString(source, 'text/html')
  const headings: Heading[] = []
  const images: LightboxImage[] = []
  documentFragment.querySelectorAll<HTMLHeadingElement>('h2, h3').forEach((heading, index) => {
    const id = heading.id || `section-${index + 1}`
    heading.id = id
    headings.push({ id, text: heading.textContent?.trim() ?? '', level: Number(heading.tagName.slice(1)) })
  })
  documentFragment.querySelectorAll<HTMLImageElement>('img').forEach((image) => {
    const src = image.getAttribute('src')?.trim()
    if (!src) return
    const alt = image.getAttribute('alt')?.trim() ?? ''
    const caption = image.closest('figure')?.querySelector('figcaption')?.textContent?.trim() ?? ''
    const imageIndex = images.length
    const description = caption || alt
    image.dataset.articleImageIndex = String(imageIndex)
    image.tabIndex = 0
    image.setAttribute('role', 'button')
    image.setAttribute('aria-haspopup', 'dialog')
    image.setAttribute('aria-label', description ? `放大图片：${description}` : `放大文章图片 ${imageIndex + 1}`)
    images.push({ src, alt, caption })
  })
  return { html: documentFragment.body.innerHTML, headings, images }
}

export function ArticlePage() {
  const { slug = '' } = useParams()
  const [article, setArticle] = useState<PublicArticle | null>(() => readBootstrappedArticle(slug))
  const [loading, setLoading] = useState(() => article === null)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState('')
  const [adjacentArticles, setAdjacentArticles] = useState<AdjacentArticles>(emptyAdjacentArticles)
  const [shareStatus, setShareStatus] = useState('')
  const [viewCount, setViewCount] = useState<number | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const lightboxDialogRef = useRef<HTMLDialogElement>(null)
  const lightboxTriggerRef = useRef<HTMLImageElement | null>(null)
  const articleProseRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (article?.slug === slug) {
      setLoading(false)
      return
    }
    let active = true
    setArticle(null)
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

  useEffect(() => {
    const currentSlug = article?.slug
    if (!currentSlug) {
      setAdjacentArticles(emptyAdjacentArticles)
      return
    }

    let active = true
    setAdjacentArticles(emptyAdjacentArticles)
    articleApi.list().then((page) => {
      if (!active) return
      const currentIndex = page.items.findIndex((item) => item.slug === currentSlug)
      if (currentIndex < 0) return
      setAdjacentArticles({
        newer: currentIndex > 0 ? page.items[currentIndex - 1] : null,
        older: currentIndex < page.items.length - 1 ? page.items[currentIndex + 1] : null,
      })
    }).catch(() => {
      // Adjacent navigation is optional and must never block the article itself.
    })
    return () => { active = false }
  }, [article?.slug])

  useEffect(() => {
    const currentSlug = article?.slug
    if (!currentSlug) {
      setViewCount(null)
      return
    }
    let active = true
    setViewCount(null)
    const cleanup = trackAfterVisibleDwell(() => {
      articleApi.recordArticleView(currentSlug).then((stats) => {
        if (active) setViewCount(stats.uniqueVisitors)
      }).catch(() => {
        // View statistics are optional and must never block the article.
      })
    })
    return () => {
      active = false
      cleanup()
    }
  }, [article?.slug])

  const prepared = useMemo(() => article ? prepareArticleHtml(article.contentHtml) : { html: '', headings: [], images: [] }, [article])
  const writingMode = article ? (article.writingMode ?? 'horizontal') : undefined
  const lightboxImage = lightboxIndex === null ? null : prepared.images[lightboxIndex] ?? null
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
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
    inLanguage: article.contentLanguage ?? ((article.writingMode ?? 'horizontal') === 'vertical-rl' ? 'zh-Hant' : 'zh-CN'),
    ...(viewCount === null ? {} : {
      interactionStatistic: {
        '@type': 'InteractionCounter',
        interactionType: { '@type': 'ReadAction' },
        userInteractionCount: viewCount,
      },
    }),
  } : undefined, [article, viewCount])

  usePageMeta({
    title: article ? `${article.title} — ZongRui` : '文章 — ZongRui',
    description: article?.summary,
    canonical: article ? `https://zongrui.org/articles/${article.slug}` : undefined,
    image: article?.coverUrl,
    noIndex: notFound,
    jsonLd,
    language: article ? (article.contentLanguage ?? (writingMode === 'vertical-rl' ? 'zh-Hant' : 'zh-CN')) : undefined,
    ogLocale: article ? ((article.contentLanguage ?? (writingMode === 'vertical-rl' ? 'zh-Hant' : 'zh-CN')) === 'zh-Hant' ? 'zh_TW' : 'zh_CN') : undefined,
  })

  useEffect(() => {
    const dialog = lightboxDialogRef.current
    if (!dialog) return
    if (lightboxIndex === null) {
      if (dialog.open) dialog.close()
      return
    }
    if (!dialog.open) dialog.showModal()
  }, [lightboxIndex])

  useEffect(() => {
    setShareStatus('')
    setLightboxIndex(null)
  }, [slug])

  const articleUrl = () => {
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href
    if (canonical) return canonical
    return article
      ? new URL(`/articles/${article.slug}`, window.location.origin).toString()
      : window.location.href
  }

  const copyArticleLink = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API is unavailable')
      await navigator.clipboard.writeText(articleUrl())
      setShareStatus('链接已复制。')
    } catch {
      setShareStatus('复制失败，请从浏览器地址栏复制链接。')
    }
  }

  const shareArticle = async () => {
    if (!article || !canNativeShare) return
    try {
      await navigator.share({ title: article.title, text: article.summary, url: articleUrl() })
      setShareStatus('文章已分享。')
    } catch (caught) {
      setShareStatus(caught instanceof DOMException && caught.name === 'AbortError' ? '已取消分享。' : '系统分享暂时不可用。')
    }
  }

  const openLightbox = (image: HTMLImageElement) => {
    const imageIndex = Number(image.dataset.articleImageIndex)
    if (!Number.isInteger(imageIndex) || imageIndex < 0 || imageIndex >= prepared.images.length) return
    lightboxTriggerRef.current = image
    setLightboxIndex(imageIndex)
  }

  const findArticleImage = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return null
    const image = target.closest<HTMLImageElement>('img[data-article-image-index]')
    return image && articleProseRef.current?.contains(image) ? image : null
  }

  const handleArticleImageClick = (event: ReactMouseEvent<HTMLElement>) => {
    const image = findArticleImage(event.target)
    if (image) openLightbox(image)
  }

  const handleArticleImageKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    const image = findArticleImage(event.target)
    if (!image) return
    event.preventDefault()
    openLightbox(image)
  }

  const moveLightbox = (offset: number) => {
    setLightboxIndex((current) => {
      if (current === null || prepared.images.length < 2) return current
      return (current + offset + prepared.images.length) % prepared.images.length
    })
  }

  const closeLightbox = () => lightboxDialogRef.current?.close()

  const handleLightboxBackdropClick = (event: ReactMouseEvent<HTMLDialogElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const outside = event.clientX < bounds.left
      || event.clientX > bounds.right
      || event.clientY < bounds.top
      || event.clientY > bounds.bottom
    if (outside) closeLightbox()
  }

  const handleLightboxKeyDown = (event: ReactKeyboardEvent<HTMLDialogElement>) => {
    if (prepared.images.length < 2) return
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      moveLightbox(-1)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      moveLightbox(1)
    }
  }

  const handleLightboxClose = () => {
    setLightboxIndex(null)
    const trigger = lightboxTriggerRef.current
    lightboxTriggerRef.current = null
    if (trigger?.isConnected) {
      trigger.focus()
    } else {
      window.requestAnimationFrame(() => document.getElementById('main-content')?.focus())
    }
  }

  return (
    <SitePage compactHeader>
      <main id="main-content" className="article-page" tabIndex={-1}>
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
            <header className={`article-header${writingMode === 'vertical-rl' ? ' article-header--vertical' : ''}`} id="top">
              <div className="article-header__inner">
                <Link className="article-back" to="/articles">← 所有文章</Link>
                <p className="articles-kicker">ARTICLE / {formatArticleDate(article.publishedAt)}</p>
                <h1>{article.title}</h1>
                <p className="article-deck">{article.summary}</p>
                <div className="article-byline">
                  <span>ZongRui</span>
                  <span>{article.readingMinutes} MIN READ</span>
                  {viewCount !== null && <span>约 {readerCountFormatter.format(viewCount)} 人读过</span>}
                  <time dateTime={article.updatedAt}>更新于 {formatArticleDate(article.updatedAt)}</time>
                  {writingMode === 'vertical-rl' && <span>繁中直排 · 右至左</span>}
                </div>
                <div className="article-row__tags">{article.tags.map((tag) => <Link to={`/articles?tag=${encodeURIComponent(tag)}`} key={tag}>{tag}</Link>)}</div>
              </div>
              {article.coverUrl && <img className="article-cover" src={article.coverUrl} alt="" />}
            </header>
            <div className={`article-layout${writingMode === 'vertical-rl' ? ' article-layout--vertical' : ''}`}>
              {writingMode === 'horizontal' && prepared.headings.length > 0 && (
                <aside className="article-toc" aria-label="文章目录">
                  <p>ON THIS PAGE</p>
                  <ol>{prepared.headings.map((heading) => <li className={`is-level-${heading.level}`} key={heading.id}><a href={`#${heading.id}`}>{heading.text}</a></li>)}</ol>
                </aside>
              )}
              <article
                ref={articleProseRef}
                className={`article-prose${writingMode === 'vertical-rl' ? ' article-prose--vertical' : ''}`}
                lang={article.contentLanguage ?? (writingMode === 'vertical-rl' ? 'zh-Hant' : 'zh-CN')}
                onClick={handleArticleImageClick}
                onKeyDown={handleArticleImageKeyDown}
                dangerouslySetInnerHTML={{ __html: prepared.html }}
              />
            </div>
            <section className="article-continue" aria-labelledby="article-continue-title">
              <header className="article-continue__heading">
                <p className="articles-kicker">KEEP READING / SHARE</p>
                <h2 id="article-continue-title">继续阅读</h2>
              </header>
              {(adjacentArticles.newer || adjacentArticles.older) && (
                <nav className="article-adjacent" aria-label="相邻文章">
                  {adjacentArticles.newer && (
                    <Link className="article-adjacent__link article-adjacent__link--newer" to={`/articles/${adjacentArticles.newer.slug}`}>
                      <span>← 较新一篇</span>
                      <strong>{adjacentArticles.newer.title}</strong>
                    </Link>
                  )}
                  {adjacentArticles.older && (
                    <Link className="article-adjacent__link article-adjacent__link--older" to={`/articles/${adjacentArticles.older.slug}`}>
                      <span>较早一篇 →</span>
                      <strong>{adjacentArticles.older.title}</strong>
                    </Link>
                  )}
                </nav>
              )}
              <div className="article-share-actions">
                <button type="button" onClick={() => void copyArticleLink()}>复制链接</button>
                {canNativeShare && <button type="button" onClick={() => void shareArticle()}>系统分享</button>}
                <p className="article-share-status" role="status" aria-live="polite">{shareStatus}</p>
              </div>
            </section>
            <div className="article-comments-wrap"><Comments slug={article.slug} /></div>
          </>
        )}
        <dialog
          className="article-lightbox"
          ref={lightboxDialogRef}
          aria-labelledby="article-lightbox-title"
          aria-describedby="article-lightbox-description"
          onClose={handleLightboxClose}
          onKeyDown={handleLightboxKeyDown}
          onClick={handleLightboxBackdropClick}
        >
          <header className="article-lightbox__header">
            <h2 id="article-lightbox-title">文章图片</h2>
            <button type="button" aria-label="关闭图片预览" onClick={closeLightbox}>关闭</button>
          </header>
          <figure className="article-lightbox__figure">
            {lightboxImage && <img src={lightboxImage.src} alt={lightboxImage.alt} />}
            <figcaption id="article-lightbox-description" aria-live="polite">
              <span>{lightboxImage?.caption || lightboxImage?.alt || '文章图片'}</span>
              <span>{lightboxImage ? `${(lightboxIndex ?? 0) + 1} / ${prepared.images.length}` : ''}</span>
            </figcaption>
          </figure>
          {prepared.images.length > 1 && (
            <nav className="article-lightbox__navigation" aria-label="切换文章图片">
              <button type="button" aria-label="查看上一张图片" onClick={() => moveLightbox(-1)}>← 上一张</button>
              <button type="button" aria-label="查看下一张图片" onClick={() => moveLightbox(1)}>下一张 →</button>
            </nav>
          )}
        </dialog>
      </main>
    </SitePage>
  )
}
