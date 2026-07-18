import assert from 'node:assert/strict'
import test from 'node:test'

import worker from '../functions/_worker.js'
import { onRequest as onPagesRequest } from '../functions/[[path]].js'


const endpoint = 'https://zongrui.org/api/articles/_oauth/github/exchange'
const secret = 's'.repeat(32)
const env = { ARTICLES_ORIGIN_SHARED_SECRET: secret }
const ctx = { waitUntil() {} }

function installTestHtmlRewriter() {
  const previous = globalThis.HTMLRewriter

  class TestHtmlRewriter {
    handlers = []

    on(selector, handler) {
      this.handlers.push([selector, handler])
      return this
    }

    transform(response) {
      const handlers = this.handlers
      const body = new ReadableStream({
        async start(controller) {
          let html = await response.text()
          for (const [selector, handler] of handlers) {
            if (!['title', 'meta[name="robots"]', 'link[rel="canonical"]'].includes(selector)) continue
            const element = {
              setInnerContent(value) {
                if (selector === 'title') html = html.replace(/<title>.*?<\/title>/s, `<title>${value}</title>`)
              },
              setAttribute(name, value) {
                if (selector === 'meta[name="robots"]' && name === 'content') {
                  html = html.replace(/(<meta\s+name="robots"\s+content=")[^"]*("\s*\/?>)/i, `$1${value}$2`)
                }
                if (selector === 'link[rel="canonical"]' && name === 'href') {
                  html = html.replace(/(<link\s+rel="canonical"\s+href=")[^"]*("\s*\/?>)/i, `$1${value}$2`)
                }
              },
            }
            handler.element(element)
          }
          controller.enqueue(new TextEncoder().encode(html))
          controller.close()
        },
      })
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      })
    }
  }

  globalThis.HTMLRewriter = TestHtmlRewriter
  return () => {
    if (previous === undefined) delete globalThis.HTMLRewriter
    else globalThis.HTMLRewriter = previous
  }
}

function shellEnv() {
  return {
    ASSETS: {
      fetch: async () => new Response(
        '<!doctype html><html><head><meta name="robots" content="index, follow"><link rel="canonical" href="https://zongrui.org/"><title>ZongRui</title></head><body><div id="root"></div></body></html>',
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
      ),
    },
  }
}

function relayRequest(overrides = {}, suppliedSecret = secret) {
  return new Request(endpoint, {
    method: 'POST',
    headers: suppliedSecret ? { 'X-ZR-Origin-Token': suppliedSecret } : {},
    body: JSON.stringify({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      code: 'oauth-code',
      redirectUri: 'https://zongrui.org/api/articles/v1/auth/github/callback',
      ...overrides,
    }),
  })
}

test('OAuth relay hides unauthorized requests without contacting GitHub', async () => {
  const originalFetch = globalThis.fetch
  let outboundCalls = 0
  globalThis.fetch = async () => {
    outboundCalls += 1
    throw new Error('unexpected outbound request')
  }
  try {
    const response = await worker.fetch(relayRequest({}, ''), env, ctx)
    assert.equal(response.status, 404)
    assert.equal(outboundCalls, 0)
    assert.match(response.headers.get('Cache-Control') ?? '', /no-store/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('OAuth relay validates the callback URI before contacting GitHub', async () => {
  const originalFetch = globalThis.fetch
  let outboundCalls = 0
  globalThis.fetch = async () => {
    outboundCalls += 1
    throw new Error('unexpected outbound request')
  }
  try {
    const response = await worker.fetch(
      relayRequest({ redirectUri: 'https://attacker.example/callback' }),
      env,
      ctx,
    )
    assert.equal(response.status, 400)
    assert.equal(outboundCalls, 0)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('OAuth relay returns only the verified profile and never the access token', async () => {
  const originalFetch = globalThis.fetch
  const outboundUrls = []
  globalThis.fetch = async (input) => {
    const url = String(input)
    outboundUrls.push(url)
    if (url.includes('/login/oauth/access_token')) {
      return Response.json({ access_token: 'edge-only-token' })
    }
    if (url === 'https://api.github.com/user') {
      return Response.json({
        id: 12345,
        login: 'ZONGRUICHD',
        avatar_url: 'https://example.test/avatar.png',
      })
    }
    throw new Error(`unexpected outbound request: ${url}`)
  }
  try {
    const response = await worker.fetch(relayRequest(), env, ctx)
    const body = await response.json()
    assert.equal(response.status, 200)
    assert.deepEqual(outboundUrls, [
      'https://github.com/login/oauth/access_token',
      'https://api.github.com/user',
    ])
    assert.deepEqual(body, {
      id: 12345,
      login: 'ZONGRUICHD',
      avatarUrl: 'https://example.test/avatar.png',
    })
    assert.equal(JSON.stringify(body).includes('edge-only-token'), false)
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('OAuth relay distinguishes GitHub outages from an invalid authorization code', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => Response.json({ message: 'unavailable' }, { status: 503 })
  try {
    const response = await worker.fetch(relayRequest(), env, ctx)
    const body = await response.json()
    assert.equal(response.status, 502)
    assert.equal(body.error.code, 'github_oauth_unavailable')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('immutable asset paths never return the SPA HTML fallback', async () => {
  const assetEnv = {
    ASSETS: {
      fetch: async () => new Response('<!doctype html><title>ZongRui</title>', {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }),
    },
  }

  const response = await worker.fetch(
    new Request('https://zongrui.org/assets/missing-build-chunk.js'),
    assetEnv,
    ctx,
  )

  assert.equal(response.status, 404)
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff')
  assert.equal(await response.text(), '')
})

test('Pages adapter forwards asset requests through the ASSETS binding', async () => {
  const requestedUrls = []
  const response = await onPagesRequest({
    request: new Request('https://zongrui.org/theme-init.js'),
    env: {
      ASSETS: {
        fetch: async (input) => {
          requestedUrls.push(new Request(input).url)
          return new Response('window.__themeReady = true', {
            headers: { 'Content-Type': 'application/javascript' },
          })
        },
      },
    },
    next() {
      throw new Error('context.next() must not replace the ASSETS binding')
    },
    waitUntil() {},
  })

  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'window.__themeReady = true')
  assert.deepEqual(requestedUrls, ['https://zongrui.org/theme-init.js'])
})

test('legacy article console URLs permanently redirect to the unified console and preserve the query', async () => {
  const cases = [
    ['/articles/console?from=mobile', '/console/articles?from=mobile'],
    ['/articles/console/new?draft=1', '/console/articles/new?draft=1'],
    ['/articles/console/edit/42?revision=3', '/console/articles/edit/42?revision=3'],
    ['/articles/console/comments?status=hidden', '/console/comments?status=hidden'],
  ]

  for (const [legacyPath, expectedPath] of cases) {
    const response = await worker.fetch(new Request(`https://zongrui.org${legacyPath}`), {}, ctx)
    assert.equal(response.status, 308)
    assert.equal(response.headers.get('Location'), `https://zongrui.org${expectedPath}`)
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
    assert.match(response.headers.get('X-Robots-Tag') ?? '', /noindex/)
  }
})

test('unified console deep links return a private noindex SPA shell', async () => {
  const restore = installTestHtmlRewriter()
  try {
    const response = await worker.fetch(
      new Request('https://zongrui.org/console/gallery'),
      shellEnv(),
      ctx,
    )
    const html = await response.text()
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
    assert.match(response.headers.get('X-Robots-Tag') ?? '', /noindex/)
    assert.match(html, /<title>Console — ZongRui<\/title>/)
    assert.match(html, /name="robots" content="noindex, nofollow, noarchive"/)
  } finally {
    restore()
  }
})

test('project and gallery deep links receive route-specific canonical metadata', async () => {
  const restore = installTestHtmlRewriter()
  try {
    const cases = [
      ['/projects', '技术作品 — ZongRui', 'https://zongrui.org/projects'],
      ['/projects/rm-robot-rust', 'RM Robot Rust Control Framework — ZongRui', 'https://zongrui.org/projects/rm-robot-rust'],
      ['/gallery/', '图片 — ZongRui', 'https://zongrui.org/gallery'],
    ]
    for (const [path, title, canonical] of cases) {
      const response = await worker.fetch(new Request(`https://zongrui.org${path}`), shellEnv(), ctx)
      const html = await response.text()
      assert.equal(response.status, 200)
      assert.match(response.headers.get('Cache-Control') ?? '', /s-maxage=300/)
      assert.match(html, new RegExp(`<title>${title}</title>`))
      assert.match(html, new RegExp(`rel="canonical" href="${canonical}"`))
    }
  } finally {
    restore()
  }
})

test('unknown project and nested gallery paths return true noindex 404 shells', async () => {
  const restore = installTestHtmlRewriter()
  try {
    for (const path of ['/projects/not-a-project', '/gallery/not-a-photo']) {
      const response = await worker.fetch(new Request(`https://zongrui.org${path}`), shellEnv(), ctx)
      const html = await response.text()
      assert.equal(response.status, 404)
      assert.equal(response.headers.get('Cache-Control'), 'no-store')
      assert.match(response.headers.get('X-Robots-Tag') ?? '', /noindex/)
      assert.match(html, /页面不存在 — ZongRui/)
    }
  } finally {
    restore()
  }
})

test('dynamic sitemap includes every public static route without indexing console pages', async () => {
  const originalFetch = globalThis.fetch
  const originalCaches = globalThis.caches
  const stored = new Map()
  const pending = []
  globalThis.caches = {
    default: {
      async match(request) {
        return stored.get(new Request(request).url)?.clone()
      },
      async put(request, response) {
        stored.set(new Request(request).url, response.clone())
      },
    },
  }
  globalThis.fetch = async (input) => {
    assert.equal(new Request(input).url, 'http://127.0.0.1:18232/v1/sitemap.xml')
    return new Response(
      '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://zongrui.org/articles/example</loc></url></urlset>',
      { headers: { 'Content-Type': 'application/xml' } },
    )
  }

  try {
    const response = await worker.fetch(
      new Request('https://zongrui.org/sitemap.xml'),
      { ARTICLES_ORIGIN_URL: 'http://127.0.0.1:18232' },
      { waitUntil(promise) { pending.push(promise) } },
    )
    const xml = await response.text()
    assert.equal(response.status, 200)
    for (const path of [
      '/',
      '/articles',
      '/projects',
      '/projects/rm-robot-rust',
      '/projects/arista-switch-dashboard',
      '/gallery',
    ]) {
      assert.match(xml, new RegExp(`<loc>https://zongrui\\.org${path.replaceAll('/', '\\/')}</loc>`))
    }
    assert.doesNotMatch(xml, /\/console/)
    await Promise.all(pending)
  } finally {
    globalThis.fetch = originalFetch
    if (originalCaches === undefined) delete globalThis.caches
    else globalThis.caches = originalCaches
  }
})

test('public article lists with query parameters use the edge cache', async () => {
  const originalFetch = globalThis.fetch
  const originalCaches = globalThis.caches
  const stored = new Map()
  const pending = []
  let originCalls = 0

  globalThis.caches = {
    default: {
      async match(request) {
        return stored.get(new Request(request).url)?.clone()
      },
      async put(request, response) {
        stored.set(new Request(request).url, response.clone())
      },
      async delete(request) {
        return stored.delete(new Request(request).url)
      },
    },
  }
  globalThis.fetch = async (input) => {
    originCalls += 1
    assert.equal(new Request(input).url, 'http://127.0.0.1:18232/v1/articles?limit=12&tag=rust')
    return Response.json({ items: [{ slug: 'cached-post' }] })
  }

  const cacheCtx = { waitUntil(promise) { pending.push(promise) } }
  const request = new Request('https://zongrui.org/api/articles/v1/articles?limit=12&tag=rust')
  const cacheEnv = { ARTICLES_ORIGIN_URL: 'http://127.0.0.1:18232' }

  try {
    const miss = await worker.fetch(request, cacheEnv, cacheCtx)
    assert.equal(miss.status, 200)
    assert.equal(miss.headers.get('X-ZR-Edge-Cache'), 'MISS')
    assert.match(miss.headers.get('Cache-Control') ?? '', /s-maxage=60/)
    await Promise.all(pending.splice(0))

    const hit = await worker.fetch(request, cacheEnv, cacheCtx)
    assert.equal(hit.status, 200)
    assert.equal(hit.headers.get('X-ZR-Edge-Cache'), 'HIT')
    assert.equal(originCalls, 1)
    assert.deepEqual(await hit.json(), { items: [{ slug: 'cached-post' }] })
  } finally {
    globalThis.fetch = originalFetch
    if (originalCaches === undefined) delete globalThis.caches
    else globalThis.caches = originalCaches
  }
})

test('public gallery pages use the same stale-capable edge cache', async () => {
  const originalFetch = globalThis.fetch
  const originalCaches = globalThis.caches
  const stored = new Map()
  const pending = []
  let originCalls = 0

  globalThis.caches = {
    default: {
      async match(request) {
        return stored.get(new Request(request).url)?.clone()
      },
      async put(request, response) {
        stored.set(new Request(request).url, response.clone())
      },
    },
  }
  globalThis.fetch = async (input) => {
    originCalls += 1
    assert.equal(new Request(input).url, 'http://127.0.0.1:18232/v1/gallery?limit=24')
    return Response.json({ items: [{ id: 'photo-1' }], nextCursor: null })
  }

  const cacheCtx = { waitUntil(promise) { pending.push(promise) } }
  const request = new Request('https://zongrui.org/api/articles/v1/gallery?limit=24')
  const cacheEnv = { ARTICLES_ORIGIN_URL: 'http://127.0.0.1:18232' }

  try {
    const miss = await worker.fetch(request, cacheEnv, cacheCtx)
    assert.equal(miss.status, 200)
    assert.equal(miss.headers.get('X-ZR-Edge-Cache'), 'MISS')
    assert.match(miss.headers.get('Cache-Control') ?? '', /s-maxage=60/)
    await Promise.all(pending.splice(0))

    const hit = await worker.fetch(request, cacheEnv, cacheCtx)
    assert.equal(hit.headers.get('X-ZR-Edge-Cache'), 'HIT')
    assert.equal(originCalls, 1)
    assert.deepEqual(await hit.json(), { items: [{ id: 'photo-1' }], nextCursor: null })
  } finally {
    globalThis.fetch = originalFetch
    if (originalCaches === undefined) delete globalThis.caches
    else globalThis.caches = originalCaches
  }
})

test('article writes invalidate every cached list query through a new cache generation', async () => {
  const originalFetch = globalThis.fetch
  const originalCaches = globalThis.caches
  const stored = new Map()
  const pending = []
  let listCalls = 0

  globalThis.caches = {
    default: {
      async match(request) {
        return stored.get(new Request(request).url)?.clone()
      },
      async put(request, response) {
        stored.set(new Request(request).url, response.clone())
      },
      async delete(request) {
        return stored.delete(new Request(request).url)
      },
    },
  }
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init)
    if (request.method === 'POST') {
      assert.equal(request.url, 'http://127.0.0.1:18232/v1/admin/articles/1/publish')
      return new Response(null, {
        status: 204,
        headers: { 'X-ZR-Cache-Invalidate': '/v1/articles,/v1/articles/cached-post' },
      })
    }

    assert.equal(request.url, 'http://127.0.0.1:18232/v1/articles?limit=12&tag=rust')
    listCalls += 1
    return Response.json({ items: [{ slug: `cached-post-${listCalls}` }] })
  }

  const cacheCtx = { waitUntil(promise) { pending.push(promise) } }
  const cacheEnv = { ARTICLES_ORIGIN_URL: 'http://127.0.0.1:18232' }
  const listRequest = new Request('https://zongrui.org/api/articles/v1/articles?limit=12&tag=rust')

  try {
    const initialMiss = await worker.fetch(listRequest, cacheEnv, cacheCtx)
    assert.equal(initialMiss.headers.get('X-ZR-Edge-Cache'), 'MISS')
    await Promise.all(pending.splice(0))

    const initialHit = await worker.fetch(listRequest, cacheEnv, cacheCtx)
    assert.equal(initialHit.headers.get('X-ZR-Edge-Cache'), 'HIT')
    assert.equal(listCalls, 1)

    const mutation = await worker.fetch(
      new Request('https://zongrui.org/api/articles/v1/admin/articles/1/publish', { method: 'POST' }),
      cacheEnv,
      cacheCtx,
    )
    assert.equal(mutation.status, 204)

    const invalidatedMiss = await worker.fetch(listRequest, cacheEnv, cacheCtx)
    assert.equal(invalidatedMiss.headers.get('X-ZR-Edge-Cache'), 'MISS')
    assert.equal(listCalls, 2)
    assert.deepEqual(await invalidatedMiss.json(), { items: [{ slug: 'cached-post-2' }] })
  } finally {
    globalThis.fetch = originalFetch
    if (originalCaches === undefined) delete globalThis.caches
    else globalThis.caches = originalCaches
  }
})
