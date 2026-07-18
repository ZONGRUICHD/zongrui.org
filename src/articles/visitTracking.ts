export function trackAfterVisibleDwell(track: () => void, dwellMs = 3_000): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => undefined

  let timer: number | undefined
  let sent = false

  const clearTimer = () => {
    if (timer !== undefined) window.clearTimeout(timer)
    timer = undefined
  }
  const schedule = () => {
    clearTimer()
    if (sent || document.visibilityState !== 'visible') return
    timer = window.setTimeout(() => {
      timer = undefined
      if (sent || document.visibilityState !== 'visible') return
      sent = true
      document.removeEventListener('visibilitychange', schedule)
      track()
    }, dwellMs)
  }

  document.addEventListener('visibilitychange', schedule)
  schedule()

  return () => {
    clearTimer()
    document.removeEventListener('visibilitychange', schedule)
  }
}
