import { useEffect, useRef } from 'react'
import type { GalleryImage } from './types'

type GalleryLightboxProps = {
  images: GalleryImage[]
  index: number | null
  onChange: (index: number | null) => void
}
export function GalleryLightbox({ images, index, onChange }: GalleryLightboxProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const image = index === null ? null : images[index]

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (image && !dialog.open) dialog.showModal()
    if (!image && dialog.open) dialog.close()
  }, [image])

  const close = () => onChange(null)
  const move = (offset: number) => {
    if (index === null || images.length < 2) return
    onChange((index + offset + images.length) % images.length)
  }

  return (
    <dialog
      className="gallery-lightbox"
      ref={dialogRef}
      onClose={close}
      onClick={(event) => { if (event.target === dialogRef.current) close() }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') move(-1)
        if (event.key === 'ArrowRight') move(1)
      }}
      aria-labelledby="gallery-lightbox-title"
    >
      {image && (
        <div className="gallery-lightbox__panel">
          <button className="gallery-lightbox__close" type="button" onClick={close} aria-label="关闭大图">×</button>
          <div className="gallery-lightbox__media">
            <img src={image.url} alt={image.alt} width={image.width} height={image.height} />
          </div>
          <div className="gallery-lightbox__caption">
            <p>{String(index! + 1).padStart(2, '0')} / {String(images.length).padStart(2, '0')}</p>
            <h2 id="gallery-lightbox-title">{image.title || '未命名图片'}</h2>
            {image.caption && <div>{image.caption}</div>}
          </div>
          {images.length > 1 && (
            <nav className="gallery-lightbox__nav" aria-label="切换图片">
              <button type="button" onClick={() => move(-1)} aria-label="上一张">←</button>
              <button type="button" onClick={() => move(1)} aria-label="下一张">→</button>
            </nav>
          )}
        </div>
      )}
    </dialog>
  )
}
