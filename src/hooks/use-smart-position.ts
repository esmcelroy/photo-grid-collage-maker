import { useState, useCallback } from 'react'

const STORAGE_KEY = 'smart-positioning'
const DETECTION_MODE_KEY = 'detection-mode'

export type DetectionMode = 'basic' | 'standard' | 'advanced'

export function useSmartPositioning() {
  const [enabled, setEnabledState] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })

  const [detectionMode, setDetectionModeState] = useState<DetectionMode>(() => {
    try {
      const stored = localStorage.getItem(DETECTION_MODE_KEY)
      if (stored === 'basic' || stored === 'standard' || stored === 'advanced') return stored
      return 'basic'
    } catch {
      return 'basic'
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

  const setDetectionMode = useCallback((mode: DetectionMode) => {
    setDetectionModeState(mode)
    try {
      localStorage.setItem(DETECTION_MODE_KEY, mode)
    } catch {
      // localStorage unavailable
    }
  }, [])

  return { enabled, setEnabled, detectionMode, setDetectionMode }
}
