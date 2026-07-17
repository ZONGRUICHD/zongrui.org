import { useEffect } from 'react'

type PageMeta = {
  title: string
  description?: string
  canonical?: string
  image?: string | null
  noIndex?: boolean
  jsonLd?: Record<string, unknown>
  language?: 'zh-CN' | 'zh-Hant'
  ogLocale?: 'zh_CN' | 'zh_TW'
}

function setMeta(selector: string, attributes: Record<string, string>) {
  let element = document.head.querySelector<HTMLMetaElement>(selector)
  if (!element) {
    element = document.createElement('meta')
    document.head.appendChild(element)
  }
  Object.entries(attributes).forEach(([name, value]) => element?.setAttribute(name, value))
}

export function usePageMeta({ title, description, canonical, image, noIndex, jsonLd, language, ogLocale }: PageMeta) {
  useEffect(() => {
    const previousTitle = document.title
    const previousLanguage = document.documentElement.lang
    const localeElement = document.head.querySelector<HTMLMetaElement>('meta[property="og:locale"]')
    const previousLocale = localeElement?.getAttribute('content') ?? null
    const createdLocale = !localeElement
    const canonicalElement = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]') ?? document.createElement('link')
    canonicalElement.rel = 'canonical'
    canonicalElement.href = canonical ?? window.location.href
    if (!canonicalElement.parentNode) document.head.appendChild(canonicalElement)

    document.title = title
    if (language) document.documentElement.lang = language
    if (description) {
      setMeta('meta[name="description"]', { name: 'description', content: description })
      setMeta('meta[property="og:description"]', { property: 'og:description', content: description })
    }
    setMeta('meta[property="og:title"]', { property: 'og:title', content: title })
    setMeta('meta[property="og:url"]', { property: 'og:url', content: canonicalElement.href })
    if (ogLocale) setMeta('meta[property="og:locale"]', { property: 'og:locale', content: ogLocale })
    setMeta('meta[name="robots"]', { name: 'robots', content: noIndex ? 'noindex, nofollow' : 'index, follow' })
    if (image) setMeta('meta[property="og:image"]', { property: 'og:image', content: image })

    let script: HTMLScriptElement | null = null
    if (jsonLd) {
      script = document.createElement('script')
      script.type = 'application/ld+json'
      script.dataset.zrArticle = 'true'
      script.textContent = JSON.stringify(jsonLd)
      document.head.appendChild(script)
    }

    return () => {
      document.title = previousTitle
      document.documentElement.lang = previousLanguage
      const currentLocale = document.head.querySelector<HTMLMetaElement>('meta[property="og:locale"]')
      if (createdLocale) currentLocale?.remove()
      else if (currentLocale && previousLocale !== null) currentLocale.content = previousLocale
      script?.remove()
    }
  }, [canonical, description, image, jsonLd, language, noIndex, ogLocale, title])
}

export function formatArticleDate(value: string | null | undefined) {
  if (!value) return '未发布'
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(value))
}
