import { useState, useCallback } from 'react'

const STORAGE_KEY = 'smart-positioning'

export function useSmartPositioning() {
  const [enabled, setEnabledState] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })

  const setEnabled = useCallback((value: boolean) => {
    setEnabledState(value)
    try {
      localStorage.setItem(STORAGE_KEY, String(value))
    } catch {
      // localStorage unavailable
    }
  }, [])

  return { enabled, setEnabled }
}
