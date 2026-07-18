import { useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { articleApi } from './api'
import type { MediaItem } from './types'

type ImageAlign = 'start' | 'center' | 'end'
type ImageWidth = 33 | 50 | 75 | 100
type MediaTab = 'upload' | 'library'

const IMAGE_ALIGNS: ImageAlign[] = ['start', 'center', 'end']
const IMAGE_WIDTHS: ImageWidth[] = [33, 50, 75, 100]

function ToolButton({ label, title, active = false, disabled = false, onClick }: { label: string; title: string; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return <button type="button" title={title} aria-label={title} aria-pressed={active} disabled={disabled} onClick={onClick}>{label}</button>
}

function validAlign(value: unknown): ImageAlign {
  return typeof value === 'string' && IMAGE_ALIGNS.includes(value as ImageAlign) ? value as ImageAlign : 'center'
}

function validWidth(value: unknown): ImageWidth {
  const width = Number(value)
  return IMAGE_WIDTHS.includes(width as ImageWidth) ? width as ImageWidth : 100
}

export function EditorToolbar({ editor }: { editor: Editor | null }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [tab, setTab] = useState<MediaTab>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [imageSrc, setImageSrc] = useState('')
  const [caption, setCaption] = useState('')
  const [alt, setAlt] = useState('')
  const [align, setAlign] = useState<ImageAlign>('center')
  const [width, setWidth] = useState<ImageWidth>(100)
  const [editingImage, setEditingImage] = useState(false)
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([])
  const [mediaCursor, setMediaCursor] = useState<string | null>(null)
  const [loadingMedia, setLoadingMedia] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  if (!editor) return null

  const setLink = () => {
    const previous = editor.getAttributes('link').href as string | undefined
    const href = window.prompt('链接地址', previous ?? 'https://')
    if (href === null) return
    if (!href.trim()) editor.chain().focus().extendMarkRange('link').unsetLink().run()
    else editor.chain().focus().extendMarkRange('link').setLink({ href: href.trim(), target: '_blank' }).run()
  }

  const loadMedia = async (reset = false) => {
    if (loadingMedia) return
    setLoadingMedia(true)
    setError('')
    try {
      const response = await articleApi.listMedia(reset ? undefined : mediaCursor ?? undefined)
      setMediaItems((current) => {
        const base = reset ? [] : current
        const known = new Set(base.map((item) => item.id))
        return [...base, ...response.items.filter((item) => !known.has(item.id))]
      })
      setMediaCursor(response.nextCursor)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '媒体库读取失败。')
    } finally {
      setLoadingMedia(false)
    }
  }

  const openImageDialog = () => {
    const isEditing = editor.isActive('figureImage')
    const attributes = isEditing ? editor.getAttributes('figureImage') : {}
    setEditingImage(isEditing)
    setImageSrc(typeof attributes.src === 'string' ? attributes.src : '')
    setAlt(typeof attributes.alt === 'string' ? attributes.alt : '')
    setCaption(typeof attributes.caption === 'string' ? attributes.caption : '')
    setAlign(validAlign(attributes.align))
    setWidth(validWidth(attributes.width))
    setFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    setTab('upload')
    setError('')
    dialogRef.current?.showModal()
    void loadMedia(true)
  }

  const chooseMedia = (media: MediaItem) => {
    setImageSrc(media.url)
    setFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const saveImage = async () => {
    let src = imageSrc
    setUploading(Boolean(file))
    setError('')
    try {
      if (file) {
        const response = await articleApi.upload(file)
        src = response.media.url
        setImageSrc(src)
        setMediaItems((current) => current.some((item) => item.id === response.media.id)
          ? current
          : [response.media, ...current])
      }
      if (!src) {
        setError('请上传图片或从媒体库中选择一张图片。')
        return
      }

      const attrs = { src, alt: alt.trim(), caption: caption.trim(), align, width }
      if (editingImage && editor.isActive('figureImage')) {
        editor.chain().focus().updateAttributes('figureImage', attrs).run()
      } else {
        editor.chain().focus().insertContent({ type: 'figureImage', attrs }).run()
      }
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      dialogRef.current?.close()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '图片保存失败。')
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      <div className="editor-toolbar" role="toolbar" aria-label="正文格式">
        <ToolButton label="H2" title="二级标题" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
        <ToolButton label="H3" title="三级标题" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} />
        <span className="editor-toolbar__divider" />
        <ToolButton label="B" title="粗体" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} />
        <ToolButton label="I" title="斜体" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} />
        <ToolButton label="U" title="下划线" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} />
        <ToolButton label="S" title="删除线" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} />
        <span className="editor-toolbar__divider" />
        <ToolButton label="•" title="无序列表" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} />
        <ToolButton label="1." title="有序列表" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
        <ToolButton label="“" title="引用" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
        <ToolButton label="<>" title="代码块" active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()} />
        <ToolButton label="—" title="分隔线" onClick={() => editor.chain().focus().setHorizontalRule().run()} />
        <span className="editor-toolbar__divider" />
        <ToolButton label="LINK" title="链接" active={editor.isActive('link')} onClick={setLink} />
        <ToolButton label="IMG" title={editor.isActive('figureImage') ? '编辑所选图片' : '插入图片'} active={editor.isActive('figureImage')} onClick={openImageDialog} />
        <span className="editor-toolbar__spacer" />
        <ToolButton label="↶" title="撤销" disabled={!editor.can().chain().focus().undo().run()} onClick={() => editor.chain().focus().undo().run()} />
        <ToolButton label="↷" title="重做" disabled={!editor.can().chain().focus().redo().run()} onClick={() => editor.chain().focus().redo().run()} />
      </div>

      <dialog className="media-dialog" ref={dialogRef} aria-labelledby="media-dialog-title" onClose={() => setError('')}>
        <form method="dialog" onSubmit={(event) => { event.preventDefault(); void saveImage() }}>
          <header><div><p className="articles-kicker">MEDIA</p><h2 id="media-dialog-title">{editingImage ? '编辑图片' : '插入图片'}</h2></div><button type="button" aria-label="关闭" onClick={() => dialogRef.current?.close()}>×</button></header>

          <div className="media-dialog__tabs" role="group" aria-label="图片来源">
            <button type="button" aria-pressed={tab === 'upload'} onClick={() => setTab('upload')}>上传新图</button>
            <button type="button" aria-pressed={tab === 'library'} onClick={() => setTab('library')}>媒体库</button>
          </div>

          {tab === 'upload' ? (
            <div className="media-dialog__source">
              <label>图片文件<input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
              <p>JPEG / PNG / WebP，最大 10 MiB。服务器会统一转换为 WebP。</p>
            </div>
          ) : (
            <div className="media-dialog__source">
              <div className="media-library" aria-busy={loadingMedia}>
                {mediaItems.map((media) => (
                  <button className="media-library__item" type="button" key={media.id} aria-label={`选择图片 ${media.id.slice(0, 8)}，${media.width} × ${media.height}`} aria-pressed={imageSrc === media.url} onClick={() => chooseMedia(media)}>
                    <img src={media.url} alt="" loading="lazy" />
                    <span>{media.width} × {media.height}</span>
                  </button>
                ))}
              </div>
              {!loadingMedia && mediaItems.length === 0 && <p>媒体库还是空的，请先上传一张图片。</p>}
              {loadingMedia && <p role="status">正在读取媒体库…</p>}
              {mediaCursor && <button className="media-library__more" type="button" disabled={loadingMedia} onClick={() => void loadMedia()}>加载更多</button>}
            </div>
          )}

          {imageSrc && <div className="media-dialog__preview"><img src={imageSrc} alt="当前选择预览" /></div>}
          <label>替代文字<input value={alt} maxLength={160} onChange={(event) => setAlt(event.target.value)} placeholder="说明图片中有什么；装饰图片可以留空" /></label>
          <label>图注<input value={caption} maxLength={240} onChange={(event) => setCaption(event.target.value)} placeholder="显示在图片下方" /></label>
          <div className="media-dialog__layout">
            <label>对齐<select value={align} onChange={(event) => setAlign(validAlign(event.target.value))}><option value="start">靠前</option><option value="center">居中</option><option value="end">靠后</option></select></label>
            <label>宽度<select value={width} onChange={(event) => setWidth(validWidth(event.target.value))}>{IMAGE_WIDTHS.map((value) => <option value={value} key={value}>{value}%</option>)}</select></label>
          </div>
          {error && <p className="media-dialog__error" role="alert">{error}</p>}
          <footer><button type="button" onClick={() => dialogRef.current?.close()}>取消</button><button className="articles-primary-button" type="submit" disabled={(!file && !imageSrc) || uploading}>{uploading ? '正在上传…' : editingImage ? '保存图片设置' : '插入图片'}</button></footer>
        </form>
      </dialog>
    </>
  )
}
