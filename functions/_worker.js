const API_PREFIX = '/api/articles'
const GITHUB_EXCHANGE_PATH = `${API_PREFIX}/_oauth/github/exchange`
const PUBLIC_SITE_ORIGIN = 'https://zongrui.org'
const PUBLIC_CACHE_TTL_SECONDS = 300
const INDEX_CACHE_TTL_SECONDS = 60
const STALE_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60
const PUBLIC_HTML_CACHE_CONTROL = `public, max-age=0, s-maxage=${PUBLIC_CACHE_TTL_SECONDS}, stale-while-revalidate=${STALE_CACHE_TTL_SECONDS}, stale-if-error=${STALE_CACHE_TTL_SECONDS}`

const BLOCKED_FORWARD_HEADERS = [
  'cf-access-client-id',
  'cf-access-client-secret',
  'cf-access-jwt-assertion',
  'cf-connecting-ip',
  'cf-ipcountry',
  'content-length',
  'forwarded',
  'host',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-real-ip',
  'x-zr-origin-token',
  'x-zr-visitor-ip',
]

const PAGE_SECURITY_POLICY = {
  hsts: 'max-age=31536000',
  permissions: 'camera=(), microphone=(), geolocation=()',
  referrer: 'strict-origin-when-cross-origin',
}

function jsonError(status, code, message, extraHeaders = {}) {
  return Response.json(
    { error: { code, message } },
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
        'Permissions-Policy': PAGE_SECURITY_POLICY.permissions,
        'Referrer-Policy': PAGE_SECURITY_POLICY.referrer,
        'Strict-Transport-Security': PAGE_SECURITY_POLICY.hsts,
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        ...extraHeaders,
      },
    },
  )
}

async function secretsMatch(supplied, expected) {
  const encoder = new TextEncoder()
  const [suppliedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(supplied)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ])
  const suppliedBytes = new Uint8Array(suppliedHash)
  const expectedBytes = new Uint8Array(expectedHash)
  let difference = supplied.length ^ expected.length
  for (let index = 0; index < suppliedBytes.length; index += 1) {
    difference |= suppliedBytes[index] ^ expectedBytes[index]
  }
  return difference === 0
}

function relayResponse(payload, status, requestId) {
  return Response.json(payload, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      'Permissions-Policy': PAGE_SECURITY_POLICY.permissions,
      'Referrer-Policy': PAGE_SECURITY_POLICY.referrer,
      'Strict-Transport-Security': PAGE_SECURITY_POLICY.hsts,
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-ZR-Request-ID': requestId,
    },
  })
}

