import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useCollageApi } from '@/hooks/useCollageApi'
import { UploadedPhoto, PhotoPosition, GridLayout, CollageSettings, ExportOptions, MAX_PHOTOS } from '@/lib/types'
import { getLayoutsForPhotoCount, getUniqueAreaNames } from '@/lib/layouts'
import { correctExifOrientation, generateUniqueId, downloadCollage } from '@/lib/image-utils'
import { processFilesForHeic } from '@/lib/heic-utils'
import { UploadZone } from '@/components/UploadZone'
import { PhotoThumbnail } from '@/components/PhotoThumbnail'
import { LayoutGallery } from '@/components/LayoutGallery'
import { CollagePreview } from '@/components/CollagePreview'
import { CustomizationControls } from '@/components/CustomizationControls'
import { PresetGallery } from '@/components/PresetGallery'
import { ExportDialog } from '@/components/ExportDialog'
import { PhotoEditDialog } from '@/components/PhotoEditDialog'
import { ArrangementCarousel } from '@/components/ArrangementCarousel'
import { ComparePanel } from '@/components/ComparePanel'
import { AppFooter } from '@/components/AppFooter'
import { InstallButton } from '@/components/InstallButton'
import { OfflineBanner } from '@/components/OfflineBanner'
import { UpdateToast } from '@/components/UpdateToast'
import { ProjectLibrary } from '@/components/ProjectLibrary'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Toaster } from '@/components/ui/sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Trash, Sparkle, ArrowCounterClockwise, ArrowClockwise, UploadSimple, Sliders, GridFour, DownloadSimple, Sun, Moon, Monitor, MagicWand } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { useCollageHistory, CollageSnapshot } from '@/hooks/use-collage-history'
import { useDarkMode } from '@/hooks/use-dark-mode'
import { useSmartPositioning } from '@/hooks/use-smart-position'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { useServiceWorker } from '@/hooks/useServiceWorker'
import { analyzePhotoWithCache, calculateSmartPosition, getCachedAnalysis, clearAnalysisCache, setAnalysisDetectionMode } from '@/lib/face-detection'
import { rankLayouts, suggestPhotoArrangement } from '@/lib/layout-scoring'
import type { PhotoCharacteristics } from '@/lib/layout-scoring'
import type { DominantColor } from '@/lib/color-intelligence'
import { initMLWorker, disposeMLWorker, getWorkerStatus, onWorkerStatusChange, hasNativeFaceDetector } from '@/lib/ml-worker-client'
import type { WorkerStatus } from '@/lib/ml-worker-client'
import { cn } from '@/lib/utils'
import { getStorageEstimate, isQuotaExceededError, requestPersistentStorage, type PersistentStorageStatus, type StorageEstimate } from '@/lib/storage'
import { motion, AnimatePresence } from 'framer-motion'

function initializePositions(layout: GridLayout, photosArray: UploadedPhoto[]): PhotoPosition[] {
  return getUniqueAreaNames(layout.areas).map((area, index) => ({
    photoId: photosArray[index]?.id || '',
    gridArea: area,
  }))
}

function getLayoutAspectRatio(layout: GridLayout | null): number {
  if (!layout) return 1
  const value = layout.aspectRatio ?? 1
  if (typeof value === 'number') return value
  const [width, height] = value.split('/').map(Number)
  return Number.isFinite(width) && Number.isFinite(height) && height > 0 ? width / height : 1
}

function CollapsibleSection({ title, defaultOpen = true, headerAction, children }: {
  title: string
  defaultOpen?: boolean
  headerAction?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <details open={defaultOpen} className="group">
      <summary className="flex items-center cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden">
        <div className="flex items-center gap-2 flex-1">
          <svg className="w-4 h-4 shrink-0 transition-transform group-open:rotate-90 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 18l6-6-6-6" />
          </svg>
          <span className="text-lg font-semibold text-foreground">{title}</span>
        </div>
        {headerAction && <div onClick={e => e.stopPropagation()}>{headerAction}</div>}
      </summary>
      <Card className="p-4 sm:p-6 mt-3">
        {children}
      </Card>
    </details>
  )
}

