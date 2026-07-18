import { useEffect, useState } from 'react'
import { articleApi } from '../articles/api'
import { trackAfterVisibleDwell } from '../articles/visitTracking'


const numberFormatter = new Intl.NumberFormat('zh-CN')

export function SiteVisitorCounter({ visible = false }: { visible?: boolean }) {
  const [visitorCount, setVisitorCount] = useState<number | null>(null)
  const [statisticsSince, setStatisticsSince] = useState<string | null>(null)
  const [loading, setLoading] = useState(visible)

  useEffect(() => {
    if (!visible) return
    let active = true
    const cleanup = trackAfterVisibleDwell(() => {
      articleApi.recordSiteVisit().then((stats) => {
        if (!active) return
        setVisitorCount(stats.uniqueVisitors)
        setStatisticsSince(stats.since)
      }).catch(() => {
        // Statistics must never block page rendering.
      }).finally(() => {
        if (active) setLoading(false)
      })
    })
    return () => {
      active = false
      cleanup()
    }
  }, [visible])

  if (!visible) return null

  const sinceLabel = statisticsSince
    ? new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit' }).format(new Date(statisticsSince))
    : '2026.07'

  return (
    <section className="site-visitors" aria-labelledby="site-visitors-title">
      <div className="site-visitors__grid" aria-hidden="true" />
      <div className="site-visitors__inner">
        <div className="site-visitors__copy">
          <p className="section-kicker">SITE COUNTER / SINCE {sinceLabel}</p>
          <h2 id="site-visitors-title">有人来过。</h2>
          <p>按公网网络估算；不保存原始 IP，只长期保留分用途加密的去重摘要，直到计数器重置。</p>
        </div>
        <div className="site-visitors__counter" aria-live="polite" aria-busy={loading}>
          <span>{visitorCount === null ? '—' : numberFormatter.format(visitorCount)}</span>
          <small>网络访客估算</small>
        </div>
      </div>
    </section>
  )
}
