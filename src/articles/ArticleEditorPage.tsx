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
import type { AdminArticle, ArticleDraftInput, ArticleRevision, ArticleStatus, ArticleWritingMode, TiptapDocument } from './types'

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
  const [writingMode, setWritingMode] = useState<ArticleWritingMode>('horizontal')
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
  const changeVersionRef = useRef(0)
  const revisionRef = useRef(revision)
  const saveInFlightRef = useRef<Promise<AdminArticle | null> | null>(null)
  const autosaveRetryRef = useRef<number | null>(null)
  const pendingNavigationRef = useRef<string | null>(null)
  const saveRef = useRef<(reason: 'manual' | 'autosave') => Promise<AdminArticle | null>>(async () => null)
  const articleIdRef = useRef(articleId)
  articleIdRef.current = articleId
  revisionRef.current = revision

  const bumpChangeVersion = useCallback(() => {
    const next = changeVersionRef.current + 1
    changeVersionRef.current = next
    setChangeVersion(next)
  }, [])

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
      bumpChangeVersion()
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
    revisionRef.current = article.revision
    setContentJson(article.contentJson ?? emptyDocument)
    setWritingMode(article.writingMode ?? 'horizontal')
    editor?.commands.setContent(article.contentJson ?? emptyDocument, { emitUpdate: false })
    changeVersionRef.current = 0
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
    setWritingMode(draft.writingMode ?? 'horizontal')
    setRevision(draft.revision ?? revision)
    editor?.commands.setContent(draft.contentJson, { emitUpdate: false })
    setRecoverable(null)
    bumpChangeVersion()
    setSaveState('local')
  }, [bumpChangeVersion, editor, revision])

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
    bumpChangeVersion()
    setSaveState(articleId ? 'idle' : 'local')
  }

  const snapshot = useCallback((reason: 'manual' | 'autosave', checkpoint = false): ArticleDraftInput => ({
    title: title.trim(),
    slug: slug.trim(),
    summary: summary.trim(),
    coverUrl: coverUrl.trim() || null,
    tags,
    contentJson,
    writingMode,
    revision: articleIdRef.current ? revisionRef.current : undefined,
    reason,
    checkpoint,
  }), [contentJson, coverUrl, slug, summary, tags, title, writingMode])

  useEffect(() => {
    if (!hydrated || changeVersion === 0) return
    const timer = window.setTimeout(() => {
      const draft: LocalDraft = { ...snapshot('autosave'), savedAt: new Date().toISOString() }
      localStorage.setItem(localKey(articleId), JSON.stringify(draft))
      setSaveState((current) => current === 'saving' ? current : 'local')
    }, 450)
    return () => window.clearTimeout(timer)
  }, [articleId, changeVersion, hydrated, snapshot])

  const persist = useCallback(async (reason: 'manual' | 'autosave'): Promise<AdminArticle | null> => {
    const activeSave = saveInFlightRef.current
    if (activeSave) {
      const saved = await activeSave
      if (saved && reason === 'manual' && changeVersionRef.current > 0) return saveRef.current('manual')
      return saved
    }

    if (!title.trim() || !slug.trim()) {
      if (reason === 'manual') setNotice('标题和 slug 不能为空。')
      return null
    }

    const submittedVersion = changeVersionRef.current
    const submittedArticleId = articleIdRef.current
    const checkpoint = reason === 'autosave' && Date.now() - lastCheckpointRef.current >= 5 * 60 * 1000
    const payload = snapshot(reason, checkpoint)
    let savedWithNewerChanges = false

    const operation = (async () => {
      setSaveState('saving')
      setNotice('')
      try {
        const response = submittedArticleId
          ? await articleApi.update(submittedArticleId, payload)
          : await articleApi.create(payload)
        const saved = response.article
        revisionRef.current = saved.revision
        articleIdRef.current = saved.id
        setRevision(saved.revision)
        setStatus(saved.status)
        setArticleId(saved.id)

        const isCurrent = changeVersionRef.current === submittedVersion
        savedWithNewerChanges = !isCurrent
        if (isCurrent) {
          changeVersionRef.current = 0
          setChangeVersion(0)
          setSaveState('saved')
          localStorage.removeItem(localKey(submittedArticleId))
          localStorage.removeItem(localKey(saved.id))
        } else {
          setSaveState('local')
        }

        if (checkpoint) lastCheckpointRef.current = Date.now()
        if (!submittedArticleId) pendingNavigationRef.current = saved.id
        if (isCurrent && pendingNavigationRef.current) {
          const destination = pendingNavigationRef.current
          pendingNavigationRef.current = null
          navigate(`/articles/console/edit/${destination}`, { replace: true })
        }
        if (reason === 'manual' && isCurrent) {
          setNotice('已保存。')
          void articleApi.revisions(saved.id).then((history) => setRevisions(history.items)).catch(() => {
            setNotice('文章已保存，但修订列表暂时无法刷新。')
          })
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
    })()

    let tracked: Promise<AdminArticle | null>
    tracked = operation.finally(() => {
      if (saveInFlightRef.current === tracked) saveInFlightRef.current = null
      if (savedWithNewerChanges && articleIdRef.current) {
        if (autosaveRetryRef.current !== null) window.clearTimeout(autosaveRetryRef.current)
        autosaveRetryRef.current = window.setTimeout(() => {
          autosaveRetryRef.current = null
          if (changeVersionRef.current > 0) void saveRef.current('autosave')
        }, 3000)
      }
    })
    saveInFlightRef.current = tracked
    const saved = await tracked
    if (saved && reason === 'manual' && changeVersionRef.current > 0) return saveRef.current('manual')
    return saved
  }, [navigate, slug, snapshot, title])

  saveRef.current = persist

  useEffect(() => {
    if (!hydrated || changeVersion === 0 || !articleId) return
    const timer = window.setTimeout(() => void saveRef.current('autosave'), 3000)
    return () => window.clearTimeout(timer)
  }, [articleId, changeVersion, hydrated])

  useEffect(() => {
    const syncWhenOnline = () => {
      if (changeVersionRef.current > 0 && articleIdRef.current) {
        setNotice('网络已恢复，正在同步本地草稿…')
        void saveRef.current('autosave')
      }
    }
    window.addEventListener('online', syncWhenOnline)
    return () => window.removeEventListener('online', syncWhenOnline)
  }, [changeVersion])

  useEffect(() => () => {
    if (autosaveRetryRef.current !== null) window.clearTimeout(autosaveRetryRef.current)
  }, [])

  const transition = async (action: 'publish' | 'unpublish' | 'archive') => {
    const needsSave = changeVersionRef.current > 0 || saveInFlightRef.current !== null
    const saved = needsSave ? await persist('manual') : null
    if (needsSave && !saved) return
    const activeId = saved?.id ?? articleIdRef.current
    const activeRevision = saved?.revision ?? revisionRef.current
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
    const needsSave = changeVersionRef.current > 0 || saveInFlightRef.current !== null
    const saved = needsSave ? await persist('manual') : null
    if (needsSave && !saved) return
    const activeId = saved?.id ?? articleIdRef.current
    const activeRevision = saved?.revision ?? revisionRef.current
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
            <section className={`editor-document${preview && writingMode === 'vertical-rl' ? ' editor-document--vertical' : ''}`}>
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
              <section>
                <p className="articles-kicker">SETTINGS</p>
                <fieldset className="editor-layout-picker">
                  <legend>阅读排版</legend>
                  <label>
                    <input type="radio" name="writing-mode" value="horizontal" checked={writingMode === 'horizontal'} onChange={() => { setWritingMode('horizontal'); markChanged() }} />
                    <span><strong>大陆横排</strong><small>从左至右，适合简体中文与技术文章</small></span>
                  </label>
                  <label>
                    <input type="radio" name="writing-mode" value="vertical-rl" checked={writingMode === 'vertical-rl'} onChange={() => { setWritingMode('vertical-rl'); markChanged() }} />
                    <span><strong>繁中直排</strong><small>从上至下、栏从右至左；不会自动转换文字</small></span>
                  </label>
                </fieldset>
                <label><span>Slug</span><input value={slug} required pattern="[a-z0-9-]+" placeholder="about-me" onChange={(event) => { setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-')); markChanged() }} /></label>
                <label><span>标签（逗号分隔）</span><input value={tagsText} onChange={(event) => { setTagsText(event.target.value); markChanged() }} /></label>
                <label><span>题图 URL</span><input type="url" value={coverUrl} placeholder="https://media.zongrui.org/…" onChange={(event) => { setCoverUrl(event.target.value); markChanged() }} /></label>
                <label><span>上传题图</span><input type="file" accept="image/jpeg,image/png,image/webp" disabled={coverUploading} onChange={(event) => void uploadCover(event.target.files?.[0])} /></label>
                {coverUrl && <img className="editor-cover-preview" src={coverUrl} alt="当前题图预览" />}
              </section>
              {articleId && status === 'published' && <a href={`/articles/${slug}`} target="_blank" rel="noreferrer">打开已发布文章 ↗</a>}
            </aside>
          </div>
        )}

        {showRevisions && <aside className="revision-drawer" aria-label="修订历史"><header><h2>修订历史</h2><button type="button" aria-label="关闭" onClick={() => setShowRevisions(false)}>×</button></header>{revisions.length === 0 ? <p>还没有修订记录。</p> : <ol>{revisions.map((item) => <li key={item.id}><div><strong>REV {item.revision}</strong><span>{item.reason} · {formatArticleDate(item.createdAt)}</span></div><button type="button" onClick={() => void restore(item.revision)}>恢复</button></li>)}</ol>}</aside>}
      </main>
    </ConsoleGate>
  )
}
