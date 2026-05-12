import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import { renderHook, act } from '@testing-library/react'

const mockUpdateServiceWorker = jest.fn<(reloadPage?: boolean) => Promise<void>>()

let mockNeedRefresh: [boolean, (val: boolean) => void]
let mockOfflineReady: [boolean, (val: boolean) => void]

jest.unstable_mockModule('virtual:pwa-register/react', () => ({
  useRegisterSW: jest.fn(() => ({
    needRefresh: mockNeedRefresh,
    offlineReady: mockOfflineReady,
    updateServiceWorker: mockUpdateServiceWorker,
  })),
}))

const { useServiceWorker } = await import('@/hooks/useServiceWorker')

describe('useServiceWorker', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockNeedRefresh = [false, jest.fn()]
    mockOfflineReady = [false, jest.fn()]
  })

  it('returns needRefresh false when no update is available', () => {
    const { result } = renderHook(() => useServiceWorker())
    expect(result.current.needRefresh).toBe(false)
  })

  it('returns needRefresh true when an update is waiting', () => {
    mockNeedRefresh = [true, jest.fn()]
    const { result } = renderHook(() => useServiceWorker())
    expect(result.current.needRefresh).toBe(true)
  })

  it('returns offlineReady false initially', () => {
    const { result } = renderHook(() => useServiceWorker())
    expect(result.current.offlineReady).toBe(false)
  })

  it('returns offlineReady true when SW has cached all assets', () => {
    mockOfflineReady = [true, jest.fn()]
    const { result } = renderHook(() => useServiceWorker())
    expect(result.current.offlineReady).toBe(true)
  })

  it('calls updateServiceWorker(true) when updateSw is invoked', () => {
    mockNeedRefresh = [true, jest.fn()]
    const { result } = renderHook(() => useServiceWorker())
    act(() => {
      result.current.updateSw()
    })
    expect(mockUpdateServiceWorker).toHaveBeenCalledWith(true)
  })
})
