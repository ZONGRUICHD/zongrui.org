import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import LinkExtension from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { articleApi, ApiError } from './api'
import { ConsoleGate } from './ConsoleLayout'
import { EditorToolbar } from './EditorToolbar'
import { FigureImage } from './FigureImage'
import { formatArticleDate } from './pageMeta'
import type { AdminArticle, ArticleDraftInput, ArticleRevision, ArticleStatus, TiptapDocument } from './types'

type LocalDraft = ArticleDraftInput & { savedAt: string; sourceUpdatedAt?: string }
type SaveState = 'idle' | 'local' | 'saving' | 'saved' | 'offline' | 'conflict'

const emptyDocument: TiptapDocument = { type: 'doc', content: [{ type: 'paragraph' }] }

function localKey(id: string | undefined) {
  return `zr-article-draft:${id ?? 'new'}`
}

function readLocalDraft(id: string | undefined): LocalDraft | null {
  try {
    const raw = localStorage.getItem(localKey(id))
    return raw ? JSON.parse(raw) as LocalDraft : null
  } catch {
    return null
  }
}

export function ArticleEditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [articleId, setArticleId] = useState(id)
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [summary, setSummary] = useState('')
  const [coverUrl, setCoverUrl] = useState('')
  const [tagsText, setTagsText] = useState('')
  const [status, setStatus] = useState<ArticleStatus>('draft')
  const [scheduledAt, setScheduledAt] = useState('')
  const [revision, setRevision] = useState(0)
  const [contentJson, setContentJson] = useState<TiptapDocument>(emptyDocument)
  const [changeVersion, setChangeVersion] = useState(0)
  const [hydrated, setHydrated] = useState(!id)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [notice, setNotice] = useState('')
  const [recoverable, setRecoverable] = useState<LocalDraft | null>(null)
  const [revisions, setRevisions] = useState<ArticleRevision[]>([])
  const [showRevisions, setShowRevisions] = useState(false)
  const [preview, setPreview] = useState(false)
  const [coverUploading, setCoverUploading] = useState(false)
  const lastCheckpointRef = useRef(Date.now())
  const saveRef = useRef<(reason: 'manual' | 'autosave') => Promise<AdminArticle | null>>(async () => null)
  const articleIdRef = useRef(articleId)
  articleIdRef.current = articleId

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, link: false, underline: false }),
      LinkExtension.configure({ openOnClick: false, autolink: true, defaultProtocol: 'https' }),
      Underline,
      Placeholder.configure({ placeholder: '开始写正文…' }),
      FigureImage,
    ],
    content: emptyDocument,
    editorProps: { attributes: { class: 'article-editor-prose', 'aria-label': '文章正文编辑器' } },
    onUpdate: ({ editor: instance }) => {
      setContentJson(instance.getJSON() as TiptapDocument)
      setChangeVersion((value) => value + 1)
      setSaveState(articleIdRef.current ? 'idle' : 'local')
    },
  })

  const tags = useMemo(() => Array.from(new Set(tagsText.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean))), [tagsText])

  const applyArticle = useCallback((article: AdminArticle) => {
    setArticleId(article.id)
    setTitle(article.title)
    setSlug(article.slug)
    setSummary(article.summary)
    setCoverUrl(article.coverUrl ?? '')
    setTagsText(article.tags.join(', '))
    setStatus(article.status)
    setScheduledAt(article.scheduledAt ? new Date(article.scheduledAt).toISOString().slice(0, 16) : '')
    setRevision(article.revision)
    setContentJson(article.contentJson ?? emptyDocument)
    editor?.commands.setContent(article.contentJson ?? emptyDocument, { emitUpdate: false })
    setChangeVersion(0)
    setHydrated(true)
    setSaveState('saved')
  }, [editor])

  const applyLocal = useCallback((draft: LocalDraft) => {
    setTitle(draft.title)
    setSlug(draft.slug)
    setSummary(draft.summary)
    setCoverUrl(draft.coverUrl ?? '')
    setTagsText(draft.tags.join(', '))
    setContentJson(draft.contentJson)
    setRevision(draft.revision ?? revision)
    editor?.commands.setContent(draft.contentJson, { emitUpdate: false })
    setRecoverable(null)
    setChangeVersion((value) => value + 1)
    setSaveState('local')
  }, [editor, revision])

  useEffect(() => {
    if (!editor) return
    if (!id) {
      const local = readLocalDraft(undefined)
      if (local) setRecoverable(local)
      setHydrated(true)
      return
    }

    let active = true
    setHydrated(false)
    Promise.all([articleApi.adminGet(id), articleApi.revisions(id)]).then(([response, history]) => {
      if (!active) return
      applyArticle(response.article)
      setRevisions(history.items)
      const local = readLocalDraft(id)
      if (local && new Date(local.savedAt).getTime() > new Date(response.article.updatedAt).getTime()) setRecoverable(local)
    }).catch((caught) => {
      if (active) setNotice(caught instanceof Error ? caught.message : '文章读取失败。')
    })
    return () => { active = false }
  }, [applyArticle, editor, id])

  const markChanged = () => {
    setChangeVersion((value) => value + 1)
    setSaveState(articleId ? 'idle' : 'local')
  }

  const snapshot = useCallback((reason: 'manual' | 'autosave', checkpoint = false): ArticleDraftInput => ({
    title: title.trim(),
    slug: slug.trim(),
    summary: summary.trim(),
    coverUrl: coverUrl.trim() || null,
    tags,
    contentJson,
    revision: articleId ? revision : undefined,
    reason,
    checkpoint,
  }), [articleId, contentJson, coverUrl, revision, slug, summary, tags, title])

  useEffect(() => {
    if (!hydrated || changeVersion === 0) return
    const timer = window.setTimeout(() => {
      const draft: LocalDraft = { ...snapshot('autosave'), savedAt: new Date().toISOString() }
      localStorage.setItem(localKey(articleId), JSON.stringify(draft))
      setSaveState((current) => current === 'saving' ? current : 'local')
    }, 450)
    return () => window.clearTimeout(timer)
  }, [articleId, changeVersion, hydrated, snapshot])

  const persist = useCallback(async (reason: 'manual' | 'autosave') => {
    if (!title.trim() || !slug.trim()) {
      if (reason === 'manual') setNotice('标题和 slug 不能为空。')
      return null
    }
    setSaveState('saving')
    setNotice('')
    const checkpoint = reason === 'autosave' && Date.now() - lastCheckpointRef.current >= 5 * 60 * 1000
    try {
      const response = articleId
        ? await articleApi.update(articleId, snapshot(reason, checkpoint))
        : await articleApi.create(snapshot(reason))
      const saved = response.article
      setRevision(saved.revision)
      setStatus(saved.status)
      setArticleId(saved.id)
      setSaveState('saved')
      setChangeVersion(0)
      localStorage.removeItem(localKey(articleId))
      if (checkpoint) lastCheckpointRef.current = Date.now()
      if (!articleId) navigate(`/articles/console/edit/${saved.id}`, { replace: true })
      if (reason === 'manual') {
        setNotice('已保存。')
        const history = await articleApi.revisions(saved.id)
        setRevisions(history.items)
      }
      return saved
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) {
        setSaveState('conflict')
        setNotice('服务器上有更新的版本。本地草稿已保留，请刷新后合并。')
      } else {
        setSaveState('offline')
        setNotice('无法连接服务器，内容已保存在这台设备上。')
      }
      return null
    }
  }, [articleId, navigate, slug, snapshot, title])

  saveRef.current = persist

  useEffect(() => {
    if (!hydrated || changeVersion === 0 || !articleId) return
    const timer = window.setTimeout(() => void saveRef.current('autosave'), 3000)
    return () => window.clearTimeout(timer)
  }, [articleId, changeVersion, hydrated])

  useEffect(() => {
    const syncWhenOnline = () => {
      if (changeVersion > 0 && articleIdRef.current) {
        setNotice('网络已恢复，正在同步本地草稿…')
        void saveRef.current('autosave')
      }
    }
    window.addEventListener('online', syncWhenOnline)
    return () => window.removeEventListener('online', syncWhenOnline)
  }, [changeVersion])

  const transition = async (action: 'publish' | 'unpublish' | 'archive') => {
    const saved = changeVersion > 0 ? await persist('manual') : null
    const activeId = saved?.id ?? articleId
    const activeRevision = saved?.revision ?? revision
    if (!activeId) return
    try {
      const response = await articleApi.transition(activeId, action, activeRevision)
      applyArticle(response.article)
      setNotice(action === 'publish' ? '已发布。' : action === 'archive' ? '已归档。' : '已撤回为草稿。')
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : '状态更新失败。')
    }
  }

  const schedule = async () => {
    if (!scheduledAt) return setNotice('请先选择发布时间。')
    const saved = changeVersion > 0 ? await persist('manual') : null
    const activeId = saved?.id ?? articleId
    const activeRevision = saved?.revision ?? revision
    if (!activeId) return
    try {
      const response = await articleApi.schedule(activeId, activeRevision, new Date(scheduledAt).toISOString())
      applyArticle(response.article)
      setNotice('已设置定时发布。')
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : '定时发布设置失败。')
    }
  }

  const restore = async (storedRevision: number) => {
    if (!articleId || !window.confirm(`恢复到版本 ${storedRevision}？当前内容仍会保留在修订历史中。`)) return
    try {
      const response = await articleApi.restore(articleId, storedRevision, revision)
      applyArticle(response.article)
      setNotice(`已恢复到版本 ${storedRevision}。`)
      const history = await articleApi.revisions(articleId)
      setRevisions(history.items)
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : '版本恢复失败。')
    }
  }

  const uploadCover = async (file: File | undefined) => {
    if (!file) return
    setCoverUploading(true)
    setNotice('')
    try {
      const { media } = await articleApi.upload(file)
      setCoverUrl(media.url)
      markChanged()
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : '题图上传失败。')
    } finally {
      setCoverUploading(false)
    }
  }

  return (
    <ConsoleGate>
      <main className="editor-page" id="main-content" aria-busy={!hydrated}>
        <header className="editor-topbar">
          <div><Link to="/articles/console">← 文章</Link><span className={`save-indicator save-indicator--${saveState}`}>{saveState === 'saving' ? '正在保存' : saveState === 'saved' ? '已保存' : saveState === 'offline' ? '离线保存' : saveState === 'conflict' ? '版本冲突' : saveState === 'local' ? '本地草稿' : '未保存'}</span></div>
          <div><button type="button" onClick={() => setPreview((value) => !value)}>{preview ? '继续编辑' : '预览'}</button><button type="button" onClick={() => setShowRevisions((value) => !value)}>修订 {revisions.length}</button><button className="articles-primary-button" type="button" disabled={saveState === 'saving'} onClick={() => void persist('manual')}>保存</button></div>
        </header>

        {recoverable && <div className="editor-recovery" role="status"><div><strong>发现本地草稿</strong><p>{formatArticleDate(recoverable.savedAt)} 保存在这台设备上。</p></div><button type="button" onClick={() => applyLocal(recoverable)}>恢复</button><button type="button" onClick={() => { localStorage.removeItem(localKey(id)); setRecoverable(null) }}>丢弃</button></div>}
        {notice && <div className="editor-notice" role="status">{notice}<button type="button" aria-label="关闭提示" onClick={() => setNotice('')}>×</button></div>}

        {!hydrated ? <div className="editor-loading">正在打开文章…</div> : (
          <div className={`editor-workspace${preview ? ' is-preview' : ''}`}>
            <section className="editor-document">
              <div className="editor-meta-fields">
                <label><span>文章标题</span><textarea value={title} rows={2} maxLength={160} placeholder="输入标题" onChange={(event) => { setTitle(event.target.value); markChanged() }} /></label>
                <label><span>摘要</span><textarea value={summary} rows={3} maxLength={320} placeholder="一段准确的文章摘要" onChange={(event) => { setSummary(event.target.value); markChanged() }} /></label>
              </div>
              {!preview && <EditorToolbar editor={editor} />}
              <EditorContent editor={editor} />
            </section>

            <aside className="editor-sidebar">
              <section><p className="articles-kicker">PUBLISH</p><div className={`console-status console-status--${status}`}>{status === 'draft' ? '草稿' : status === 'published' ? '已发布' : status === 'scheduled' ? '定时发布' : '已归档'}</div><p>Revision {revision}</p>
                {status !== 'published' && <button className="articles-primary-button" type="button" onClick={() => void transition('publish')}>现在发布</button>}
                {status === 'published' && <button type="button" onClick={() => void transition('unpublish')}>撤回为草稿</button>}
                {status !== 'archived' && <button type="button" onClick={() => void transition('archive')}>归档</button>}
                <label><span>定时发布</span><input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} /></label><button type="button" disabled={!scheduledAt} onClick={() => void schedule()}>设置时间</button>
              </section>
              <section><p className="articles-kicker">SETTINGS</p><label><span>Slug</span><input value={slug} required pattern="[a-z0-9-]+" placeholder="about-me" onChange={(event) => { setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-')); markChanged() }} /></label><label><span>标签（逗号分隔）</span><input value={tagsText} onChange={(event) => { setTagsText(event.target.value); markChanged() }} /></label><label><span>题图 URL</span><input type="url" value={coverUrl} placeholder="https://media.zongrui.org/…" onChange={(event) => { setCoverUrl(event.target.value); markChanged() }} /></label><label><span>上传题图</span><input type="file" accept="image/jpeg,image/png,image/webp" disabled={coverUploading} onChange={(event) => void uploadCover(event.target.files?.[0])} /></label>{coverUrl && <img className="editor-cover-preview" src={coverUrl} alt="当前题图预览" />}</section>
              {articleId && status === 'published' && <a href={`/articles/${slug}`} target="_blank" rel="noreferrer">打开已发布文章 ↗</a>}
            </aside>
          </div>
        )}

        {showRevisions && <aside className="revision-drawer" aria-label="修订历史"><header><h2>修订历史</h2><button type="button" aria-label="关闭" onClick={() => setShowRevisions(false)}>×</button></header>{revisions.length === 0 ? <p>还没有修订记录。</p> : <ol>{revisions.map((item) => <li key={item.id}><div><strong>REV {item.revision}</strong><span>{item.reason} · {formatArticleDate(item.createdAt)}</span></div><button type="button" onClick={() => void restore(item.revision)}>恢复</button></li>)}</ol>}</aside>}
      </main>
    </ConsoleGate>
  )
}
