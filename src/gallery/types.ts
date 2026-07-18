export type GalleryStatus = 'draft' | 'published' | 'archived'

export type GalleryImage = {
  id: string
  url: string
  title: string
  caption: string
  alt: string
  order: number
  width: number
  height: number
  publishedAt: string | null
}

export type AdminGalleryImage = GalleryImage & {
  mediaId: string
  status: GalleryStatus
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export type GalleryPageResult<T> = {
  items: T[]
  nextCursor: string | null
}

export type GalleryImageInput = {
  title: string
  caption: string
  alt: string
  order: number | null
}
