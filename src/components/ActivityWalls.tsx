import { useEffect, useMemo, useState } from 'react'

export type ActivityDay = {
  date: string
  count: number
  level: number
}

export type ActivityWeek = {
  days: Array<ActivityDay | null>
}

export type ActivityResponse = {
  github: {
    weeks: ActivityWeek[]
    totalContributions: number
    activeDays: number
  }
  codex: {
    days: ActivityDay[]
    totalTurns: number
    activeDays: number
  }
  updatedAt?: string
}

type UnknownRecord = Record<string, unknown>
type WallTone = 'github' | 'codex'

const apiBaseUrl = (import.meta.env.VITE_ACTIVITY_API_URL?.trim() || 'https://api.zongrui.org')
  .replace(/\/+$/, '')

const isRecord = (value: unknown): value is UnknownRecord => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
)

const finiteNumber = (value: unknown) => (
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : undefined
)

function normaliseDay(value: unknown): ActivityDay | null {
  if (!isRecord(value) || typeof value.date !== 'string' || value.date.length === 0) return null

  const count = Math.round(finiteNumber(value.count) ?? 0)
  const fallbackLevel = count === 0 ? 0 : count < 3 ? 1 : count < 7 ? 2 : count < 15 ? 3 : 4
  const level = Math.min(4, Math.max(0, Math.round(finiteNumber(value.level) ?? fallbackLevel)))

  return { date: value.date, count, level }
}

function normaliseActivity(value: unknown): ActivityResponse {
  if (!isRecord(value)) {
    throw new Error('Invalid activity response')
  }

  if (value.github !== null && !isRecord(value.github)) {
    throw new Error('Invalid GitHub activity response')
  }
  if (value.codex !== null && !isRecord(value.codex)) {
    throw new Error('Invalid Codex activity response')
  }

  const github = isRecord(value.github) ? value.github : {}
  const codex = isRecord(value.codex) ? value.codex : {}

  const githubWeeks = (Array.isArray(github.weeks) ? github.weeks : []).map((week) => {
    const days = isRecord(week) && Array.isArray(week.days)
      ? week.days.map(normaliseDay).filter((day): day is ActivityDay => day !== null)
      : []
    return { days }
  }).filter((week) => week.days.length > 0)

  const codexDays = (Array.isArray(codex.days) ? codex.days : [])
    .map(normaliseDay)
    .filter((day): day is ActivityDay => day !== null)
    .sort((left, right) => left.date.localeCompare(right.date))

  const githubDays = githubWeeks
    .flatMap((week) => week.days)
    .filter((day): day is ActivityDay => day !== null)
  const totalContributions = finiteNumber(github.totalContributions)
    ?? githubDays.reduce((sum, day) => sum + day.count, 0)
  const githubActiveDays = finiteNumber(github.activeDays)
    ?? githubDays.filter((day) => day.count > 0).length
  const totalTurns = finiteNumber(codex.totalTurns)
    ?? codexDays.reduce((sum, day) => sum + day.count, 0)
  const codexActiveDays = finiteNumber(codex.activeDays)
    ?? codexDays.filter((day) => day.count > 0).length
  const updatedAt = typeof value.updatedAt === 'string'
    ? value.updatedAt
    : typeof github.updatedAt === 'string'
      ? github.updatedAt
      : typeof codex.updatedAt === 'string'
        ? codex.updatedAt
        : undefined

  return {
    github: {
      weeks: githubWeeks,
      totalContributions: Math.round(totalContributions),
      activeDays: Math.round(githubActiveDays),
    },
    codex: {
      days: codexDays,
      totalTurns: Math.round(totalTurns),
      activeDays: Math.round(codexActiveDays),
    },
    updatedAt,
  }
}

function chunkIntoWeeks(days: ActivityDay[]): ActivityWeek[] {
  if (days.length === 0) return []

  const firstWeekday = new Date(`${days[0].date}T00:00:00Z`).getUTCDay()
  const slots: Array<ActivityDay | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...days,
  ]

  return Array.from({ length: Math.ceil(slots.length / 7) }, (_, index) => ({
    days: slots.slice(index * 7, index * 7 + 7),
  }))
}

