import worker from './_worker.js'

/**
 * Pages Functions uses file-system routing for files under /functions.
 * Keep the implementation in _worker.js, while this catch-all adapts the
 * Pages context and its static-asset fallback to the Worker-style handler.
 */
export function onRequest(context) {
  const env = {
    ...context.env,
    ASSETS: {
      fetch() {
        return context.next()
      },
    },
  }

  return worker.fetch(context.request, env, context)
}
