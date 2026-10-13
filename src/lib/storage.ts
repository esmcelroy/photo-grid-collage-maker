export type PersistentStorageStatus = 'granted' | 'denied' | 'unavailable'

export interface StorageEstimate {
  usage: number
  quota: number
}

export function getStorageSupport(): PersistentStorageStatus | 'supported' {
  if (typeof navigator === 'undefined' || !navigator.storage) return 'unavailable'
  return typeof navigator.storage.persist === 'function' ? 'supported' : 'unavailable'
}

export async function requestPersistentStorage(): Promise<PersistentStorageStatus> {
  if (getStorageSupport() !== 'supported') return 'unavailable'

  try {
    return await navigator.storage.persist() ? 'granted' : 'denied'
  } catch {
    return 'denied'
  }
}

export async function getStorageEstimate(): Promise<StorageEstimate | null> {
  if (typeof navigator === 'undefined' || typeof navigator.storage?.estimate !== 'function') return null

  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate()
    return { usage, quota }
  } catch {
    return null
  }
}

export function isQuotaExceededError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { name?: string; code?: number }
  return candidate.name === 'QuotaExceededError' || candidate.code === 22 || candidate.code === 1014
}
