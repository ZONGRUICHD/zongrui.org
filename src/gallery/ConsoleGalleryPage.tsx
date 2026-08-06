import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ConsoleGate } from '../articles/ConsoleLayout'
import { GalleryApiError, galleryApi } from './api'
import { GalleryItemEditor } from './GalleryItemEditor'
import { GalleryUploadForm } from './GalleryUploadForm'
import type { AdminGalleryImage, GalleryStatus } from './types'
import './gallery.css'

const filters: Array<{ value: '' | GalleryStatus; label: string }> = [
  { value: '', label: '全部' },
  { value: 'draft', label: '草稿' },
  { value: 'published', label: '已发布' },
  { value: 'archived', label: '已归档' },
]

async function readAll(status?: GalleryStatus) {
  const items: AdminGalleryImage[] = []
  let cursor: string | undefined
  do {
    const page = await galleryApi.adminList(status, cursor)
    items.push(...page.items)
    cursor = page.nextCursor ?? undefined
  } while (cursor)
  return items
}

export function ConsoleGalleryPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const rawStatus = searchParams.get('status')
  const status = filters.some((item) => item.value === rawStatus) ? rawStatus as '' | GalleryStatus : ''
  const [images, setImages] = useState<AdminGalleryImage[]>([])
  const [loading, setLoading] = useState(true)
  const [reordering, setReordering] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      setImages(await readAll(status || undefined))
    } catch (reason) {
      setError(reason instanceof GalleryApiError ? reason.message : '图片列表读取失败。')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [status])

  const replace = (next: AdminGalleryImage) => {
    setImages((current) => status && next.status !== status
      ? current.filter((image) => image.id !== next.id)
      : current.map((image) => image.id === next.id ? next : image))
    setNotice('修改已保存。')
  }

  const uploaded = (image: AdminGalleryImage) => {
    setNotice('图片已上传并保存为草稿。')
    if (!status || status === 'draft') setImages((current) => [...current, image].sort((a, b) => a.order - b.order))
  }

  const move = async (index: number, offset: number) => {
    if (status || reordering) return
    const target = index + offset
    if (target < 0 || target >= images.length) return
    const ordered = [...images]
    ;[ordered[index], ordered[target]] = [ordered[target], ordered[index]]
    setReordering(true)
    setError('')
    try {
      const response = await galleryApi.reorder(ordered.map((image) => image.id))
      setImages(response.items)
      setNotice('展示顺序已更新。')
    } catch (reason) {
      setError(reason instanceof GalleryApiError ? reason.message : '顺序保存失败。')
    } finally {
      setReordering(false)
    }
  }

  return (
    <ConsoleGate>
      <main className="console-main gallery-console" id="main-content">
        <header className="console-page-heading gallery-console__heading">
          <div><p className="articles-kicker">IMAGE ARCHIVE / {images.length} ITEMS</p><h1>图片</h1><p>上传、说明、发布和调整公开画廊的顺序。</p></div>
          <a className="gallery-console-view" href="/gallery" target="_blank" rel="noreferrer">打开公开画廊 ↗</a>
        </header>

        <GalleryUploadForm onUploaded={uploaded} />

        <section className="gallery-console__library" aria-labelledby="gallery-library-title">
          <header>
            <div><p>LIBRARY / ORDER</p><h2 id="gallery-library-title">图片库</h2></div>
            <div className="gallery-console-filters" role="group" aria-label="筛选图片状态">
              {filters.map((filter) => (
                <button
                  type="button"
                  className={status === filter.value ? 'is-active' : ''}
                  aria-pressed={status === filter.value}
                  onClick={() => setSearchParams(filter.value ? { status: filter.value } : {})}
                  key={filter.value}
                >{filter.label}</button>
              ))}
            </div>
          </header>
          {status && <p className="gallery-console-hint">筛选状态下不能整体重排；切回“全部”后可用箭头调整公开顺序。</p>}
          {reordering && <p className="gallery-console-hint" role="status">正在保存新顺序…</p>}
          <div className="gallery-console-live" aria-live="polite">{notice}</div>
          {loading && <div className="gallery-console-state" role="status">正在读取图片库…</div>}
          {!loading && error && images.length === 0 && <div className="gallery-console-state" role="alert"><strong>请求失败</strong><p>{error}</p><button type="button" onClick={() => void load()}>重新读取</button></div>}
          {!loading && error && images.length > 0 && <p className="gallery-console-error" role="alert">{error}</p>}
          {!loading && !error && images.length === 0 && <div className="gallery-console-state"><strong>这里还没有图片</strong><p>从上面的上传区域添加第一张；它会先保存为草稿。</p></div>}
          <div className="gallery-console-list" aria-busy={loading || reordering}>
            {images.map((image, index) => (
              <GalleryItemEditor
                image={image}
                index={index}
                total={images.length}
                reorderEnabled={!status && !reordering}
                onChanged={replace}
                onDeleted={(id) => { setImages((current) => current.filter((item) => item.id !== id)); setNotice('图片已删除。') }}
                onMove={(current, offset) => void move(current, offset)}
                key={image.id}
              />
            ))}
          </div>
        </section>
      </main>
    </ConsoleGate>
  )
}
