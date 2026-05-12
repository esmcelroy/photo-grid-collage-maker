import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { renderHook, act } from '@testing-library/react'
import { usePwaInstall } from '@/hooks/usePwaInstall'

describe('usePwaInstall', () => {
  let originalUserAgent: string

  beforeEach(() => {
    originalUserAgent = navigator.userAgent
    // Default: not standalone
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: jest.fn().mockReturnValue({
        matches: false,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      }),
    })
  })

  afterEach(() => {
    Object.defineProperty(navigator, 'userAgent', {
      writable: true,
      configurable: true,
      value: originalUserAgent,
    })
  })

  it('starts with canInstall false when no beforeinstallprompt has fired', () => {
    const { result } = renderHook(() => usePwaInstall())
    expect(result.current.canInstall).toBe(false)
  })

  it('sets canInstall true when beforeinstallprompt fires', () => {
    const { result } = renderHook(() => usePwaInstall())

    act(() => {
      const event = new Event('beforeinstallprompt') as any
      event.preventDefault = jest.fn()
      event.prompt = jest.fn().mockResolvedValue(undefined as never)
      event.userChoice = Promise.resolve({ outcome: 'accepted', platform: '' })
      window.dispatchEvent(event)
    })

    expect(result.current.canInstall).toBe(true)
  })

  it('triggerInstall calls prompt on the deferred event', async () => {
    const mockPrompt = jest.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const { result } = renderHook(() => usePwaInstall())

    act(() => {
      const event = new Event('beforeinstallprompt') as any
      event.preventDefault = jest.fn()
      event.prompt = mockPrompt
      event.userChoice = Promise.resolve({ outcome: 'accepted', platform: '' })
      window.dispatchEvent(event)
    })

    await act(async () => {
      await result.current.triggerInstall()
    })

    expect(mockPrompt).toHaveBeenCalled()
  })

  it('sets canInstall false after appinstalled event', () => {
    const { result } = renderHook(() => usePwaInstall())

    act(() => {
      const event = new Event('beforeinstallprompt') as any
      event.preventDefault = jest.fn()
      event.prompt = jest.fn().mockResolvedValue(undefined as never)
      event.userChoice = Promise.resolve({ outcome: 'accepted', platform: '' })
      window.dispatchEvent(event)
    })

    expect(result.current.canInstall).toBe(true)

    act(() => {
      window.dispatchEvent(new Event('appinstalled'))
    })

    expect(result.current.canInstall).toBe(false)
  })

  it('returns isStandalone true when display-mode is standalone', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: jest.fn().mockReturnValue({
        matches: true,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      }),
    })

    const { result } = renderHook(() => usePwaInstall())
    expect(result.current.isStandalone).toBe(true)
  })

  it('returns isIos true on iOS Safari when not standalone', () => {
    Object.defineProperty(navigator, 'userAgent', {
      writable: true,
      configurable: true,
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    })

    const { result } = renderHook(() => usePwaInstall())
    expect(result.current.isIos).toBe(true)
  })

  it('returns isIos false on non-iOS browsers', () => {
    Object.defineProperty(navigator, 'userAgent', {
      writable: true,
      configurable: true,
      value: 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/114.0.0.0 Mobile Safari/537.36',
    })

    const { result } = renderHook(() => usePwaInstall())
    expect(result.current.isIos).toBe(false)
  })

  it('cleans up event listeners on unmount', () => {
    const addSpy = jest.spyOn(window, 'addEventListener')
    const removeSpy = jest.spyOn(window, 'removeEventListener')

    const { unmount } = renderHook(() => usePwaInstall())

    expect(addSpy).toHaveBeenCalledWith('beforeinstallprompt', expect.any(Function))
    expect(addSpy).toHaveBeenCalledWith('appinstalled', expect.any(Function))

    unmount()

    expect(removeSpy).toHaveBeenCalledWith('beforeinstallprompt', expect.any(Function))
    expect(removeSpy).toHaveBeenCalledWith('appinstalled', expect.any(Function))

    addSpy.mockRestore()
    removeSpy.mockRestore()
  })
})
