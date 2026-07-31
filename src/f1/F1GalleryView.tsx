import { useRef } from 'react'
import { GalleryLightbox } from '../gallery/GalleryLightbox'
import type { GalleryImage } from '../gallery/types'
import { useF1PageMotion } from './useF1Motion'

type F1GalleryViewProps = {
  images: GalleryImage[]
  selected: number | null
  setSelected: (index: number | null) => void
  nextCursor: string | null
  loading: boolean
  loadingMore: boolean
  error: string
  loadMore: () => void
}
export function F1GalleryView({
  images,
  selected,
  setSelected,
  nextCursor,
  loading,
  loadingMore,
  error,
  loadMore,
}: F1GalleryViewProps) {
  const pageRef = useRef<HTMLElement>(null)
  useF1PageMotion(pageRef, `${images.length}-${loading}`)

  return (
    <main className="f1-gallery" id="main-content" ref={pageRef}>
      <header className="f1-gallery__hero" id="top">
        <div>
          <p className="f1-kicker"><span>IMG</span> IMAGE ARCHIVE / FIELD NOTES</p>
          <h1>
            <span className="f1-line-mask"><span data-f1-hero-line>视觉</span></span>
            <span className="f1-line-mask"><span data-f1-hero-line>记录<i>.</i></span></span>
          </h1>
        </div>
        <div className="f1-gallery__count" data-f1-media><small>FRAME COUNT</small><strong>{String(images.length).padStart(2, '0')}</strong><span>照片、现场和想留下来的画面。</span></div>
      </header>

      <section className="f1-gallery__track" aria-label="图片集" aria-live="polite" aria-busy={loading}>
        {loading && <div className="f1-state f1-state--loading"><span /><span /><span /><strong>DEVELOPING FRAMES</strong></div>}
        {!loading && error && images.length === 0 && <div className="f1-state" role="alert"><small>UPLINK LOST</small><strong>暂时看不到图片。</strong><p>{error}</p></div>}
        {!loading && !error && images.length === 0 && <div className="f1-state"><small>EMPTY ROLL</small><strong>相册还是空的。</strong><p>第一张照片整理好后，会出现在这里。</p></div>}
        <div className="f1-gallery__grid">
          {images.map((image, index) => (
            <article className={`f1-gallery-card f1-gallery-card--${index % 4}`} key={image.id} data-f1-reveal>
              <button type="button" onClick={() => setSelected(index)} aria-label={`查看大图：${image.title || image.alt}`}>
                <span className="f1-gallery-card__image">
                  <img src={image.url} alt={image.alt} width={image.width} height={image.height} loading="lazy" data-f1-parallax />
                  <i aria-hidden="true">VIEW / {String(index + 1).padStart(2, '0')}</i>
                </span>
                <span className="f1-gallery-card__copy">
                  <small>{String(index + 1).padStart(2, '0')} / ARCHIVE</small>
                  <strong>{image.title || '未命名图片'}</strong>
                  {image.caption && <span>{image.caption}</span>}
                  <i aria-hidden="true">↗</i>
                </span>
              </button>
            </article>
          ))}
        </div>
        {error && images.length > 0 && <p className="f1-inline-error" role="alert">{error}</p>}
        {nextCursor && <button className="f1-load-more" type="button" onClick={loadMore} disabled={loadingMore}>{loadingMore ? 'LOADING…' : '继续往后看 →'}</button>}
      </section>
      <GalleryLightbox images={images} index={selected} onChange={setSelected} />
    </main>
  )
}
