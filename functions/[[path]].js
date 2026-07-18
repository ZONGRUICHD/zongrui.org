import worker from './_worker.js'

/**
 * Pages Functions uses file-system routing for files under /functions.
 * Keep the implementation in _worker.js, while this catch-all adapts the
 * Pages context and its static-asset fallback to the Worker-style handler.
 */
export function onRequest(context) {
  const env = {
    ARTICLES_ORIGIN_URL: context.env.ARTICLES_ORIGIN_URL,
    ARTICLES_ORIGIN_SHARED_SECRET: context.env.ARTICLES_ORIGIN_SHARED_SECRET,
    CF_ACCESS_CLIENT_ID: context.env.CF_ACCESS_CLIENT_ID,
    CF_ACCESS_CLIENT_SECRET: context.env.CF_ACCESS_CLIENT_SECRET,
    ASSETS: context.env.ASSETS,
  }

  return worker.fetch(context.request, env, context)
}
