import { useEffect, useRef, useState } from 'react'
import { SitePage } from '../components/SiteChrome'
import { usePageMeta } from '../articles/pageMeta'
import { galleryApi } from './api'
import { GalleryLightbox } from './GalleryLightbox'
import type { GalleryImage } from './types'
import { useGalleryReveal } from './useGalleryReveal'
import './gallery.css'

export function GalleryPage() {
  const pageRef = useRef<HTMLElement>(null)
  const [images, setImages] = useState<GalleryImage[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')

  usePageMeta({
    title: '图片 — ZongRui',
    description: 'ZongRui 留下的照片、现场和日常片段。',
    canonical: 'https://zongrui.org/gallery',
    language: 'zh-CN',
    ogLocale: 'zh_CN',
  })
  useGalleryReveal(pageRef, images.length)

  useEffect(() => {
    let active = true
    galleryApi.list().then((page) => {
      if (!active) return
      setImages(page.items)
      setNextCursor(page.nextCursor)
    }).catch(() => {
      if (active) setError('图片服务器暂时没有响应，请稍后再来。')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [])

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const page = await galleryApi.list(nextCursor)
      setImages((current) => [...current, ...page.items])
      setNextCursor(page.nextCursor)
    } catch {
      setError('后面的图片暂时读不到，可以稍后再试。')
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <SitePage compactHeader>
      <main className="gallery-page" id="main-content" ref={pageRef}>
        <header className="gallery-hero" id="top">
          <div>
            <p>IMAGE ARCHIVE / ZONGRUI</p>
            <h1>图片</h1>
          </div>
          <p>照片、现场和想留下来的画面。</p>
          <span aria-hidden="true">{String(images.length).padStart(2, '0')}</span>
        </header>

        <section className="gallery-browser" aria-label="图片集" aria-live="polite" aria-busy={loading}>
          {loading && <div className="gallery-loading" role="status"><span /><span /><span /><p>正在显影…</p></div>}
          {!loading && error && images.length === 0 && <div className="gallery-state" role="alert"><strong>暂时看不到图片</strong><p>{error}</p></div>}
          {!loading && !error && images.length === 0 && <div className="gallery-state"><strong>相册还是空的</strong><p>第一张照片整理好后，会出现在这里。</p></div>}
          <div className="gallery-grid">
            {images.map((image, index) => (
              <article className="gallery-card" data-gallery-reveal key={image.id}>
                <button type="button" onClick={() => setSelected(index)} aria-label={`查看大图：${image.title || image.alt}`}>
                  <span className="gallery-card__image"><img src={image.url} alt={image.alt} width={image.width} height={image.height} loading="lazy" /></span>
                  <span className="gallery-card__copy">
                    <small>{String(index + 1).padStart(2, '0')}</small>
                    <strong>{image.title || '未命名图片'}</strong>
                    {image.caption && <span>{image.caption}</span>}
                    <i aria-hidden="true">↗</i>
                  </span>
                </button>
              </article>
            ))}
          </div>
          {error && images.length > 0 && <p className="gallery-inline-error" role="alert">{error}</p>}
          {nextCursor && <button className="gallery-more" type="button" onClick={loadMore} disabled={loadingMore}>{loadingMore ? '正在显影…' : '继续往后看 ↓'}</button>}
        </section>
        <GalleryLightbox images={images} index={selected} onChange={setSelected} />
      </main>
    </SitePage>
  )
}