async function handleGithubExchangeRelay(request, env) {
  const requestId = crypto.randomUUID()
  if (request.method !== 'POST') {
    const response = jsonError(405, 'method_not_allowed', 'Method not allowed.', {
      Allow: 'POST',
      'X-ZR-Request-ID': requestId,
    })
    return response
  }

  const relaySecret = env.ARTICLES_ORIGIN_SHARED_SECRET
  if (!relaySecret) {
    return jsonError(503, 'github_relay_not_configured', 'GitHub 登录中继尚未配置。', {
      'X-ZR-Request-ID': requestId,
    })
  }

  const suppliedSecret = request.headers.get('X-ZR-Origin-Token') ?? ''
  if (!await secretsMatch(suppliedSecret, relaySecret)) {
    return jsonError(404, 'not_found', 'Not found.', { 'X-ZR-Request-ID': requestId })
  }

  try {
    const rawBody = await request.text()
    if (rawBody.length > 4096) {
      return jsonError(413, 'relay_request_too_large', 'Request is too large.', {
        'X-ZR-Request-ID': requestId,
      })
    }
    let payload
    try {
      payload = JSON.parse(rawBody)
    } catch {
      return jsonError(400, 'invalid_github_exchange_request', 'Invalid GitHub exchange request.', {
        'X-ZR-Request-ID': requestId,
      })
    }
    const { clientId, clientSecret, code, redirectUri } = payload
    const expectedRedirectUri = `${PUBLIC_SITE_ORIGIN}${API_PREFIX}/v1/auth/github/callback`
    const validPayload = typeof clientId === 'string' && clientId.length > 0 && clientId.length <= 256
      && typeof clientSecret === 'string' && clientSecret.length > 0 && clientSecret.length <= 1024
      && typeof code === 'string' && code.length > 0 && code.length <= 512
      && redirectUri === expectedRedirectUri
    if (!validPayload) {
      return jsonError(400, 'invalid_github_exchange_request', 'Invalid GitHub exchange request.', {
        'X-ZR-Request-ID': requestId,
      })
    }

    const upstreamSignal = AbortSignal.timeout(10_000)
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      signal: upstreamSignal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'zongrui-articles-edge/1.0',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    })
    const tokenPayload = await tokenResponse.json().catch(() => null)
    if (tokenResponse.status === 429) {
      return relayResponse({ error: { code: 'github_rate_limited' } }, 503, requestId)
    }
    if (tokenResponse.status >= 500) {
      return relayResponse({ error: { code: 'github_oauth_unavailable' } }, 502, requestId)
    }
    const accessToken = tokenPayload?.access_token
    if (!tokenResponse.ok || tokenPayload?.error === 'bad_verification_code') {
      return relayResponse({ error: { code: 'github_oauth_exchange_failed' } }, 401, requestId)
    }
    if (typeof accessToken !== 'string' || !accessToken) {
      return relayResponse({ error: { code: 'github_oauth_unavailable' } }, 502, requestId)
    }

    const userResponse = await fetch('https://api.github.com/user', {
      signal: upstreamSignal,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'zongrui-articles-edge/1.0',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })
    const user = await userResponse.json().catch(() => null)
    if (!userResponse.ok || !Number.isInteger(user?.id) || typeof user?.login !== 'string') {
      return relayResponse({ error: { code: 'github_user_lookup_failed' } }, 502, requestId)
    }

    return relayResponse({ id: user.id, login: user.login, avatarUrl: user.avatar_url ?? null }, 200, requestId)
  } catch (error) {
    console.error(JSON.stringify({
      event: 'github_exchange_relay_failed',
      requestId,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    }))
    return jsonError(502, 'github_relay_unavailable', 'GitHub 登录服务暂时不可用。', {
      'X-ZR-Request-ID': requestId,
    })
  }
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function safeJson(value) {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029')
}

function normalizeOriginUrl(rawOrigin) {
  if (!rawOrigin) return null

  try {
    const origin = new URL(rawOrigin)
    if (!['https:', 'http:'].includes(origin.protocol)) return null
    origin.pathname = origin.pathname.replace(/\/$/, '')
    return origin
  } catch {
    return null
  }
}

function requiresOriginCredential(origin) {
  return !['localhost', '127.0.0.1', '::1'].includes(origin.hostname)
}

