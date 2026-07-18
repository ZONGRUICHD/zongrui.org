import { useRef, useState, type FormEvent } from 'react'
import { GalleryApiError, galleryApi } from './api'
import type { AdminGalleryImage } from './types'

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export function GalleryUploadForm({ onUploaded }: { onUploaded: (image: AdminGalleryImage) => void }) {
  const formRef = useRef<HTMLFormElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [fileName, setFileName] = useState('')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const file = data.get('file')
    const alt = String(data.get('alt') ?? '').trim()
    if (!(file instanceof File) || !file.size) {
      setError('先选择一张图片。')
      return
    }
    if (!ACCEPTED_TYPES.has(file.type)) {
      setError('只接受 JPEG、PNG 或 WebP。')
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('图片不能超过 10 MiB。')
      return
    }
    if (!alt) {
      setError('请填写图片替代文字，方便读屏用户理解内容。')
      return
    }
    const orderText = String(data.get('order') ?? '').trim()
    setUploading(true)
    setError('')
    try {
      const response = await galleryApi.upload(file, {
        title: String(data.get('title') ?? '').trim(),
        caption: String(data.get('caption') ?? '').trim(),
        alt,
        order: orderText ? Number(orderText) : null,
      })
      onUploaded(response.image)
      formRef.current?.reset()
      setFileName('')
    } catch (reason) {
      setError(reason instanceof GalleryApiError ? reason.message : '上传失败，请稍后重试。')
    } finally {
      setUploading(false)
    }
  }

  return (
    <section className="gallery-upload" aria-labelledby="gallery-upload-title">
      <header>
        <div><p>NEW IMAGE / DRAFT</p><h2 id="gallery-upload-title">上传图片</h2></div>
        <span>服务端会验证格式、移除元数据、最长边缩至 2000px，并转为 WebP。</span>
      </header>
      <form ref={formRef} onSubmit={submit}>
        <label className="gallery-file">
          <span>图片文件 *</span>
          <input
            name="file"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            required
            disabled={uploading}
            onChange={(event) => setFileName(event.target.files?.[0]?.name ?? '')}
          />
          <strong>{fileName || '选择 JPEG / PNG / WebP'}</strong>
          <small>最大 10 MiB；上传后先保存为草稿。</small>
        </label>
        <div className="gallery-upload__fields">
          <label><span>标题</span><input name="title" maxLength={200} placeholder="这张图叫什么" disabled={uploading} /></label>
          <label><span>替代文字 *</span><input name="alt" maxLength={300} required placeholder="客观描述图片内容" disabled={uploading} /></label>
          <label className="gallery-upload__caption"><span>说明</span><textarea name="caption" maxLength={2000} rows={3} placeholder="拍摄地点、时间或想记住的事" disabled={uploading} /></label>
          <label><span>排序值</span><input name="order" type="number" min={0} max={1000000} placeholder="留空排在末尾" disabled={uploading} /></label>
        </div>
        {error && <p className="gallery-console-error" role="alert">{error}</p>}
        <button className="gallery-console-primary" type="submit" disabled={uploading}>{uploading ? '正在处理图片…' : '上传为草稿 ↗'}</button>
      </form>
    </section>
  )
}
