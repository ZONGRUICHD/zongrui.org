import { useEffect, useState } from 'react'
import { MaterialIconButton } from '../material/MaterialControls'
import {
  applyThemePreference,
  getThemePreference,
  isThemePreference,
  saveThemePreference,
  THEME_CHANGE_EVENT,
  type ThemePreference,
} from '../material/theme'

const preferences: ReadonlyArray<{ value: ThemePreference; label: string }> = [
  { value: 'light', label: '浅色主题' },
  { value: 'system', label: '跟随系统' },
  { value: 'dark', label: '深色主题' },
]

function ThemeIcon({ preference }: { preference: ThemePreference }) {
  if (preference === 'light') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.5" /><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" /></svg>
  }
  if (preference === 'dark') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.4 15.2A8.5 8.5 0 0 1 8.8 3.6 8.7 8.7 0 1 0 20.4 15.2Z" /></svg>
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
}

type ThemeSwitcherProps = {
  className?: string
}

export function ThemeSwitcher({ className = '' }: ThemeSwitcherProps) {
  const [preference, setPreference] = useState<ThemePreference>(getThemePreference)

  useEffect(() => {
    const syncPreference = (event: Event) => {
      const eventPreference = event instanceof CustomEvent && isThemePreference(event.detail) ? event.detail : null
      const nextPreference = eventPreference ?? getThemePreference()
      setPreference(nextPreference)
      applyThemePreference(nextPreference)
    }
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    const syncSystemTheme = () => {
      if (getThemePreference() === 'system') applyThemePreference('system')
    }

    window.addEventListener('storage', syncPreference)
    window.addEventListener(THEME_CHANGE_EVENT, syncPreference)
    media?.addEventListener('change', syncSystemTheme)
    return () => {
      window.removeEventListener('storage', syncPreference)
      window.removeEventListener(THEME_CHANGE_EVENT, syncPreference)
      media?.removeEventListener('change', syncSystemTheme)
    }
  }, [])

  const selectPreference = (nextPreference: ThemePreference) => {
    saveThemePreference(nextPreference)
    setPreference(nextPreference)
    applyThemePreference(nextPreference)
    window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: nextPreference }))
  }

  return (
    <div className={`theme-switcher${className ? ` ${className}` : ''}`} role="group" aria-label="界面主题">
      {preferences.map(({ value, label }) => (
        <MaterialIconButton
          className={`theme-switcher__option${preference === value ? ' is-active' : ''}`}
          tonal
          toggle
          selected={preference === value}
          type="button"
          key={value}
          aria-pressed={preference === value}
          aria-label={label}
          title={label}
          onClick={() => selectPreference(value)}
        >
          <ThemeIcon preference={value} />
        </MaterialIconButton>
      ))}
    </div>
  )
}