function App() {
  const {
    collageId,
    photos,
    selectedLayoutId,
    photoPositions,
    settings,
    isLoading,
    isInitializing,
    initError,
    sessionError,
    initCollage,
    recoverSession,
    retryInitialization,
    retry,
    addPhoto,
    removePhoto,
    updateLayout,
    updatePositions,
    updateSettings,
    clearAll,
    projects, createProject, openProject, renameProject, duplicateProject, deleteProject, exportProject, importProject,
  } = useCollageApi()

  const { canUndo, canRedo, pushSnapshot, undo, redo, setRestoring, clear: clearHistory } = useCollageHistory()
  const { theme, setTheme, isDark } = useDarkMode()
  const { enabled: smartPositionEnabled, setEnabled: setSmartPositionEnabled, detectionMode, setDetectionMode } = useSmartPositioning()
  const { isOnline } = useOnlineStatus()
  const { needRefresh, updateSw, offlineReady } = useServiceWorker()

  const cycleTheme = useCallback(() => {
    const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light'
    setTheme(next)
  }, [theme, setTheme])

  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor
  const themeLabel = theme === 'light' ? 'Light mode' : theme === 'dark' ? 'Dark mode' : 'System theme'

  const getCurrentSnapshot = useCallback((): CollageSnapshot => ({
    selectedLayoutId,
    photoPositions,
    settings,
  }), [selectedLayoutId, photoPositions, settings])

  const previewRef = useRef<HTMLDivElement>(null)
  const [editingArea, setEditingArea] = useState<string | null>(null)
  const settingsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const uploadInProgressRef = useRef(false)
  const collageIdRef = useRef(collageId)
  collageIdRef.current = collageId
  const [availableLayouts, setAvailableLayouts] = useState<GridLayout[]>([])
  const [selectedLayout, setSelectedLayout] = useState<GridLayout | null>(null)
  const [showCarousel, setShowCarousel] = useState(false)
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [analysisResultsVersion, setAnalysisResultsVersion] = useState(0)
  const [workerStatus, setWorkerStatus] = useState<WorkerStatus>(getWorkerStatus)
  const [autoPositionRequest, setAutoPositionRequest] = useState(0)
  const positionRevisionRef = useRef(0)
  const completedAutoPositionRequestRef = useRef(0)
  const [storageStatus, setStorageStatus] = useState<PersistentStorageStatus | null>(null)
  const [storageEstimate, setStorageEstimate] = useState<StorageEstimate | null>(null)
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const isComparing = compareIds.length > 0

  // A completed analysis must never apply to positions that the user changed
  // while the asynchronous work was in flight.
  useEffect(() => {
    positionRevisionRef.current += 1
  }, [photoPositions])

  const cancelPendingAutoPosition = useCallback(() => {
    positionRevisionRef.current += 1
    completedAutoPositionRequestRef.current = autoPositionRequest
  }, [autoPositionRequest])

  useEffect(() => {
    clearHistory()
    setEditingArea(null)
    cancelPendingAutoPosition()
    // Project identity is the isolation boundary; history callbacks are stable in production.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collageId])

  const handleSmartPositionToggle = useCallback(() => {
    const nextEnabled = !smartPositionEnabled
    setSmartPositionEnabled(nextEnabled)
    if (nextEnabled) setAutoPositionRequest(request => request + 1)
  }, [setSmartPositionEnabled, smartPositionEnabled])

  // Track ML worker status changes
  useEffect(() => {
    return onWorkerStatusChange(setWorkerStatus)
  }, [])

  useEffect(() => {
    void requestPersistentStorage().then(setStorageStatus)
    void getStorageEstimate().then(setStorageEstimate)
  }, [])

  useEffect(() => {
    return () => {
      if (settingsTimerRef.current) {
        clearTimeout(settingsTimerRef.current)
        settingsTimerRef.current = null
      }
    }
  }, [collageId])

  // Initialize or dispose ML worker based on detection mode
  useEffect(() => {
    if (!smartPositionEnabled || detectionMode === 'basic') {
      // Dispose worker when not needed
      if (workerStatus !== 'idle') disposeMLWorker()
      return
    }

    // On Chrome/Edge with standard mode, native FaceDetector handles faces — no worker needed
    if (detectionMode === 'standard' && hasNativeFaceDetector()) return

    // Initialize worker with appropriate model
    const model = detectionMode === 'advanced' ? 'both' : 'face'
    let cancelled = false
    initMLWorker(model).catch(() => {
      if (!cancelled) {
        const fallback = detectionMode === 'advanced' ? 'standard' : 'basic'
        toast.error(`Detection model failed to load. Using ${fallback} mode.`)
        setDetectionMode(fallback)
      }
    })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [smartPositionEnabled, detectionMode])

  // When detection mode changes, clear analysis cache so photos get re-analyzed
  const prevDetectionMode = useRef(detectionMode)
  useEffect(() => {
    if (prevDetectionMode.current !== detectionMode) {
      prevDetectionMode.current = detectionMode
      clearAnalysisCache()
      setAnalysisResultsVersion(v => v + 1)
    }
  }, [detectionMode])

  const compareLayouts = useMemo(
    () => compareIds.map(id => availableLayouts.find(l => l.id === id)).filter(Boolean) as GridLayout[],
    [compareIds, availableLayouts]
  )

  // Rank available layouts based on photo characteristics when analysis data is cached
  const rankedLayouts = useMemo(() => {
    if (availableLayouts.length === 0 || photos.length === 0) return availableLayouts

    const characteristics: PhotoCharacteristics[] = photos.map(p => {
      const cached = getCachedAnalysis(p.id)
      return {
        photoId: p.id,
        orientation: cached?.orientation ?? 'square',
        aspectRatio: cached?.aspectRatio ?? 1,
        sharpnessScore: cached?.sharpnessScore ?? 0,
        dominantColors: cached?.dominantColors,
        isDark: cached?.isDark,
        averageLuminance: cached?.averageLuminance,
      }
    })

    // Only rank if we have real analysis data (at least one non-default)
    const hasAnalysis = characteristics.some(c => c.orientation !== 'square' || c.aspectRatio !== 1)
    if (!hasAnalysis) return availableLayouts

    const ranked = rankLayouts(availableLayouts, characteristics)
    return ranked.map(r => availableLayouts.find(l => l.id === r.layoutId)!).filter(Boolean)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableLayouts, photos, analysisResultsVersion])

  // The top-ranked layout gets a "Recommended" badge (only when analysis data exists)
  const recommendedLayoutId = useMemo(() => {
    if (rankedLayouts.length === 0 || photos.length === 0) return null
    const hasAnalysis = photos.some(p => {
      const cached = getCachedAnalysis(p.id)
      return cached && (cached.orientation !== undefined || cached.aspectRatio !== undefined)
    })
    return hasAnalysis ? rankedLayouts[0]?.id ?? null : null
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rankedLayouts, photos, analysisResultsVersion])

  // Aggregate dominant colors from all analyzed photos for background suggestions
  const allPhotoColors: DominantColor[] = useMemo(() => {
    if (photos.length === 0) return []
    const colors: DominantColor[] = []
    for (const p of photos) {
      const cached = getCachedAnalysis(p.id)
      if (cached?.dominantColors) {
        colors.push(...cached.dominantColors)
      }
    }
    return colors
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos, analysisResultsVersion])

  const handleToggleCarousel = useCallback(() => {
    setShowCarousel(prev => {
      if (!prev) setCompareIds([])
      return !prev
    })
  }, [])

  const handleToggleCompare = useCallback((layoutId?: string) => {
    if (isComparing) {
      if (layoutId) {
        // Toggle individual layout in compare
        setCompareIds(prev => {
          if (prev.includes(layoutId)) return prev.filter(id => id !== layoutId)
          if (prev.length >= 3) return prev
          return [...prev, layoutId]
        })
      } else {
        setCompareIds([])
      }
    } else {
      setShowCarousel(false)
      setCompareIds(layoutId ? [layoutId] : [])
    }
  }, [isComparing])

  const handleClearCompare = useCallback(() => {
    setCompareIds([])
  }, [])

  // Initialize session if none exists
  useEffect(() => {
    if (!collageId && !isInitializing && !initError) {
      void initCollage().catch(() => {})
    }
    // initCollage is a stable ref — safe to omit from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collageId, isInitializing, initError])

  useEffect(() => {
    const layouts = getLayoutsForPhotoCount(photos.length)
    setAvailableLayouts(layouts)

    if (photos.length > 0 && layouts.length > 0) {
      const currentLayoutValid = layouts.some(l => l.id === selectedLayoutId)

      if (!currentLayoutValid) {
        const newLayout = layouts[0]
        const newPositions = initializePositions(newLayout, photos)
        updateLayout(newLayout.id, newPositions)
        setSelectedLayout(newLayout)
      } else {
        const layout = layouts.find(l => l.id === selectedLayoutId)
        setSelectedLayout(layout || null)
      }
    } else if (photos.length === 0) {
      setSelectedLayout(null)
    }
  }, [photos, selectedLayoutId]) // updateLayout excluded — stable ref via useCollageApi

  useEffect(() => {
    if (selectedLayoutId) {
      const layout = availableLayouts.find(l => l.id === selectedLayoutId)
      setSelectedLayout(layout || null)
    }
  }, [selectedLayoutId, availableLayouts])

  const handleFilesSelected = useCallback(async (files: File[]) => {
    if (uploadInProgressRef.current) {
      toast.info('An upload is already in progress.')
      return
    }
    const uploadSessionId = collageId
    if (!uploadSessionId) {
      toast.error('Your collage is not ready yet. Please try again.')
      return
    }
    uploadInProgressRef.current = true
    try {
      const remaining = MAX_PHOTOS - photos.length
      const toAdd = files.slice(0, remaining)

      // Convert any HEIC/HEIF files to JPEG
      const toastId = toast.loading('Processing photos...')
      const { converted, errors } = await processFilesForHeic(toAdd, (done, total) => {
        toast.loading(`Converting HEIC ${done}/${total}...`, { id: toastId })
      })
      toast.dismiss(toastId)

      if (errors.length > 0) {
        errors.forEach(({ fileName, error }) =>
          toast.error(`Could not convert ${fileName}: ${error}`)
        )
      }

      if (collageIdRef.current !== uploadSessionId) {
        toast.error('The active collage changed before the upload finished. No new photos were stored.')
        return
      }

      const results = await Promise.allSettled(
        converted.map(async (file) => {
          const { dataUrl } = await correctExifOrientation(file)
          if (collageIdRef.current !== uploadSessionId) {
            throw new Error('The active collage changed during upload')
          }
          const id = generateUniqueId()
          await addPhoto({ id, dataUrl, fileName: file.name })
        })
      )
      const addedCount = results.filter((result) => result.status === 'fulfilled').length
      const failedResults = results.filter((result) => result.status === 'rejected')
      const failedCount = errors.length + failedResults.length

      if (addedCount > 0) {
        toast.success(`Added ${addedCount} ${addedCount === 1 ? 'photo' : 'photos'}`)
      }
      if (failedResults.some((result) => isQuotaExceededError(result.reason))) {
        toast.error('Storage is full. Remove photos or clear this collage, then try again. Existing photos were not changed.')
      } else if (failedCount > 0) {
        toast.error(`${failedCount} ${failedCount === 1 ? 'photo could' : 'photos could'} not be added.`)
      }
    } catch (error) {
      toast.error('Failed to upload photos')
      console.error(error)
    } finally {
      uploadInProgressRef.current = false
    }
  }, [photos.length, collageId, addPhoto])

  const handleRemovePhoto = useCallback(async (photoId: string) => {
    cancelPendingAutoPosition()
    try {
      await removePhoto(photoId)
      toast.success('Photo removed')
    } catch (error) {
      toast.error('Failed to remove photo')
      console.error(error)
    }
  }, [removePhoto, cancelPendingAutoPosition])

  const handleSettingsChange = useCallback((newSettings: CollageSettings) => {
    pushSnapshot(getCurrentSnapshot())
    if (settingsTimerRef.current) clearTimeout(settingsTimerRef.current)
    settingsTimerRef.current = setTimeout(() => {
      void updateSettings(newSettings).catch(() => {
        toast.error('Failed to save settings')
      })
    }, 300)
  }, [updateSettings, pushSnapshot, getCurrentSnapshot])

  const handleLayoutSelect = useCallback(async (layoutId: string) => {
    const layout = availableLayouts.find(l => l.id === layoutId)
    if (!layout) return
    cancelPendingAutoPosition()
    pushSnapshot(getCurrentSnapshot())
    const newPositions = initializePositions(layout, photos)
    await updateLayout(layoutId, newPositions)
    toast.success(`Layout changed to ${layout.name}`)
  }, [availableLayouts, photos, updateLayout, pushSnapshot, getCurrentSnapshot, cancelPendingAutoPosition])

  const handleArrangementApply = useCallback(async (layoutId: string, positions: PhotoPosition[]) => {
    const layout = availableLayouts.find(l => l.id === layoutId)
    if (!layout) return
    cancelPendingAutoPosition()
    pushSnapshot(getCurrentSnapshot())
    await updateLayout(layoutId, positions)
    setShowCarousel(false)
    toast.success(`Applied ${layout.name} arrangement`)
  }, [availableLayouts, updateLayout, pushSnapshot, getCurrentSnapshot, cancelPendingAutoPosition])

  const handleAutoLayout = useCallback(async () => {
    if (rankedLayouts.length === 0 || photos.length === 0) return
    cancelPendingAutoPosition()
    const bestLayout = rankedLayouts[0]
    pushSnapshot(getCurrentSnapshot())

    // Build characteristics for optimal photo arrangement
    const characteristics: PhotoCharacteristics[] = photos.map(p => {
      const cached = getCachedAnalysis(p.id)
      return {
        photoId: p.id,
        orientation: cached?.orientation ?? 'square',
        aspectRatio: cached?.aspectRatio ?? 1,
        sharpnessScore: cached?.sharpnessScore ?? 0,
        dHash: cached?.dHash,
        colorHistogram: cached?.colorHistogram,
        averageLuminance: cached?.averageLuminance,
      }
    })

    // Get optimal photo-to-slot assignment
    const arrangement = suggestPhotoArrangement(bestLayout, characteristics)
    const areaNames = getUniqueAreaNames(bestLayout.areas)
    const positions: PhotoPosition[] = areaNames.map(area => ({
      photoId: arrangement.get(area) ?? '',
      gridArea: area,
    }))

    await updateLayout(bestLayout.id, positions)
    toast.success(`Auto-applied ${bestLayout.name} with optimized arrangement`)
  }, [rankedLayouts, photos, updateLayout, pushSnapshot, getCurrentSnapshot, cancelPendingAutoPosition])

  const handleDownload = async (options: ExportOptions) => {
    if (!previewRef.current || !selectedLayout) {
      toast.error('No collage to download')
      throw new Error('No collage is available to download.')
    }

    try {
      toast.info('Preparing your collage...')
      await downloadCollage(
        previewRef.current,
        options.filename,
        options.format,
        options.quality,
        options.width,
        options.height
      )
      toast.success('Collage downloaded successfully!')
    } catch (error) {
      toast.error('Failed to download collage')
      console.error(error)
      throw error
    }
  }

  const handleClearAll = async () => {
    cancelPendingAutoPosition()
    try {
      if (settingsTimerRef.current) {
        clearTimeout(settingsTimerRef.current)
        settingsTimerRef.current = null
      }
      await clearAll()
      clearHistory()
      toast.success('All photos cleared')
    } catch (error) {
      toast.error(isQuotaExceededError(error) ? 'Storage is full. Your existing photos were kept.' : 'Could not clear this collage. Your photos were kept.')
      console.error(error)
    }
  }

  const handleEditPhoto = (area: string) => {
    setEditingArea(area)
  }

  const handleApplyEdit = async (updatedPosition: PhotoPosition) => {
    cancelPendingAutoPosition()
    pushSnapshot(getCurrentSnapshot())
    const newPositions = photoPositions.map(p =>
      p.gridArea === updatedPosition.gridArea ? updatedPosition : p
    )
    try {
      await updatePositions(newPositions)
    } catch {
      toast.error('Failed to save photo edits')
    }
  }

  const handleUndo = useCallback(async () => {
    const snapshot = undo(getCurrentSnapshot())
    if (!snapshot) return
    cancelPendingAutoPosition()
    setRestoring(true)
    try {
      if (snapshot.selectedLayoutId) {
        await updateLayout(snapshot.selectedLayoutId, snapshot.photoPositions)
      }
      await updateSettings(snapshot.settings)
    } finally {
      setRestoring(false)
    }
  }, [undo, getCurrentSnapshot, setRestoring, updateLayout, updateSettings, cancelPendingAutoPosition])

  const handleRedo = useCallback(async () => {
    const snapshot = redo(getCurrentSnapshot())
    if (!snapshot) return
    cancelPendingAutoPosition()
    setRestoring(true)
    try {
      if (snapshot.selectedLayoutId) {
        await updateLayout(snapshot.selectedLayoutId, snapshot.photoPositions)
      }
      await updateSettings(snapshot.settings)
    } finally {
      setRestoring(false)
    }
  }, [redo, getCurrentSnapshot, setRestoring, updateLayout, updateSettings, cancelPendingAutoPosition])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey
      if (!isMod) return
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        handleUndo()
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault()
        handleRedo()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleUndo, handleRedo])

  const photoInputKey = useMemo(
    () => photos.map(photo => `${photo.id}:${photo.dataUrl}`).join('|'),
    [photos]
  )

  // Auto-apply only for explicit smart-position triggers. Completion updates
  // ranking/color suggestions, but is deliberately not an analysis trigger.
  useEffect(() => {
    if (!smartPositionEnabled || !selectedLayout || photos.length === 0) return

    const needsWorker = detectionMode === 'advanced' || (detectionMode === 'standard' && !hasNativeFaceDetector())
    if (needsWorker && workerStatus !== 'ready') return

    // Sync detection mode to analysis pipeline before running
    setAnalysisDetectionMode(detectionMode)

    let cancelled = false
    const positionRevision = positionRevisionRef.current
    const shouldApplyPositions = autoPositionRequest > completedAutoPositionRequestRef.current
    async function applySmartPositions() {
      const results = await Promise.allSettled(
        photos.map(p => analyzePhotoWithCache(p.id, p.dataUrl))
      )
      if (cancelled) return

      const analyses = results
        .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof analyzePhotoWithCache>>> => r.status === 'fulfilled')
        .map(r => r.value)

      const updatedPositions = photoPositions.map(pos => {
        const analysis = analyses.find(a => a.photoId === pos.photoId)
        if (!analysis || analysis.regions.length === 0) return pos

        const smartPos = calculateSmartPosition(analysis)
        if (smartPos === '50% 50%') return pos

        return { ...pos, objectPosition: smartPos }
      })

      const changed = updatedPositions.some((p, i) => p.objectPosition !== photoPositions[i].objectPosition)
      if (shouldApplyPositions && changed && positionRevisionRef.current === positionRevision) {
        try {
          await updatePositions(updatedPositions)
        } catch {
          if (!cancelled && positionRevisionRef.current === positionRevision) {
            toast.error('Failed to apply smart photo positions')
          }
        }
      }
      if (shouldApplyPositions && !cancelled && positionRevisionRef.current === positionRevision) {
        completedAutoPositionRequestRef.current = autoPositionRequest
      }
      // Completion notifies ranking and color suggestions without restarting analysis.
      if (!cancelled) {
        setAnalysisResultsVersion(v => v + 1)
      }
    }

    applySmartPositions()
    return () => { cancelled = true }
    // photoPositions is intentionally excluded: changes invalidate the request
    // through positionRevisionRef but must not reapply smart positioning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPositionRequest, collageId, detectionMode, photoInputKey, selectedLayout, smartPositionEnabled, workerStatus])

  // Derived state for edit dialog
  const editingPosition = editingArea
    ? photoPositions.find(p => p.gridArea === editingArea)
    : undefined
  const editingPhotoId = editingPosition?.photoId
  const editingPhoto = editingPhotoId
    ? photos.find(p => p.id === editingPhotoId)
    : undefined

  if (isLoading || isInitializing) {
    return <div className="min-h-screen flex items-center justify-center">Opening your collage…</div>
  }

  if (sessionError || initError) {
    const isMissing = sessionError?.kind === 'missing'
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-lg p-6 space-y-4">
          <h1 className="text-xl font-semibold">{isMissing ? 'Your saved collage is unavailable' : 'We could not open your collage'}</h1>
          <p className="text-muted-foreground">
            {isMissing
              ? 'The browser remembers a collage that is no longer in its local storage. Create a new empty collage to keep editing; this does not remove any other browser data.'
              : 'Your local collage could not be read. Try again before creating a new collage so existing work is not replaced.'}
          </p>
          <div className="flex flex-wrap gap-3">
            {initError
              ? <Button variant="outline" onClick={() => void retryInitialization().catch(() => {})}>Try again</Button>
              : <Button variant="outline" onClick={() => void retry()}>Try again</Button>}
            <Button onClick={() => void recoverSession().catch(() => {})}>{isMissing ? 'Create new collage' : 'Create a new collage'}</Button>
          </div>
        </Card>
      </main>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-20 lg:pb-0 overflow-x-hidden">
      <OfflineBanner isOnline={isOnline} offlineReady={offlineReady} />
      <UpdateToast needRefresh={needRefresh} onRefresh={updateSw} />
      <Toaster position="top-right" />
      <div className="container mx-auto px-3 py-4 sm:px-4 sm:py-8 max-w-7xl">
        {storageStatus && storageStatus !== 'granted' && (
          <Card className="mb-4 p-4 text-sm text-muted-foreground" role="status">
            {storageStatus === 'unavailable'
              ? 'Your browser does not offer persistent-storage controls. You can keep editing, but browser storage may be cleared by the device or browser.'
              : 'Your browser did not grant persistent storage. You can keep editing, but avoid clearing browser data to protect this collage.'}
            {storageEstimate && ` Currently using ${Math.round(storageEstimate.usage / 1024 / 1024)} MB of ${Math.round(storageEstimate.quota / 1024 / 1024)} MB available.`}
          </Card>
        )}
        <header className="mb-4 sm:mb-8">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 bg-gradient-to-br from-primary to-accent rounded-2xl flex items-center justify-center">
                <Sparkle className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-white" weight="fill" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-foreground">
                  Collage Maker
                </h1>
                <p className="text-muted-foreground hidden sm:block">
                  Create beautiful photo grids in seconds
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <InstallButton />
              <Button
                variant="ghost"
                size="sm"
                onClick={cycleTheme}
                aria-label={themeLabel}
                title={themeLabel}
                className="min-h-[36px] min-w-[36px] sm:min-h-[44px] sm:min-w-[44px]"
              >
                <ThemeIcon className="w-4 h-4" weight="bold" />
              </Button>
              {photos.length > 0 && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleUndo}
                    disabled={!canUndo}
                    title="Undo (⌘Z)"
                    aria-label="Undo"
                    aria-keyshortcuts="Meta+Z"
                    className="min-h-[36px] min-w-[36px] sm:min-h-[44px] sm:min-w-[44px]"
                  >
                    <ArrowCounterClockwise className="w-4 h-4" weight="bold" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRedo}
                    disabled={!canRedo}
                    title="Redo (⌘⇧Z)"
                    aria-label="Redo"
                    aria-keyshortcuts="Meta+Shift+Z"
                    className="min-h-[36px] min-w-[36px] sm:min-h-[44px] sm:min-w-[44px]"
                  >
                    <ArrowClockwise className="w-4 h-4" weight="bold" />
                  </Button>
                </>
              )}
            </div>
          </div>
        </header>
        <ProjectLibrary projects={projects} activeId={collageId} onOpen={openProject} onCreate={createProject} onRename={renameProject} onDuplicate={duplicateProject} onDelete={deleteProject} onExport={exportProject} onImport={importProject} />

        <main className="grid lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-2 space-y-6 min-w-0">
            {photos.length === 0 ? (
              <UploadZone 
                onFilesSelected={handleFilesSelected}
                currentFileCount={photos.length}
              />
            ) : (
              <Card className="p-4 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold">Your Photos</h2>
                    <Badge variant="secondary">
                      {photos.length} / {MAX_PHOTOS}
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setClearDialogOpen(true)}
                    className="min-h-[44px]"
                  >
                    <Trash className="w-4 h-4 mr-2" weight="duotone" />
                    Clear All
                  </Button>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 mb-4">
                  <AnimatePresence>
                    {photos.map((photo, index) => (
                      <PhotoThumbnail
                        key={photo.id}
                        photo={photo}
                        onRemove={handleRemovePhoto}
                        index={index}
                      />
                    ))}
                  </AnimatePresence>
                </div>

                {photos.length < MAX_PHOTOS && (
                  <UploadZone 
                    onFilesSelected={handleFilesSelected}
                    currentFileCount={photos.length}
                  />
                )}
              </Card>
            )}

            {selectedLayout && (
              <div>
                <div className="flex items-center justify-between mb-4 sticky top-0 z-10 bg-background py-2">
                  <h2 className="text-lg font-semibold">Preview</h2>
                  <div className="hidden lg:block">
                    <ExportDialog
                      onExport={handleDownload}
                      disabled={!selectedLayout}
                      aspectRatio={getLayoutAspectRatio(selectedLayout)}
                    />
                  </div>
                </div>

                <AnimatePresence>
                  {showCarousel && (
                    <ArrangementCarousel
                      layouts={availableLayouts}
                      photos={photos}
                      currentLayoutId={selectedLayoutId}
                      currentPositions={photoPositions}
                      onApply={handleArrangementApply}
                      onClose={() => setShowCarousel(false)}
                    />
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  {isComparing && compareLayouts.length > 0 && (
                    <ComparePanel
                      layouts={availableLayouts}
                      compareIds={compareIds}
                      photos={photos}
                      photoPositions={photoPositions}
                      selectedLayoutId={selectedLayoutId}
                      onLayoutSelect={(id) => {
                        handleLayoutSelect(id)
                        handleClearCompare()
                      }}
                      onClearCompare={handleClearCompare}
                      onToggleCompare={(id) => handleToggleCompare(id)}
                    />
                  )}
                </AnimatePresence>

                <CollagePreview
                  layout={selectedLayout}
                  photos={photos}
                  photoPositions={photoPositions}
                  settings={settings}
                  onPositionsChange={(nextPositions) => {
                    cancelPendingAutoPosition()
                    pushSnapshot(getCurrentSnapshot())
                    void updatePositions(nextPositions).catch(() => {
                      toast.error('Failed to update photo positions')
                    })
                  }}
                  onEditPhoto={handleEditPhoto}
                  previewRef={previewRef}
                />

                {/* Layout strip - directly below preview */}
                <Card className="p-4">
                  <h3 className="text-sm font-semibold mb-2">Layout Options</h3>
                  <LayoutGallery
                    layouts={rankedLayouts}
                    photos={photos}
                    photoPositions={photoPositions}
                    selectedLayoutId={selectedLayoutId}
                    onLayoutSelect={handleLayoutSelect}
                    onArrangementApply={handleArrangementApply}
                    onAutoLayout={handleAutoLayout}
                    recommendedLayoutId={recommendedLayoutId}
                    showCarousel={showCarousel}
                    onToggleCarousel={handleToggleCarousel}
                    compareIds={compareIds}
                    onToggleCompare={handleToggleCompare}
                  />
                </Card>
              </div>
            )}
          </div>

          <div className="space-y-6 min-w-0">
            {photos.length > 0 && (
              <>
                <CollapsibleSection title="Presets" defaultOpen={false}>
                  <PresetGallery
                    onApplyPreset={handleSettingsChange}
                    currentSettings={settings}
                  />
                </CollapsibleSection>

                <CollapsibleSection title="Customize" defaultOpen={true}>
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg mb-4">
                    <div className="flex items-center gap-2">
                      <MagicWand className="w-4 h-4 text-primary" weight="duotone" />
                      <span className="text-sm font-medium">Smart Position</span>
                    </div>
                    <button
                      role="switch"
                      aria-label="Smart positioning"
                      aria-checked={smartPositionEnabled}
                      onClick={handleSmartPositionToggle}
                      className={cn(
                        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                        smartPositionEnabled ? "bg-primary" : "bg-muted-foreground/30"
                      )}
                    >
                      <span
                        className={cn(
                          "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                          smartPositionEnabled ? "translate-x-6" : "translate-x-1"
                        )}
                      />
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground mb-4">
                    Turning this on applies automatic positioning to the current layout. Manual edits remain unchanged until you turn Smart Position off and on again.
                  </p>
                  <CustomizationControls
                    settings={settings}
                    onSettingsChange={handleSettingsChange}
                    photoColors={allPhotoColors}
                    smartPositionEnabled={smartPositionEnabled}
                    detectionMode={detectionMode}
                    onDetectionModeChange={setDetectionMode}
                    workerStatus={workerStatus}
                  />
                </CollapsibleSection>
              </>
            )}
          </div>
        </main>

        {photos.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-center py-12"
          >
            <h2 className="text-2xl font-semibold mb-6 text-foreground">
              Get Started
            </h2>
            <div className="grid grid-cols-4 gap-1 sm:flex sm:items-center sm:justify-center sm:gap-6 py-4">
              <div className="flex flex-col items-center gap-2">
                <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <UploadSimple className="w-5 h-5 sm:w-7 sm:h-7 text-primary" weight="duotone" />
                </div>
                <span className="text-xs sm:text-sm font-medium text-foreground">Upload</span>
              </div>
              <svg className="w-6 h-6 text-muted-foreground/50 shrink-0 hidden sm:inline-block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              <div className="flex flex-col items-center gap-2">
                <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Sliders className="w-5 h-5 sm:w-7 sm:h-7 text-primary" weight="duotone" />
                </div>
                <span className="text-xs sm:text-sm font-medium text-foreground">Customize</span>
              </div>
              <svg className="w-6 h-6 text-muted-foreground/50 shrink-0 hidden sm:inline-block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              <div className="flex flex-col items-center gap-2">
                <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <GridFour className="w-5 h-5 sm:w-7 sm:h-7 text-primary" weight="duotone" />
                </div>
                <span className="text-xs sm:text-sm font-medium text-foreground"><span className="sm:hidden">Layout</span><span className="hidden sm:inline">Choose Layout</span></span>
              </div>
              <svg className="w-6 h-6 text-muted-foreground/50 shrink-0 hidden sm:inline-block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              <div className="flex flex-col items-center gap-2">
                <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <DownloadSimple className="w-5 h-5 sm:w-7 sm:h-7 text-primary" weight="duotone" />
                </div>
                <span className="text-xs sm:text-sm font-medium text-foreground">Download</span>
              </div>
            </div>
            <p className="text-muted-foreground max-w-md mx-auto mt-4">
              Upload 1-{MAX_PHOTOS} photos to begin creating your custom collage.
            </p>
          </motion.div>
        )}
      </div>

      {editingPhoto && editingPosition && (
        <PhotoEditDialog
          open={!!editingArea}
          onOpenChange={(open) => { if (!open) setEditingArea(null) }}
          photo={editingPhoto}
          position={editingPosition}
          onApply={handleApplyEdit}
        />
      )}

      {photos.length > 0 && selectedLayout && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border p-3 lg:hidden">
          <ExportDialog
            onExport={handleDownload}
            disabled={!selectedLayout}
            aspectRatio={getLayoutAspectRatio(selectedLayout)}
            trigger={
              <Button className="w-full min-h-[44px]" size="lg">
                <DownloadSimple className="w-5 h-5 mr-2" weight="bold" />
                Export Collage
              </Button>
            }
          />
        </div>
      )}

      <AppFooter />
      <AlertDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear this collage?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes all photos and layout data in this collage from this browser. A new empty collage will be created.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              setClearDialogOpen(false)
              void handleClearAll()
            }}>Clear all photos</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default App
