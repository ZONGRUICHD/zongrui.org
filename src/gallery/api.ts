import type {
  AdminGalleryImage,
  GalleryImage,
  GalleryImageInput,
  GalleryPageResult,
  GalleryStatus,
} from './types'

const API_BASE = '/api/articles/v1'

export class GalleryApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'GalleryApiError'
    this.status = status
  }
}

function readCookie(name: string) {
  const prefix = `${encodeURIComponent(name)}=`
  const item = document.cookie.split('; ').find((cookie) => cookie.startsWith(prefix))
  return item ? decodeURIComponent(item.slice(prefix.length)) : ''
}

function withParams(path: string, params: Record<string, string | number | undefined>) {
  const url = new URL(`${API_BASE}${path}`, window.location.origin)
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value))
  })
  return `${url.pathname}${url.search}`
}

function errorMessage(body: unknown, fallback: string) {
  if (!body || typeof body !== 'object') return fallback
  const record = body as Record<string, unknown>
  if (typeof record.message === 'string') return record.message
  if (typeof record.detail === 'string') return record.detail
  return fallback
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  const method = (init.method ?? 'GET').toUpperCase()
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
    let body: unknown = null
    try {
      body = await response.json()
    } catch {
      // Cloudflare may return a plain-text offline response.
    }
    throw new GalleryApiError(errorMessage(body, `请求失败 (${response.status})`), response.status)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export const galleryApi = {
  list(cursor?: string) {
    const path = withParams('/gallery', { cursor, limit: 24 })
    return request<GalleryPageResult<GalleryImage>>(path.slice(API_BASE.length))
  },

  adminList(status?: GalleryStatus, cursor?: string) {
    const path = withParams('/admin/gallery', { status, cursor, limit: 50 })
    return request<GalleryPageResult<AdminGalleryImage>>(path.slice(API_BASE.length))
  },

  upload(file: File, input: GalleryImageInput) {
    const body = new FormData()
    body.set('file', file)
    body.set('title', input.title)
    body.set('caption', input.caption)
    body.set('alt', input.alt)
    if (input.order !== null) body.set('order', String(input.order))
    return request<{ image: AdminGalleryImage }>('/admin/gallery/upload', { method: 'POST', body })
  },

  update(id: string, input: GalleryImageInput) {
    return request<{ image: AdminGalleryImage }>(`/admin/gallery/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...input, order: input.order ?? 0 }),
    })
  },

  publish(id: string) {
    return request<{ image: AdminGalleryImage }>(`/admin/gallery/${encodeURIComponent(id)}/publish`, { method: 'POST' })
  },

  archive(id: string) {
    return request<{ image: AdminGalleryImage }>(`/admin/gallery/${encodeURIComponent(id)}/archive`, { method: 'POST' })
  },

  delete(id: string) {
    return request<void>(`/admin/gallery/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },

  reorder(orderedIds: string[]) {
    return request<{ items: AdminGalleryImage[] }>('/admin/gallery/reorder', {
      method: 'POST',
      body: JSON.stringify({ orderedIds }),
    })
  },
}
