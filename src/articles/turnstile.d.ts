export {}

declare global {
  interface Window {
    turnstile?: {
      render: (target: HTMLElement, options: {
        sitekey: string
        action?: string
        theme?: 'light' | 'dark' | 'auto'
        size?: 'normal' | 'compact' | 'flexible'
        callback: (token: string) => void
        'expired-callback'?: () => void
        'error-callback'?: () => void
      }) => string
      reset: (widgetId?: string) => void
    }
  }
}
