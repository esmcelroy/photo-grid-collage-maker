import { describe, expect, it, jest } from '@jest/globals'
import { getStorageEstimate, getStorageSupport, requestPersistentStorage, isQuotaExceededError, type StorageEstimate } from '@/lib/storage'

describe('storage helpers', () => {
  it('does not fail when browser storage APIs are unavailable', async () => {
    const originalStorage = navigator.storage
    Object.defineProperty(navigator, 'storage', { configurable: true, value: undefined })

    await expect(requestPersistentStorage()).resolves.toBe('unavailable')
    expect(getStorageSupport()).toBe('unavailable')

    Object.defineProperty(navigator, 'storage', { configurable: true, value: originalStorage })
  })

  it('reports when persistent storage is denied', async () => {
    const originalStorage = navigator.storage
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { persist: jest.fn<() => Promise<boolean>>().mockResolvedValue(false) },
    })

    await expect(requestPersistentStorage()).resolves.toBe('denied')

    Object.defineProperty(navigator, 'storage', { configurable: true, value: originalStorage })
  })

  it('recognizes quota errors without treating other storage errors as quota failures', () => {
    expect(isQuotaExceededError({ name: 'QuotaExceededError' })).toBe(true)
    expect(isQuotaExceededError({ code: 22 })).toBe(true)
    expect(isQuotaExceededError(new Error('write failed'))).toBe(false)
  })

  it('returns a storage estimate when supported and a safe fallback otherwise', async () => {
    const originalStorage = navigator.storage
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { estimate: jest.fn<() => Promise<StorageEstimate>>().mockResolvedValue({ usage: 25, quota: 100 }) },
    })
    await expect(getStorageEstimate()).resolves.toEqual({ usage: 25, quota: 100 })

    Object.defineProperty(navigator, 'storage', { configurable: true, value: undefined })
    await expect(getStorageEstimate()).resolves.toBeNull()
    Object.defineProperty(navigator, 'storage', { configurable: true, value: originalStorage })
  })
})
