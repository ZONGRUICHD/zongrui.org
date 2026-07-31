import { useEffect, useState } from 'react'

const VISUAL_STYLE_STORAGE_KEY = 'zongrui-visual-style'
const VISUAL_STYLE_CHANGE_EVENT = 'zongrui-visual-style-change'

export type VisualStyle = 'f1' | 'classic'

function isVisualStyle(value: string | null): value is VisualStyle {
  return value === 'f1' || value === 'classic'
}

export function getVisualStyle(): VisualStyle {
  try {
    const value = window.localStorage.getItem(VISUAL_STYLE_STORAGE_KEY)
    return isVisualStyle(value) ? value : 'f1'
  } catch {
    return 'f1'
  }
}

export function applyVisualStyle(style: VisualStyle) {
  document.documentElement.dataset.uiStyle = style
}

function saveVisualStyle(style: VisualStyle) {
  try {
    window.localStorage.setItem(VISUAL_STYLE_STORAGE_KEY, style)
  } catch {
    // The current document still receives the selected visual style.
  }
}

type VisualStyleSwitcherProps = {
  className?: string
}

export function VisualStyleSwitcher({ className = '' }: VisualStyleSwitcherProps) {
  const [style, setStyle] = useState<VisualStyle>(getVisualStyle)

  useEffect(() => {
    const syncStyle = (event: Event) => {
      const eventStyle = event instanceof CustomEvent && isVisualStyle(event.detail) ? event.detail : null
      const nextStyle = eventStyle ?? getVisualStyle()
      setStyle(nextStyle)
      applyVisualStyle(nextStyle)
    }

    window.addEventListener('storage', syncStyle)
    window.addEventListener(VISUAL_STYLE_CHANGE_EVENT, syncStyle)
    return () => {
      window.removeEventListener('storage', syncStyle)
      window.removeEventListener(VISUAL_STYLE_CHANGE_EVENT, syncStyle)
    }
  }, [])

  const selectStyle = (nextStyle: VisualStyle) => {
    saveVisualStyle(nextStyle)
    setStyle(nextStyle)
    applyVisualStyle(nextStyle)
    window.dispatchEvent(new CustomEvent(VISUAL_STYLE_CHANGE_EVENT, { detail: nextStyle }))
  }

  return (
    <div className={`visual-style-switcher${className ? ` ${className}` : ''}`} role="group" aria-label="视觉风格">
      <button
        className={style === 'f1' ? 'is-active' : undefined}
        type="button"
        aria-pressed={style === 'f1'}
        onClick={() => selectStyle('f1')}
      >
        <span aria-hidden="true">01</span>
        F1
      </button>
      <button
        className={style === 'classic' ? 'is-active' : undefined}
        type="button"
        aria-pressed={style === 'classic'}
        onClick={() => selectStyle('classic')}
      >
        <span aria-hidden="true">02</span>
        原主题
      </button>
    </div>
  )
}
