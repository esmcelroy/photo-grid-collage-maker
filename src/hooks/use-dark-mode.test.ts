import { jest } from '@jest/globals'
import { renderHook, act } from '@testing-library/react'
import { useDarkMode } from './use-dark-mode'

let matchMediaListeners: Map<string, ((e: MediaQueryListEvent) => void)[]>
let matchMediaMatches: boolean

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-appearance')
  matchMediaMatches = false
  matchMediaListeners = new Map()

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: matchMediaMatches,
      media: query,
      addEventListener: jest.fn((event: string, handler: (e: MediaQueryListEvent) => void) => {
        const key = `${query}:${event}`
        if (!matchMediaListeners.has(key)) matchMediaListeners.set(key, [])
        matchMediaListeners.get(key)!.push(handler)
      }),
      removeEventListener: jest.fn((event: string, handler: (e: MediaQueryListEvent) => void) => {
        const key = `${query}:${event}`
        const list = matchMediaListeners.get(key)
        if (list) {
          matchMediaListeners.set(key, list.filter(h => h !== handler))
        }
      }),
    })),
  })
})

describe('useDarkMode', () => {
  it('defaults to system theme when no stored preference', () => {
    const { result } = renderHook(() => useDarkMode())
    expect(result.current.theme).toBe('system')
    expect(result.current.isDark).toBe(false)
  })

  it('respects stored light theme', () => {
    localStorage.setItem('theme', 'light')
    const { result } = renderHook(() => useDarkMode())
    expect(result.current.theme).toBe('light')
    expect(result.current.isDark).toBe(false)
  })

  it('respects stored dark theme', () => {
    localStorage.setItem('theme', 'dark')
    const { result } = renderHook(() => useDarkMode())
    expect(result.current.theme).toBe('dark')
    expect(result.current.isDark).toBe(true)
    expect(document.documentElement.getAttribute('data-appearance')).toBe('dark')
  })

  it('setTheme updates theme and persists to localStorage', () => {
    const { result } = renderHook(() => useDarkMode())
    act(() => result.current.setTheme('dark'))
    expect(result.current.theme).toBe('dark')
    expect(result.current.isDark).toBe(true)
    expect(localStorage.getItem('theme')).toBe('dark')
    expect(document.documentElement.getAttribute('data-appearance')).toBe('dark')
  })

  it('switching to light removes data-appearance', () => {
    localStorage.setItem('theme', 'dark')
    const { result } = renderHook(() => useDarkMode())
    expect(document.documentElement.getAttribute('data-appearance')).toBe('dark')

    act(() => result.current.setTheme('light'))
    expect(result.current.isDark).toBe(false)
    expect(document.documentElement.hasAttribute('data-appearance')).toBe(false)
  })

  it('system theme uses matchMedia result', () => {
    matchMediaMatches = true
    const { result } = renderHook(() => useDarkMode())
    expect(result.current.theme).toBe('system')
    expect(result.current.isDark).toBe(true)
  })

  it('system theme listens for media query changes', () => {
    const { result } = renderHook(() => useDarkMode())
    expect(result.current.isDark).toBe(false)

    const key = '(prefers-color-scheme: dark):change'
    const listeners = matchMediaListeners.get(key) || []
    expect(listeners.length).toBeGreaterThan(0)

    act(() => {
      listeners.forEach(h => h({ matches: true } as MediaQueryListEvent))
    })
    expect(result.current.isDark).toBe(true)
    expect(document.documentElement.getAttribute('data-appearance')).toBe('dark')
  })

  it('cleans up media query listener on theme change', () => {
    const { result } = renderHook(() => useDarkMode())
    const key = '(prefers-color-scheme: dark):change'
    expect(matchMediaListeners.get(key)?.length).toBeGreaterThan(0)

    act(() => result.current.setTheme('dark'))
    // After switching away from system, listener should be removed
    expect(matchMediaListeners.get(key)?.length).toBe(0)
  })

  it('ignores invalid stored values', () => {
    localStorage.setItem('theme', 'invalid-value')
    const { result } = renderHook(() => useDarkMode())
    expect(result.current.theme).toBe('system')
  })

  it('cycles through themes correctly', () => {
    const { result } = renderHook(() => useDarkMode())
    expect(result.current.theme).toBe('system')

    act(() => result.current.setTheme('light'))
    expect(result.current.theme).toBe('light')

    act(() => result.current.setTheme('dark'))
    expect(result.current.theme).toBe('dark')

    act(() => result.current.setTheme('system'))
    expect(result.current.theme).toBe('system')
  })
})
