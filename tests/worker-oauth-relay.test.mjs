import assert from 'node:assert/strict'
import test from 'node:test'

import worker from '../functions/_worker.js'
import { onRequest as onPagesRequest } from '../functions/[[path]].js'


const endpoint = 'https://zongrui.org/api/articles/_oauth/github/exchange'
const secret = 's'.repeat(32)
const env = { ARTICLES_ORIGIN_SHARED_SECRET: secret }
const ctx = { waitUntil() {} }

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
