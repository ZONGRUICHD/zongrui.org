import type {
  AdminArticle,
  AdminArticleSummary,
  AdminComment,
  ArticleComment,
  ArticleDraftInput,
  ArticleRevision,
  AuthSession,
  CursorPage,
  MediaItem,
  PublicArticle,
  PublicArticleSummary,
  Tag,
} from './types'

const API_BASE = '/api/articles/v1'

export class ApiError extends Error {
  status: number
  code?: string
  details?: unknown

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

function readCookie(name: string) {
  const prefix = `${encodeURIComponent(name)}=`
  const item = document.cookie.split('; ').find((cookie) => cookie.startsWith(prefix))
  return item ? decodeURIComponent(item.slice(prefix.length)) : ''
}

function appendParams(path: string, params: Record<string, string | number | undefined | null>) {
  const url = new URL(`${API_BASE}${path}`, window.location.origin)
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
  })
  return `${url.pathname}${url.search}`
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase()
  const headers = new Headers(init.headers)
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrf = readCookie('zr_articles_csrf')
    if (csrf) headers.set('X-CSRF-Token', csrf)
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: 'same-origin',
  })

  if (!response.ok) {
    let body: { message?: string; detail?: string; code?: string } | null = null
    try {
      body = await response.json()
    } catch {
      // The proxy can legitimately return a plain-text offline response.
    }
    throw new ApiError(body?.message ?? body?.detail ?? `请求失败 (${response.status})`, response.status, body?.code, body)
  }

  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export const articleApi = {
  list(params: { q?: string; tag?: string; archive?: string; cursor?: string; limit?: number } = {}) {
    return request<CursorPage<PublicArticleSummary>>(appendParams('/articles', params).slice(API_BASE.length))
  },

  get(slug: string) {
    return request<{ article: PublicArticle }>(`/articles/${encodeURIComponent(slug)}`)
  },

  tags() {
    return request<{ items: Tag[] }>('/tags')
  },

  comments(slug: string, cursor?: string) {
    const path = appendParams(`/articles/${encodeURIComponent(slug)}/comments`, { cursor, limit: 40 })
    return request<CursorPage<ArticleComment>>(path.slice(API_BASE.length))
  },

  comment(slug: string, body: { nickname: string; body: string; parentId?: string; turnstileToken: string }) {
    return request<{ comment: ArticleComment }>(`/articles/${encodeURIComponent(slug)}/comments`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  session() {
    return request<AuthSession>('/auth/session')
  },

  login(returnTo: string) {
    window.location.assign(`${API_BASE}/auth/github/login?returnTo=${encodeURIComponent(returnTo)}`)
  },

  logout() {
    return request<void>('/auth/logout', { method: 'POST' })
  },

  adminList(status?: string, cursor?: string) {
    const path = appendParams('/admin/articles', { status, cursor, limit: 50 })
    return request<CursorPage<AdminArticleSummary>>(path.slice(API_BASE.length))
  },

  adminGet(id: string) {
    return request<{ article: AdminArticle }>(`/admin/articles/${encodeURIComponent(id)}`)
  },

  create(input: ArticleDraftInput) {
    return request<{ article: AdminArticle }>('/admin/articles', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  update(id: string, input: ArticleDraftInput) {
    return request<{ article: AdminArticle }>(`/admin/articles/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  },

  transition(id: string, action: 'publish' | 'unpublish' | 'archive', revision: number) {
    return request<{ article: AdminArticle }>(`/admin/articles/${encodeURIComponent(id)}/${action}`, {
      method: 'POST',
      body: JSON.stringify({ revision }),
    })
  },

  schedule(id: string, revision: number, scheduledAt: string) {
    return request<{ article: AdminArticle }>(`/admin/articles/${encodeURIComponent(id)}/schedule`, {
      method: 'POST',
      body: JSON.stringify({ revision, scheduledAt }),
    })
  },

  revisions(id: string) {
    return request<{ items: ArticleRevision[] }>(`/admin/articles/${encodeURIComponent(id)}/revisions`)
  },

  restore(id: string, storedRevision: number, currentRevision: number) {
    return request<{ article: AdminArticle }>(`/admin/articles/${encodeURIComponent(id)}/revisions/${storedRevision}/restore`, {
      method: 'POST',
      body: JSON.stringify({ revision: currentRevision }),
    })
  },

  upload(file: File) {
    const body = new FormData()
    body.set('file', file)
    return request<{ media: MediaItem }>('/admin/media', { method: 'POST', body })
  },

  adminComments(status?: string, cursor?: string) {
    const path = appendParams('/admin/comments', { status, cursor, limit: 50 })
    return request<CursorPage<AdminComment>>(path.slice(API_BASE.length))
  },

  moderateComment(id: string, action: 'hide' | 'restore' | 'delete') {
    return request<{ comment: AdminComment }>(`/admin/comments/${encodeURIComponent(id)}/${action}`, { method: 'POST' })
  },
}