function buildOriginRequest(request, env, apiPathOverride) {
  const publicUrl = new URL(request.url)
  const origin = normalizeOriginUrl(env.ARTICLES_ORIGIN_URL)

  if (!origin) {
    return { error: jsonError(503, 'articles_not_configured', '文章服务尚未完成配置。') }
  }

  const hasAccessToken = Boolean(env.CF_ACCESS_CLIENT_ID && env.CF_ACCESS_CLIENT_SECRET)
  const hasSharedSecret = Boolean(env.ARTICLES_ORIGIN_SHARED_SECRET)
  if (requiresOriginCredential(origin) && !hasAccessToken && !hasSharedSecret) {
    return { error: jsonError(503, 'articles_origin_auth_not_configured', '文章源站访问凭据尚未完成配置。') }
  }

  const apiPath = apiPathOverride ?? (publicUrl.pathname.slice(API_PREFIX.length) || '/')
  const target = new URL(origin.toString())
  const originBasePath = origin.pathname === '/' ? '' : origin.pathname.replace(/\/+$/, '')
  target.pathname = `${originBasePath}${apiPath.startsWith('/') ? apiPath : `/${apiPath}`}`
  target.search = publicUrl.search

  const headers = new Headers(request.headers)
  for (const header of BLOCKED_FORWARD_HEADERS) headers.delete(header)

  if (hasAccessToken) {
    headers.set('CF-Access-Client-Id', env.CF_ACCESS_CLIENT_ID)
    headers.set('CF-Access-Client-Secret', env.CF_ACCESS_CLIENT_SECRET)
  }
  if (hasSharedSecret) headers.set('X-ZR-Origin-Token', env.ARTICLES_ORIGIN_SHARED_SECRET)

  const visitorIp = request.headers.get('CF-Connecting-IP')
  if (visitorIp) headers.set('X-ZR-Visitor-IP', visitorIp)

  headers.set('X-Forwarded-Host', publicUrl.host)
  headers.set('X-Forwarded-Proto', publicUrl.protocol.slice(0, -1))
  headers.set('X-ZR-Public-Origin', publicUrl.origin)

  const init = {
    method: request.method,
    headers,
    redirect: 'manual',
  }

  if (!['GET', 'HEAD'].includes(request.method)) init.body = request.body

  return { target, init, origin }
}

