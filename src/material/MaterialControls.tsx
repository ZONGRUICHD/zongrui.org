import {
  createElement,
  forwardRef,
  useEffect,
  useRef,
  type CSSProperties,
  type MouseEventHandler,
  type ReactNode,
} from 'react'

type MaterialButtonVariant = 'filled' | 'tonal' | 'outlined' | 'text'

type MaterialButtonProps = {
  variant?: MaterialButtonVariant
  children: ReactNode
  className?: string
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
  href?: string
  target?: string
  rel?: string
  title?: string
  name?: string
  value?: string
  style?: CSSProperties
  onClick?: MouseEventHandler<HTMLElement>
  'aria-label'?: string
  'aria-pressed'?: boolean
  'aria-expanded'?: boolean
  'aria-controls'?: string
}

const buttonTags: Record<MaterialButtonVariant, string> = {
  filled: 'md-filled-button',
  tonal: 'md-filled-tonal-button',
  outlined: 'md-outlined-button',
  text: 'md-text-button',
}

export const MaterialButton = forwardRef<HTMLElement, MaterialButtonProps>(function MaterialButton(
  { variant = 'filled', children, ...props },
  ref,
) {
  return createElement(buttonTags[variant], { ...props, ref }, children)
})

type MaterialIconButtonProps = {
  children: ReactNode
  className?: string
  disabled?: boolean
  selected?: boolean
  toggle?: boolean
  tonal?: boolean
  type?: 'button' | 'submit' | 'reset'
  href?: string
  target?: string
  title?: string
  onClick?: MouseEventHandler<HTMLElement>
  'aria-label': string
  'aria-pressed'?: boolean
  'aria-expanded'?: boolean
  'aria-controls'?: string
}

export const MaterialIconButton = forwardRef<HTMLElement, MaterialIconButtonProps>(function MaterialIconButton(
  { tonal = false, children, ...props },
  ref,
) {
  return createElement(tonal ? 'md-filled-tonal-icon-button' : 'md-icon-button', { ...props, ref }, children)
})

type MaterialTextFieldElement = HTMLElement & {
  value: string
  updateComplete?: Promise<unknown>
}

type MaterialTextFieldProps = {
  id?: string
  className?: string
  label: string
  value: string
  name?: string
  type?: 'email' | 'number' | 'password' | 'search' | 'tel' | 'text' | 'url'
  placeholder?: string
  supportingText?: string
  autoComplete?: string
  minLength?: number
  maxLength?: number
  rows?: number
  textarea?: boolean
  required?: boolean
  disabled?: boolean
  onValueChange: (value: string) => void
}

export function MaterialTextField({ onValueChange, value, ...props }: MaterialTextFieldProps) {
  const elementRef = useRef<MaterialTextFieldElement>(null)
  const callbackRef = useRef(onValueChange)
  callbackRef.current = onValueChange

  useEffect(() => {
    const element = elementRef.current
    if (!element) return
    let disposed = false
    let input: HTMLInputElement | HTMLTextAreaElement | null = null
    const syncFromHost = () => callbackRef.current(element.value)
    const syncFromInput = (event: Event) => {
      callbackRef.current((event.currentTarget as HTMLInputElement | HTMLTextAreaElement).value)
    }

    element.addEventListener('change', syncFromHost)
    void Promise.resolve(element.updateComplete).then(() => {
      if (disposed) return
      input = element.shadowRoot?.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea') ?? null
      input?.addEventListener('input', syncFromInput)
    })

    return () => {
      disposed = true
      element.removeEventListener('change', syncFromHost)
      input?.removeEventListener('input', syncFromInput)
    }
  }, [])

  useEffect(() => {
    const element = elementRef.current
    if (!element) return
    let disposed = false
    void Promise.resolve(element.updateComplete).then(() => {
      if (!disposed && element.value !== value) element.value = value
    })
    return () => { disposed = true }
  }, [value])

  return createElement('md-outlined-text-field', { ...props, ref: elementRef })
}

type MaterialSelectOption = { value: string; label: string }

type MaterialSelectElement = MaterialTextFieldElement & {
  select: (value: string) => void
}

type MaterialSelectOptionElement = HTMLElement & {
  headline: string
  selected: boolean
  value: string
  updateComplete?: Promise<unknown>
}

function MaterialSelectOptionItem({ option, selected }: { option: MaterialSelectOption; selected: boolean }) {
  const attach = (element: MaterialSelectOptionElement | null) => {
    if (!element) return
    element.setAttribute('value', option.value)
    element.setAttribute('headline', option.label)
    if (selected) element.setAttribute('selected', '')
    else element.removeAttribute('selected')
    element.value = option.value
    element.headline = option.label
    element.selected = selected
  }
  return createElement('md-select-option', { ref: attach }, option.label)
}

type MaterialSelectProps = {
  id?: string
  className?: string
  label: string
  value: string
  options: MaterialSelectOption[]
  onValueChange: (value: string) => void
}

export function MaterialSelect({ options, onValueChange, value, ...props }: MaterialSelectProps) {
  const elementRef = useRef<MaterialSelectElement>(null)
  const callbackRef = useRef(onValueChange)
  callbackRef.current = onValueChange

  useEffect(() => {
    const element = elementRef.current
    if (!element) return
    const handleChange = () => callbackRef.current(element.value)
    element.addEventListener('change', handleChange)
    return () => element.removeEventListener('change', handleChange)
  }, [value])

  useEffect(() => {
    const element = elementRef.current
    if (!element) return
    let disposed = false
    let frame = 0
    let attempts = 0
    const optionElements = Array.from(element.querySelectorAll<MaterialSelectOptionElement>('md-select-option'))

    const synchronizeSelection = () => {
      if (disposed) return
      const option = optionElements.find((item) => item.value === value)
      if (option) {
        option.selected = true
        element.select(value)
      }
      if (element.value !== value && attempts < 6) {
        attempts += 1
        frame = window.requestAnimationFrame(synchronizeSelection)
      }
    }

    void Promise.all([
      Promise.resolve(element.updateComplete),
      ...optionElements.map((option) => Promise.resolve(option.updateComplete)),
    ]).then(() => {
      if (!disposed) frame = window.requestAnimationFrame(synchronizeSelection)
    })

    return () => {
      disposed = true
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [value])

  return createElement(
    'md-outlined-select',
    { ...props, ref: elementRef, key: value || 'material-select-empty' },
    options.map((option) => createElement(MaterialSelectOptionItem, {
      key: option.value,
      option,
      selected: option.value === value,
    })),
  )
}

type MaterialFilterChipProps = {
  label: string
  selected?: boolean
  disabled?: boolean
  onClick?: MouseEventHandler<HTMLElement>
}

export function MaterialFilterChip(props: MaterialFilterChipProps) {
  return createElement('md-filter-chip', props)
}
