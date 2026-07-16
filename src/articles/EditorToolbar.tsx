import { useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { articleApi } from './api'

function ToolButton({ label, title, active = false, disabled = false, onClick }: { label: string; title: string; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return <button type="button" title={title} aria-label={title} aria-pressed={active} disabled={disabled} onClick={onClick}>{label}</button>
}

export function EditorToolbar({ editor }: { editor: Editor | null }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [caption, setCaption] = useState('')
  const [alt, setAlt] = useState('')
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

  const uploadImage = async () => {
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const { media } = await articleApi.upload(file)
      editor.chain().focus().insertContent({ type: 'figureImage', attrs: { src: media.url, alt: alt.trim(), caption: caption.trim() } }).run()
      setFile(null)
      setAlt('')
      setCaption('')
      dialogRef.current?.close()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '图片上传失败。')
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
        <ToolButton label="IMG" title="带说明的图片" onClick={() => dialogRef.current?.showModal()} />
        <span className="editor-toolbar__spacer" />
        <ToolButton label="↶" title="撤销" disabled={!editor.can().chain().focus().undo().run()} onClick={() => editor.chain().focus().undo().run()} />
        <ToolButton label="↷" title="重做" disabled={!editor.can().chain().focus().redo().run()} onClick={() => editor.chain().focus().redo().run()} />
      </div>

      <dialog className="media-dialog" ref={dialogRef} onClose={() => setError('')}>
        <form method="dialog" onSubmit={(event) => event.preventDefault()}>
          <header><div><p className="articles-kicker">MEDIA</p><h2>插入图片</h2></div><button type="button" aria-label="关闭" onClick={() => dialogRef.current?.close()}>×</button></header>
          <label>图片文件<input type="file" accept="image/jpeg,image/png,image/webp" required onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
          <label>替代文字<input value={alt} maxLength={160} onChange={(event) => setAlt(event.target.value)} placeholder="说明图片中有什么" /></label>
          <label>图注<input value={caption} maxLength={240} onChange={(event) => setCaption(event.target.value)} placeholder="显示在图片下方" /></label>
          <p>JPEG / PNG / WebP，最大 10 MiB。服务器会统一转换为 WebP。</p>
          {error && <p role="alert">{error}</p>}
          <footer><button type="button" onClick={() => dialogRef.current?.close()}>取消</button><button className="articles-primary-button" type="button" disabled={!file || uploading} onClick={() => void uploadImage()}>{uploading ? '正在上传…' : '上传并插入'}</button></footer>
        </form>
      </dialog>
    </>
  )
}
