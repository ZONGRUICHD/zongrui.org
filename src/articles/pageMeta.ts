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
  return element
}

export function usePageMeta({ title, description, canonical, image, noIndex, jsonLd, language, ogLocale }: PageMeta) {
  useEffect(() => {
    const previousTitle = document.title
    const previousLanguage = document.documentElement.lang
    const canonicalBefore = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
    const previousCanonical = canonicalBefore?.getAttribute('href') ?? null
    const canonicalElement = canonicalBefore ?? document.createElement('link')
    canonicalElement.rel = 'canonical'
    canonicalElement.href = canonical ?? window.location.href
    if (!canonicalElement.parentNode) document.head.appendChild(canonicalElement)

    const descriptionText = description ?? 'ZongRui 的个人主页，放着我写的 Rust、RoboMaster、Linux、网络和网页项目。'
    const imageUrl = image || 'https://zongrui.org/og-image.png'
    const metaDefinitions = [
      ['meta[name="description"]', { name: 'description', content: descriptionText }],
      ['meta[property="og:type"]', { property: 'og:type', content: jsonLd ? 'article' : 'website' }],
      ['meta[property="og:description"]', { property: 'og:description', content: descriptionText }],
      ['meta[property="og:title"]', { property: 'og:title', content: title }],
      ['meta[property="og:url"]', { property: 'og:url', content: canonicalElement.href }],
      ['meta[property="og:locale"]', { property: 'og:locale', content: ogLocale ?? 'zh_CN' }],
      ['meta[property="og:image"]', { property: 'og:image', content: imageUrl }],
      ['meta[name="twitter:title"]', { name: 'twitter:title', content: title }],
      ['meta[name="twitter:description"]', { name: 'twitter:description', content: descriptionText }],
      ['meta[name="twitter:image"]', { name: 'twitter:image', content: imageUrl }],
      ['meta[name="robots"]', { name: 'robots', content: noIndex ? 'noindex, nofollow' : 'index, follow' }],
    ] as const
    const previousMeta = metaDefinitions.map(([selector]) => {
      const element = document.head.querySelector<HTMLMetaElement>(selector)
      return { selector, element, content: element?.getAttribute('content') ?? null }
    })

    document.title = title
    if (language) document.documentElement.lang = language
    metaDefinitions.forEach(([selector, attributes]) => setMeta(selector, attributes))

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
      if (canonicalBefore) {
        if (previousCanonical === null) canonicalBefore.removeAttribute('href')
        else canonicalBefore.setAttribute('href', previousCanonical)
      } else {
        canonicalElement.remove()
      }
      previousMeta.forEach(({ selector, element, content }) => {
        const current = document.head.querySelector<HTMLMetaElement>(selector)
        if (!element) current?.remove()
        else if (content === null) element.removeAttribute('content')
        else element.setAttribute('content', content)
      })
      script?.remove()
    }
  }, [canonical, description, image, jsonLd, language, noIndex, ogLocale, title])
}

export function formatArticleDate(value: string | null | undefined) {
  if (!value) return '未发布'
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(value))
}