function rewriteLocation(response, request, origin) {
  const location = response.headers.get('Location')
  if (!location) return response

  let rewritten = location
  try {
    const resolved = new URL(location, origin)
    if (resolved.origin === origin.origin) {
      const publicUrl = new URL(request.url)
      const originBasePath = origin.pathname.replace(/\/$/, '')
      const apiPath = resolved.pathname.startsWith(originBasePath)
        ? resolved.pathname.slice(originBasePath.length)
        : resolved.pathname
      rewritten = `${publicUrl.origin}${API_PREFIX}${apiPath}${resolved.search}${resolved.hash}`
    }
  } catch {
    // Keep an unusual upstream Location untouched.
  }

  const headers = new Headers(response.headers)
  headers.set('Location', rewritten)
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

function stripResponseCookie(headers, cookieName) {
  const setCookies = headers.getSetCookie()
  if (!setCookies.length) return

  const normalizedName = cookieName.toLowerCase()
  const retained = setCookies.filter((cookie) => {
    const separator = cookie.indexOf('=')
    if (separator < 0) return true
    return cookie.slice(0, separator).trim().toLowerCase() !== normalizedName
  })

  if (retained.length === setCookies.length) return
  headers.delete('Set-Cookie')
  for (const cookie of retained) headers.append('Set-Cookie', cookie)
}

function sanitizeOriginResponse(response) {
  const headers = new Headers(response.headers)
  headers.delete('Server')
  headers.delete('X-Powered-By')
  stripResponseCookie(headers, 'CF_Authorization')
  headers.set('Strict-Transport-Security', PAGE_SECURITY_POLICY.hsts)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

async function fetchOrigin(request, env, apiPathOverride) {
  const built = buildOriginRequest(request, env, apiPathOverride)
  if (built.error) return built.error

  try {
    const response = await fetch(built.target, built.init)
    return sanitizeOriginResponse(rewriteLocation(response, request, built.origin))
  } catch (error) {
    const requestId = crypto.randomUUID()
    console.error(JSON.stringify({
      event: 'articles_origin_fetch_failed',
      requestId,
      path: new URL(request.url).pathname,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    }))
    return jsonError(503, 'articles_offline', '文章服务器暂时离线，请稍后再试。', {
      'X-ZR-Request-ID': requestId,
    })
  }
}

function normalizePrivateUpstreamError(response, request) {
  const contentType = response.headers.get('Content-Type') ?? ''
  if (response.status < 500 || contentType.toLowerCase().includes('application/json')) {
    return response
  }

  const requestId = crypto.randomUUID()
  console.error(JSON.stringify({
    event: 'articles_origin_non_json_error',
    requestId,
    path: new URL(request.url).pathname,
    status: response.status,
    contentType: contentType.slice(0, 80),
  }))
  const status = response.status === 503 ? 503 : 502
  return jsonError(status, 'articles_origin_error', '文章服务暂时不可用，请稍后再试。', {
    'X-ZR-Request-ID': requestId,
  })
}

function isParameterizedArticleList(request) {
  if (request.method !== 'GET') return false
  const url = new URL(request.url)
  return url.pathname.slice(API_PREFIX.length) === '/v1/articles' && Boolean(url.search)
}

function isPublicCacheableApi(request) {
  if (request.method !== 'GET') return false

  const url = new URL(request.url)
  const path = url.pathname.slice(API_PREFIX.length)
  if (path.includes('/comments')) return false
  if (path.includes('/admin/') || path.includes('/auth/')) return false
  if (isParameterizedArticleList(request)) return false

  return (
    path === '/v1/articles'
    || path.startsWith('/v1/articles/')
    || path === '/v1/tags'
    || path === '/v1/rss.xml'
    || path === '/v1/sitemap.xml'
  )
}

function responseWithNoStore(response) {
  const headers = new Headers(response.headers)
  headers.set('Cache-Control', 'no-store')
  headers.delete('CDN-Cache-Control')
  headers.delete('Cloudflare-CDN-Cache-Control')
  headers.set('X-ZR-Edge-Cache', 'BYPASS')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

function apiFreshnessSeconds(request) {
  const path = new URL(request.url).pathname.slice(API_PREFIX.length)
  return path.startsWith('/v1/articles/') ? PUBLIC_CACHE_TTL_SECONDS : INDEX_CACHE_TTL_SECONDS
}

function cachedAt(response) {
  const value = Number(response.headers.get('X-ZR-Edge-Cached-At'))
  return Number.isFinite(value) ? value : 0
}

function responseForBrowser(response, cacheStatus, freshnessSeconds = PUBLIC_CACHE_TTL_SECONDS) {
  const headers = new Headers(response.headers)
  headers.delete('Server')
  headers.delete('X-Powered-By')
  const hasSetCookie = headers.has('Set-Cookie')
  headers.set(
    'Cache-Control',
    hasSetCookie
      ? 'private, no-store'
      : `public, max-age=0, s-maxage=${freshnessSeconds}, stale-while-revalidate=86400, stale-if-error=${STALE_CACHE_TTL_SECONDS}`,
  )
  headers.set('X-ZR-Edge-Cache', hasSetCookie ? 'BYPASS' : cacheStatus)
  headers.set('X-Content-Type-Options', 'nosniff')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

async function storePublicResponse(cache, key, response) {
  if (!response.ok || response.headers.has('Set-Cookie')) return

  const headers = new Headers(response.headers)
  headers.set('Cache-Control', `public, max-age=${STALE_CACHE_TTL_SECONDS}`)
  headers.set('X-ZR-Edge-Cached-At', String(Date.now()))
  headers.delete('Set-Cookie')

  await cache.put(
    key,
    new Response(response.clone().body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    }),
  )
}

function publicCacheKey(request) {
  const url = new URL(request.url)
  url.hash = ''
  return new Request(url.toString(), { method: 'GET' })
}

async function invalidatePublicCache(response, request, ctx) {
  const rawPaths = response.headers.get('X-ZR-Cache-Invalidate')
  if (!rawPaths) return

  const origin = new URL(request.url).origin
  const paths = rawPaths.split(',').map((value) => value.trim()).filter(Boolean)
  const deletions = paths.map((path) => {
    const publicPath = path.startsWith('/v1/') ? `${API_PREFIX}${path}` : path
    return caches.default.delete(new Request(new URL(publicPath, origin).toString(), { method: 'GET' }))
  })
  ctx.waitUntil(Promise.all(deletions))
}

async function proxyArticlesApi(request, env, ctx) {
  if (!isPublicCacheableApi(request)) {
    const originResponse = await fetchOrigin(request, env)
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      await invalidatePublicCache(originResponse.clone(), request, ctx)
    }
    const response = normalizePrivateUpstreamError(originResponse, request)
    return isParameterizedArticleList(request) ? responseWithNoStore(response) : response
  }

  const cache = caches.default
  const key = publicCacheKey(request)
  const freshnessSeconds = apiFreshnessSeconds(request)
  const cached = await cache.match(key)
  const age = cached ? Date.now() - cachedAt(cached) : Number.POSITIVE_INFINITY

  if (cached && age <= freshnessSeconds * 1000) {
    return responseForBrowser(cached, 'HIT', freshnessSeconds)
  }

  const originResponse = await fetchOrigin(request, env)
  if (originResponse.ok) {
    ctx.waitUntil(storePublicResponse(cache, key, originResponse.clone()))
    return responseForBrowser(originResponse, cached ? 'REVALIDATED' : 'MISS', freshnessSeconds)
  }

  if (cached && (originResponse.status >= 500 || originResponse.status === 429)) {
    const stale = responseForBrowser(cached, 'STALE', freshnessSeconds)
    const headers = new Headers(stale.headers)
    headers.set('Warning', '110 - "Response is stale"')
    return new Response(stale.body, { status: stale.status, statusText: stale.statusText, headers })
  }

  return originResponse
}

function pickArticle(payload) {
  if (!payload || typeof payload !== 'object') return null
  return payload.article && typeof payload.article === 'object' ? payload.article : payload
}

function articleField(article, camel, snake, fallback = '') {
  return article?.[camel] ?? article?.[snake] ?? fallback
}

async function spaShell(request, env) {
  const shellUrl = new URL('/index.html', request.url)
  return env.ASSETS.fetch(new Request(shellUrl, { headers: { Accept: 'text/html' } }))
}

function textSetter(value) {
  return { element(element) { element.setInnerContent(value) } }
}

function attributeSetter(name, value) {
  return { element(element) { element.setAttribute(name, value) } }
}

function appendHtml(html) {
  return { element(element) { element.append(html, { html: true }) } }
}

async function transformShell(request, env, options) {
  const shell = await spaShell(request, env)
  if (!shell.ok) return shell

  const title = options.title
  const description = options.description
  const canonical = options.canonical
  const image = options.image || 'https://zongrui.org/og-image.png'
  const robots = options.robots || 'index, follow'
  const lang = options.lang || 'zh-CN'
  const ogLocale = options.ogLocale || 'zh_CN'
  const nonce = crypto.randomUUID().replaceAll('-', '')

  let rewriter = new HTMLRewriter()
    .on('html', attributeSetter('lang', lang))
    .on('title', textSetter(title))
    .on('meta[name="description"]', attributeSetter('content', description))
    .on('meta[name="robots"]', attributeSetter('content', robots))
    .on('link[rel="canonical"]', attributeSetter('href', canonical))
    .on('meta[property="og:title"]', attributeSetter('content', title))
    .on('meta[property="og:description"]', attributeSetter('content', description))
    .on('meta[property="og:url"]', attributeSetter('content', canonical))
    .on('meta[property="og:locale"]', attributeSetter('content', ogLocale))
    .on('meta[property="og:image"]', attributeSetter('content', image))
    .on('meta[name="twitter:title"]', attributeSetter('content', title))
    .on('meta[name="twitter:description"]', attributeSetter('content', description))
    .on('meta[name="twitter:image"]', attributeSetter('content', image))
    .on('script', attributeSetter('nonce', nonce))
    .on('head', appendHtml(`<link rel="alternate" type="application/rss+xml" title="ZongRui Articles" href="${PUBLIC_SITE_ORIGIN}/articles/rss.xml">`))

  if (options.ogType) {
    rewriter = rewriter.on('meta[property="og:type"]', attributeSetter('content', options.ogType))
  }

  if (options.rootHtml) {
    rewriter = rewriter.on('#root', {
      element(element) {
        element.setInnerContent(options.rootHtml, { html: true })
      },
    })
  }

  const additions = []
  if (options.bootstrap) {
    additions.push(`<script nonce="${nonce}" id="__ZR_ARTICLE_DATA__" type="application/json">${safeJson(options.bootstrap)}</script>`)
  }
  if (options.jsonLd) {
    additions.push(`<script nonce="${nonce}" type="application/ld+json">${safeJson(options.jsonLd)}</script>`)
  }
  if (additions.length) rewriter = rewriter.on('body', appendHtml(additions.join('')))

  const transformed = rewriter.transform(shell)
  const headers = new Headers(transformed.headers)
  headers.delete('Content-Length')
  headers.delete('ETag')
  headers.delete('Last-Modified')
  headers.set('Cache-Control', options.cacheControl || PUBLIC_HTML_CACHE_CONTROL)
  headers.set(
    'Content-Security-Policy',
    `default-src 'self'; img-src 'self' data: https://media.zongrui.org; style-src 'self' 'unsafe-inline'; script-src 'self' https://challenges.cloudflare.com 'nonce-${nonce}'; font-src 'self'; connect-src 'self' https://api.zongrui.org https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`,
  )
  headers.set('Permissions-Policy', PAGE_SECURITY_POLICY.permissions)
  headers.set('Referrer-Policy', PAGE_SECURITY_POLICY.referrer)
  headers.set('Strict-Transport-Security', PAGE_SECURITY_POLICY.hsts)
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('X-Frame-Options', 'DENY')
  if (robots.includes('noindex')) headers.set('X-Robots-Tag', robots)

  const responseInit = {
    status: options.status || 200,
    headers,
  }
  if (!options.status) responseInit.statusText = transformed.statusText
  return new Response(transformed.body, responseInit)
}

function articleServerMarkup(article) {
  const title = escapeHtml(articleField(article, 'title', 'title'))
  const summary = escapeHtml(articleField(article, 'summary', 'summary'))
  const content = articleField(article, 'contentHtml', 'content_html')
  const publishedAt = articleField(article, 'publishedAt', 'published_at')
  const readingMinutes = articleField(article, 'readingMinutes', 'reading_minutes')
  const writingMode = articleField(article, 'writingMode', 'writing_mode', 'horizontal')
  const vertical = writingMode === 'vertical-rl'

  return `
    <main class="articles-ssr" id="main-content" data-articles-ssr>
      <header class="article-header">
        <div class="article-header__inner">
          <a class="article-back" href="/articles">← 所有文章</a>
          <p class="articles-kicker">ZONGRUI / ARTICLES</p>
          <h1>${title}</h1>
          ${summary ? `<p class="article-deck">${summary}</p>` : ''}
          <div class="article-byline"><span>ZongRui</span>${readingMinutes ? `<span>${escapeHtml(readingMinutes)} MIN READ</span>` : ''}${publishedAt ? `<time>${escapeHtml(publishedAt)}</time>` : ''}${vertical ? '<span>繁中直排 · 右至左</span>' : ''}</div>
        </div>
      </header>
      <div class="article-layout${vertical ? ' article-layout--vertical' : ''}">
        <article class="article-prose${vertical ? ' article-prose--vertical' : ''}" lang="${vertical ? 'zh-Hant' : 'zh-CN'}">${content}</article>
      </div>
    </main>`
}

async function handleArticlePage(request, env, ctx) {
  const url = new URL(request.url)
  const remainder = url.pathname.slice('/articles'.length).replace(/^\//, '')

  if (!remainder) {
    return transformShell(request, env, {
      title: '文章 — ZongRui',
      description: 'ZongRui 写下的个人介绍、长篇随笔与技术记录。',
      canonical: `${PUBLIC_SITE_ORIGIN}/articles`,
      ogType: 'website',
    })
  }

  if (remainder === 'rss.xml') {
    const apiRequest = new Request(`${url.origin}${API_PREFIX}/v1/rss.xml`, { headers: request.headers })
    return proxyArticlesApi(apiRequest, env, ctx)
  }

  if (remainder === 'console' || remainder.startsWith('console/')) {
    return transformShell(request, env, {
      title: 'Articles Console — ZongRui',
      description: 'ZongRui Articles 管理界面。',
      canonical: `${PUBLIC_SITE_ORIGIN}${url.pathname}`,
      robots: 'noindex, nofollow, noarchive',
      cacheControl: 'private, no-store',
    })
  }

  if (remainder.includes('/')) {
    return transformShell(request, env, {
      title: '页面不存在 — ZongRui',
      description: '没有找到这个页面。',
      canonical: `${PUBLIC_SITE_ORIGIN}${url.pathname}`,
      robots: 'noindex, nofollow',
      status: 404,
      cacheControl: 'no-store',
    })
  }

  let decodedRemainder
  try {
    decodedRemainder = decodeURIComponent(remainder)
  } catch {
    return transformShell(request, env, {
      title: '文章不存在 — ZongRui',
      description: '这篇文章不存在，或者还没有发布。',
      canonical: `${PUBLIC_SITE_ORIGIN}${url.pathname}`,
      robots: 'noindex, nofollow',
      status: 404,
      cacheControl: 'no-store',
    })
  }

  const apiUrl = `${url.origin}${API_PREFIX}/v1/articles/${encodeURIComponent(decodedRemainder)}`
  const articleResponse = await proxyArticlesApi(new Request(apiUrl, { headers: request.headers }), env, ctx)

  if ([301, 302, 307, 308].includes(articleResponse.status)) {
    const location = articleResponse.headers.get('Location')
    if (location) {
      try {
        const redirected = new URL(location, url.origin)
        const apiArticlePrefix = `${API_PREFIX}/v1/articles/`
        if (redirected.origin === url.origin && redirected.pathname.startsWith(apiArticlePrefix)) {
          const redirectedSlug = redirected.pathname.slice(apiArticlePrefix.length)
          return Response.redirect(`${url.origin}/articles/${redirectedSlug}`, 308)
        }
      } catch {
        // Fall through to the upstream redirect when it cannot be normalized.
      }
    }
    return articleResponse
  }

  if (articleResponse.status === 404) {
    return transformShell(request, env, {
      title: '文章不存在 — ZongRui',
      description: '这篇文章不存在，或者还没有发布。',
      canonical: `${PUBLIC_SITE_ORIGIN}${url.pathname}`,
      robots: 'noindex, nofollow',
      status: 404,
      cacheControl: 'no-store',
    })
  }

  if (!articleResponse.ok) {
    return transformShell(request, env, {
      title: '文章服务器暂时离线 — ZongRui',
      description: '文章服务器暂时离线，请稍后再试。',
      canonical: `${PUBLIC_SITE_ORIGIN}${url.pathname}`,
      robots: 'noindex, nofollow',
      status: 503,
      cacheControl: 'no-store',
    })
  }

  let payload
  try {
    payload = await articleResponse.json()
  } catch {
    return jsonError(502, 'invalid_articles_response', '文章服务器返回了无法解析的数据。')
  }

  const article = pickArticle(payload)
  if (!article) return jsonError(502, 'invalid_article', '文章数据不完整。')

  const title = articleField(article, 'title', 'title', '未命名文章')
  const summary = articleField(article, 'summary', 'summary', 'ZongRui 的文章。')
  const slug = articleField(article, 'slug', 'slug', remainder)
  const cover = articleField(article, 'coverUrl', 'cover_url', 'https://zongrui.org/og-image.png')
  const canonical = `${PUBLIC_SITE_ORIGIN}/articles/${encodeURIComponent(slug)}`
  const publishedAt = articleField(article, 'publishedAt', 'published_at')
  const updatedAt = articleField(article, 'updatedAt', 'updated_at', publishedAt)
  const writingMode = articleField(article, 'writingMode', 'writing_mode', 'horizontal')
  const articleLanguage = writingMode === 'vertical-rl' ? 'zh-Hant' : 'zh-CN'
  return transformShell(request, env, {
    title: `${title} — ZongRui`,
    description: summary,
    canonical,
    image: cover,
    ogType: 'article',
    lang: articleLanguage,
    ogLocale: writingMode === 'vertical-rl' ? 'zh_TW' : 'zh_CN',
    rootHtml: articleServerMarkup(article),
    bootstrap: payload,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: title,
      description: summary,
      image: cover ? [cover] : undefined,
      datePublished: publishedAt || undefined,
      dateModified: updatedAt || undefined,
      author: { '@type': 'Person', name: 'ZongRui', url: 'https://zongrui.org/' },
      mainEntityOfPage: canonical,
      inLanguage: articleLanguage,
    },
  })
}

async function handleSitemap(request, env, ctx) {
  const url = new URL(request.url)
  const upstream = await proxyArticlesApi(
    new Request(`${url.origin}${API_PREFIX}/v1/sitemap.xml`, { headers: request.headers }),
    env,
    ctx,
  )
  if (upstream.ok) {
    const body = await upstream.text()
    const homeEntry = `<url><loc>${PUBLIC_SITE_ORIGIN}/</loc></url>`
    const sitemap = body.includes(`<loc>${PUBLIC_SITE_ORIGIN}/</loc>`)
      ? body
      : body.replace(/(<urlset\b[^>]*>)/, `$1${homeEntry}`)
    const headers = new Headers(upstream.headers)
    headers.delete('Content-Encoding')
    headers.delete('Content-Length')
    headers.set('Content-Type', 'application/xml; charset=utf-8')
    return new Response(sitemap, { status: upstream.status, statusText: upstream.statusText, headers })
  }

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://zongrui.org/</loc></url><url><loc>https://zongrui.org/articles</loc></url></urlset>`,
    {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=0, s-maxage=300',
        'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
        'Permissions-Policy': PAGE_SECURITY_POLICY.permissions,
        'Referrer-Policy': PAGE_SECURITY_POLICY.referrer,
        'Strict-Transport-Security': PAGE_SECURITY_POLICY.hsts,
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
      },
    },
  )
}

async function fetchStaticAsset(request, env) {
  const response = await env.ASSETS.fetch(request)
  const url = new URL(request.url)
  const contentType = response.headers.get('Content-Type') ?? ''

  // Pages can serve the SPA shell for a missing file. Never let that HTML
  // fallback be cached under an immutable /assets/* URL as JavaScript or CSS.
  if (url.pathname.startsWith('/assets/') && contentType.toLowerCase().includes('text/html')) {
    return new Response(null, {
      status: 404,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  }

  return response
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)

    if (url.pathname === GITHUB_EXCHANGE_PATH) {
      return handleGithubExchangeRelay(request, env)
    }

    if (url.pathname === API_PREFIX || url.pathname.startsWith(`${API_PREFIX}/`)) {
      return proxyArticlesApi(request, env, ctx)
    }

    if (url.pathname === '/articles' || url.pathname.startsWith('/articles/')) {
      return handleArticlePage(request, env, ctx)
    }

    if (url.pathname === '/sitemap.xml') {
      return handleSitemap(request, env, ctx)
    }

    return fetchStaticAsset(request, env)
  },
}
