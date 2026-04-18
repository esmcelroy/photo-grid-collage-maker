import { useState, useEffect, useCallback } from 'react'

type Theme = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'theme'

function getStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored
    }
  } catch {
    // localStorage unavailable
  }
  return 'system'
}

function getSystemDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function applyAppearance(isDark: boolean) {
  if (isDark) {
    document.documentElement.setAttribute('data-appearance', 'dark')
  } else {
    document.documentElement.removeAttribute('data-appearance')
  }
}

export function useDarkMode() {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme)
  const [isDark, setIsDark] = useState<boolean>(() => {
    const t = getStoredTheme()
    return t === 'dark' || (t === 'system' && getSystemDark())
  })

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme)
    try {
      localStorage.setItem(STORAGE_KEY, newTheme)
    } catch {
      // localStorage unavailable
    }
  }, [])

  useEffect(() => {
    const resolvedDark = theme === 'dark' || (theme === 'system' && getSystemDark())
    setIsDark(resolvedDark)
    applyAppearance(resolvedDark)

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const handler = (e: MediaQueryListEvent) => {
        setIsDark(e.matches)
        applyAppearance(e.matches)
      }
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }
  }, [theme])

  return { theme, setTheme, isDark }
}
