export type ArticleStatus = 'draft' | 'scheduled' | 'published' | 'archived'
export type ArticleWritingMode = 'horizontal' | 'vertical-rl'
export type ArticleLanguage = 'zh-CN' | 'zh-Hant'

export type Tag = {
  name: string
  slug: string
  count?: number
}

export type PublicArticleSummary = {
  id: string
  slug: string
  title: string
  summary: string
  coverUrl: string | null
  tags: string[]
  readingMinutes: number
  publishedAt: string | null
  updatedAt: string
  writingMode: ArticleWritingMode
  contentLanguage: ArticleLanguage
}

export type PublicArticle = PublicArticleSummary & {
  contentHtml: string
}

export type VisitorStats = {
  uniqueVisitors: number
  counted: boolean
  since: string | null
}

export type TiptapDocument = {
  type: 'doc'
  content?: Array<Record<string, unknown>>
}

export type AdminArticleSummary = PublicArticleSummary & {
  status: ArticleStatus
  scheduledAt: string | null
  createdAt: string
  revision: number
}

export type AdminArticle = AdminArticleSummary & {
  contentJson: TiptapDocument
  contentHtml?: string
}

export type ArticleRevision = {
  id: string
  revision: number
  reason: 'create' | 'manual' | 'autosave' | 'publish' | 'restore' | string
  createdAt: string
  title: string
  summary: string
}

export type ArticleComment = {
  id: string
  parentId: string | null
  nickname: string
  body: string
  status: 'visible' | 'hidden' | 'deleted'
  createdAt: string
  replies: ArticleComment[]
}

export type AdminComment = ArticleComment & {
  article: { id: string; slug: string; title: string }
}

export type MediaItem = {
  id: string
  url: string
  width: number
  height: number
  mimeType: string
  size: number
  sha256?: string
  createdAt: string
}

export type AdminUser = {
  id: string
  login: string
  avatarUrl?: string
}

export type AuthSession = {
  authenticated: boolean
  user?: AdminUser
}

export type CursorPage<T> = {
  items: T[]
  nextCursor: string | null
}

export type ArticleDraftInput = {
  title: string
  slug: string
  summary: string
  coverUrl: string | null
  tags: string[]
  contentJson: TiptapDocument
  writingMode: ArticleWritingMode
  contentLanguage: ArticleLanguage
  revision?: number
  checkpoint?: boolean
  reason?: 'manual' | 'autosave'
}

export type TraditionalTranslationInput = Pick<ArticleDraftInput, 'title' | 'summary' | 'contentJson'>

export type TraditionalTranslationResult = TraditionalTranslationInput
