import {
  applyTheme,
  argbFromHex,
  hexFromArgb,
  themeFromSourceColor,
} from '@material/material-color-utilities'

export const MATERIAL_SEED = '#d98aa4'
export const THEME_STORAGE_KEY = 'zongrui-theme-preference'
export const THEME_CHANGE_EVENT = 'zongrui-theme-preference-change'

export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

const materialTheme = themeFromSourceColor(argbFromHex(MATERIAL_SEED))

const surfaceRoleTones = {
  light: {
    'surface-dim': 87,
    'surface-bright': 98,
    'surface-container-lowest': 100,
    'surface-container-low': 96,
    'surface-container': 94,
    'surface-container-high': 92,
    'surface-container-highest': 90,
  },
  dark: {
    'surface-dim': 6,
    'surface-bright': 24,
    'surface-container-lowest': 4,
    'surface-container-low': 10,
    'surface-container': 12,
    'surface-container-high': 17,
    'surface-container-highest': 22,
  },
} as const

export function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark'
}

export function getThemePreference(): ThemePreference {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY)
    return isThemePreference(value) ? value : 'light'
  } catch {
    return 'light'
  }
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference !== 'system') return preference
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyThemePreference(preference: ThemePreference) {
  const resolved = resolveTheme(preference)
  const root = document.documentElement

  // This is the official Material Color Utilities theme generator. It writes
  // the complete --md-sys-color-* token set consumed by Material Web.
  applyTheme(materialTheme, { target: root, dark: resolved === 'dark' })

  // Material Color Utilities 0.4 exposes the official neutral palette but its
  // legacy applyTheme helper predates the newer surface-container role names.
  // Fill those roles from the documented M3 neutral tones rather than inventing
  // ad-hoc colors, so current Material Web components and site surfaces agree.
  Object.entries(surfaceRoleTones[resolved]).forEach(([role, tone]) => {
    root.style.setProperty(`--md-sys-color-${role}`, hexFromArgb(materialTheme.palettes.neutral.tone(tone)))
  })

  root.dataset.theme = resolved
  root.dataset.themePreference = preference
  root.dataset.resolvedTheme = resolved
  root.style.colorScheme = resolved
  root.style.setProperty('--zr-material-seed', MATERIAL_SEED)

  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (themeColor) themeColor.content = MATERIAL_SEED
}

export function saveThemePreference(preference: ThemePreference) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    // Privacy modes can deny storage; the active page still receives the theme.
  }
}

export function initializeMaterialTheme() {
  applyThemePreference(getThemePreference())
}
