import { describe, it, expect, beforeEach } from '@jest/globals'
import { renderHook, act } from '@testing-library/react'
import { useSmartPositioning } from '@/hooks/use-smart-position'

describe('useSmartPositioning', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns enabled=false by default', () => {
    const { result } = renderHook(() => useSmartPositioning())
    expect(result.current.enabled).toBe(false)
  })

  it('returns detectionMode=basic by default', () => {
    const { result } = renderHook(() => useSmartPositioning())
    expect(result.current.detectionMode).toBe('basic')
  })

  it('persists detectionMode to localStorage', () => {
    const { result } = renderHook(() => useSmartPositioning())

    act(() => {
      result.current.setDetectionMode('standard')
    })

    expect(result.current.detectionMode).toBe('standard')
    expect(localStorage.getItem('detection-mode')).toBe('standard')
  })

  it('reads detectionMode from localStorage on mount', () => {
    localStorage.setItem('detection-mode', 'standard')

    const { result } = renderHook(() => useSmartPositioning())
    expect(result.current.detectionMode).toBe('standard')
  })

  it('ignores invalid values in localStorage', () => {
    localStorage.setItem('detection-mode', 'invalid-mode')

    const { result } = renderHook(() => useSmartPositioning())
    expect(result.current.detectionMode).toBe('basic')
  })

  it('setDetectionMode updates state and localStorage', () => {
    const { result } = renderHook(() => useSmartPositioning())

    act(() => {
      result.current.setDetectionMode('advanced')
    })

    expect(result.current.detectionMode).toBe('advanced')
    expect(localStorage.getItem('detection-mode')).toBe('advanced')
  })
})