function formatDate(date: string) {
  const parsed = new Date(`${date}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return date

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(parsed)
}

function formatUpdatedAt(value?: string) {
  if (!value) return 'LIVE DATA'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'LIVE DATA'

  return `UPDATED ${new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed)}`
}

type ActivityWallProps = {
  tone: WallTone
  title: string
  kicker: string
  description: string
  weeks: ActivityWeek[]
  total: number
  activeDays: number
  totalLabel: string
  countLabel: string
}

function ActivityWall({
  tone,
  title,
  kicker,
  description,
  weeks,
  total,
  activeDays,
  totalLabel,
  countLabel,
}: ActivityWallProps) {
  const dayCount = weeks.reduce(
    (sum, week) => sum + week.days.filter((day) => day !== null).length,
    0,
  )

  return (
    <article className="activity-wall" data-tone={tone} aria-labelledby={`${tone}-wall-title`}>
      <header className="activity-wall__header">
        <div>
          <p>{kicker}</p>
          <h3 id={`${tone}-wall-title`}>{title}</h3>
          <span>{description}</span>
        </div>
        <dl className="activity-wall__stats">
          <div>
            <dt>{totalLabel}</dt>
            <dd>{total.toLocaleString('zh-CN')}</dd>
          </div>
          <div>
            <dt>ACTIVE DAYS</dt>
            <dd>{activeDays.toLocaleString('zh-CN')}</dd>
          </div>
        </dl>
      </header>

      {dayCount === 0 ? (
        <div className="activity-wall__empty" role="status">暂时还没有可展示的活动记录。</div>
      ) : (
        <>
          <div
            className="activity-wall__viewport"
            role="region"
            tabIndex={0}
            aria-label={`${title}，共 ${dayCount} 天记录，可横向滚动查看`}
          >
            <div className="activity-wall__calendar">
              {weeks.map((week, weekIndex) => (
                <div className="activity-wall__week" key={`${tone}-week-${weekIndex}`}>
                  {Array.from({ length: 7 }, (_, dayIndex) => {
                    const day = week.days[dayIndex]
                    if (!day) return <span className="activity-wall__day is-placeholder" aria-hidden="true" key={dayIndex} />

                    const label = `${formatDate(day.date)}：${day.count} ${countLabel}`
                    return (
                      <span
                        className="activity-wall__day"
                        data-level={day.level}
                        role="img"
                        aria-label={label}
                        title={label}
                        key={day.date}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
          <div className="activity-wall__legend" aria-label="颜色越深表示当日活跃度越高">
            <span>LESS</span>
            {[0, 1, 2, 3, 4].map((level) => (
              <i className="activity-wall__day" data-level={level} aria-hidden="true" key={level} />
            ))}
            <span>MORE</span>
          </div>
        </>
      )}
    </article>
  )
}

function ActivitySkeleton() {
  return (
    <div className="activity-walls__skeleton" role="status" aria-live="polite" aria-label="正在加载 GitHub 与 Codex 活动记录">
      {[0, 1].map((wall) => (
        <div className="activity-walls__skeleton-wall" aria-hidden="true" key={wall}>
          <i />
          <b />
          <div>{Array.from({ length: 84 }, (_, index) => <span key={index} />)}</div>
        </div>
      ))}
      <span className="activity-walls__sr-only">正在加载活动记录……</span>
    </div>
  )
}

export function ActivityWalls() {
  const [activity, setActivity] = useState<ActivityResponse | null>(null)
  const [error, setError] = useState(false)
  const [requestVersion, setRequestVersion] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setError(false)

    fetch(`${apiBaseUrl}/api/activity`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`Activity API returned ${response.status}`)
        return response.json() as Promise<unknown>
      })
      .then((payload) => setActivity(normaliseActivity(payload)))
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setActivity(null)
        setError(true)
      })

    return () => controller.abort()
  }, [requestVersion])

  const codexWeeks = useMemo(
    () => chunkIntoWeeks(activity?.codex.days ?? []),
    [activity?.codex.days],
  )

  return (
    <section className="activity-walls" id="activity" aria-labelledby="activity-walls-title">
      <div className="activity-walls__inner">
        <header className="activity-walls__intro">
          <div>
            <p>BUILD LOG / DAILY ACTIVITY</p>
            <h2 id="activity-walls-title">让每一天的<span>构建</span>留下坐标。</h2>
          </div>
          <time dateTime={activity?.updatedAt}>{formatUpdatedAt(activity?.updatedAt)}</time>
        </header>

        {!activity && !error && <ActivitySkeleton />}

        {error && (
          <div className="activity-walls__error" role="alert">
            <div>
              <strong>ACTIVITY FEED OFFLINE</strong>
              <p>活动数据暂时无法读取，请稍后重试。</p>
            </div>
            <button type="button" onClick={() => setRequestVersion((version) => version + 1)}>重新连接</button>
          </div>
        )}

        {activity && (
          <div className="activity-walls__grid">
            <ActivityWall
              tone="github"
              kicker="GITHUB / GREEN WALL"
              title="GitHub Green Wall"
              description="Commit by commit, the archive keeps growing."
              weeks={activity.github.weeks}
              total={activity.github.totalContributions}
              activeDays={activity.github.activeDays}
              totalLabel="CONTRIBUTIONS"
              countLabel="次 GitHub 贡献"
            />
            <ActivityWall
              tone="codex"
              kicker="CODEX / BLUE WALL"
              title="Codex Blue Wall"
              description="仅上传按日聚合次数，不上传任何会话正文。"
              weeks={codexWeeks}
              total={activity.codex.totalTurns}
              activeDays={activity.codex.activeDays}
              totalLabel="CODEX TURNS"
              countLabel="次 Codex 使用"
            />
          </div>
        )}
      </div>
    </section>
  )
}

export default ActivityWalls
