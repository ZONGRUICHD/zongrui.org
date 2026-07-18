import { useEffect, useState, type FormEvent } from 'react'
import { GalleryApiError, galleryApi } from './api'
import type { AdminGalleryImage, GalleryStatus } from './types'

const statusLabels: Record<GalleryStatus, string> = {
  draft: '草稿',
  published: '已发布',
  archived: '已归档',
}
type GalleryItemEditorProps = {
  image: AdminGalleryImage
  index: number
  total: number
  reorderEnabled: boolean
  onChanged: (image: AdminGalleryImage) => void
  onDeleted: (id: string) => void
  onMove: (index: number, offset: number) => void
}

export function GalleryItemEditor({ image, index, total, reorderEnabled, onChanged, onDeleted, onMove }: GalleryItemEditorProps) {
  const [title, setTitle] = useState(image.title)
  const [caption, setCaption] = useState(image.caption)
  const [alt, setAlt] = useState(image.alt)
  const [order, setOrder] = useState(String(image.order))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setTitle(image.title)
    setCaption(image.caption)
    setAlt(image.alt)
    setOrder(String(image.order))
  }, [image])

  const run = async (action: () => Promise<{ image: AdminGalleryImage }>) => {
    setBusy(true)
    setError('')
    try {
      const response = await action()
      onChanged(response.image)
    } catch (reason) {
      setError(reason instanceof GalleryApiError ? reason.message : '操作失败，请稍后重试。')
    } finally {
      setBusy(false)
    }
  }

  const save = (event: FormEvent) => {
    event.preventDefault()
    if (!alt.trim()) {
      setError('替代文字不能为空。')
      return
    }
    void run(() => galleryApi.update(image.id, {
      title: title.trim(),
      caption: caption.trim(),
      alt: alt.trim(),
      order: Number(order),
    }))
  }

  const remove = async () => {
    if (!window.confirm(`确定删除“${image.title || image.alt}”？这项操作不能撤销。`)) return
    setBusy(true)
    setError('')
    try {
      await galleryApi.delete(image.id)
      onDeleted(image.id)
    } catch (reason) {
      setError(reason instanceof GalleryApiError ? reason.message : '删除失败，请稍后重试。')
      setBusy(false)
    }
  }

  return (
    <article className="gallery-console-card">
      <div className="gallery-console-card__preview">
        <img src={image.url} alt="" width={image.width} height={image.height} loading="lazy" />
        <span className={`gallery-status gallery-status--${image.status}`}>{statusLabels[image.status]}</span>
        <small>{image.width} × {image.height}</small>
      </div>
      <form onSubmit={save}>
        <div className="gallery-console-card__heading">
          <span>{String(index + 1).padStart(2, '0')}</span>
          <div className="gallery-order-controls" aria-label={`调整“${image.title || image.alt}”的顺序`}>
            <button type="button" aria-label="上移" disabled={!reorderEnabled || busy || index === 0} onClick={() => onMove(index, -1)}>↑</button>
            <button type="button" aria-label="下移" disabled={!reorderEnabled || busy || index === total - 1} onClick={() => onMove(index, 1)}>↓</button>
          </div>
        </div>
        <label><span>标题</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} disabled={busy} /></label>
        <label><span>替代文字 *</span><input value={alt} onChange={(event) => setAlt(event.target.value)} maxLength={300} required disabled={busy} /></label>
        <label><span>图片说明</span><textarea value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={2000} rows={4} disabled={busy} /></label>
        <label><span>排序值</span><input value={order} onChange={(event) => setOrder(event.target.value)} type="number" min={0} max={1000000} required disabled={busy} /></label>
        {error && <p className="gallery-console-error" role="alert">{error}</p>}
        <div className="gallery-console-card__actions">
          <button className="gallery-console-secondary" type="submit" disabled={busy}>{busy ? '处理中…' : '保存文字'}</button>
          {image.status !== 'published' && <button type="button" disabled={busy} onClick={() => void run(() => galleryApi.publish(image.id))}>发布</button>}
          {image.status !== 'archived' && <button type="button" disabled={busy} onClick={() => void run(() => galleryApi.archive(image.id))}>归档</button>}
          <button className="gallery-console-delete" type="button" disabled={busy} onClick={() => void remove()}>删除</button>
        </div>
      </form>
    </article>
  )
}
