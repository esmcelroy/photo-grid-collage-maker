import { useState, useCallback, useRef } from 'react'
import { PhotoPosition, CollageSettings } from '@/lib/types'

export interface CollageSnapshot {
  selectedLayoutId: string | null
  photoPositions: PhotoPosition[]
  settings: CollageSettings
}

export function useCollageHistory(maxDepth = 50) {
  const [past, setPast] = useState<CollageSnapshot[]>([])
  const [future, setFuture] = useState<CollageSnapshot[]>([])
  const isRestoringRef = useRef(false)

  const canUndo = past.length > 0
  const canRedo = future.length > 0

  const pushSnapshot = useCallback((snapshot: CollageSnapshot) => {
    if (isRestoringRef.current) return
    setPast(prev => [...prev.slice(-(maxDepth - 1)), snapshot])
    setFuture([])
  }, [maxDepth])

  const undo = useCallback((currentSnapshot: CollageSnapshot): CollageSnapshot | null => {
    if (past.length === 0) return null
    const previous = past[past.length - 1]
    setPast(prev => prev.slice(0, -1))
    setFuture(prev => [...prev, currentSnapshot])
    return previous
  }, [past])

  const redo = useCallback((currentSnapshot: CollageSnapshot): CollageSnapshot | null => {
    if (future.length === 0) return null
    const next = future[future.length - 1]
    setFuture(prev => prev.slice(0, -1))
    setPast(prev => [...prev, currentSnapshot])
    return next
  }, [future])

  const setRestoring = useCallback((value: boolean) => {
    isRestoringRef.current = value
  }, [])

  const clear = useCallback(() => {
    setPast([])
    setFuture([])
  }, [])

  return { canUndo, canRedo, pushSnapshot, undo, redo, setRestoring, clear }
}
