import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useCollageApi } from '@/hooks/useCollageApi'
import { UploadedPhoto, PhotoPosition, GridLayout, CollageSettings, ExportOptions, MAX_PHOTOS } from '@/lib/types'
import { getLayoutsForPhotoCount, getUniqueAreaNames } from '@/lib/layouts'
import { fileToDataUrl, generateUniqueId, downloadCollage } from '@/lib/image-utils'
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
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Toaster } from '@/components/ui/sonner'
import { Trash, Sparkle, ArrowCounterClockwise, ArrowClockwise, UploadSimple, Sliders, GridFour, DownloadSimple } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { useCollageHistory, CollageSnapshot } from '@/hooks/use-collage-history'
import { motion, AnimatePresence } from 'framer-motion'

function initializePositions(layout: GridLayout, photosArray: UploadedPhoto[]): PhotoPosition[] {
  return getUniqueAreaNames(layout.areas).map((area, index) => ({
    photoId: photosArray[index]?.id || '',
    gridArea: area,
  }))
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
      <Card className="p-6 mt-3">
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
    initCollage,
    addPhoto,
    removePhoto,
    updateLayout,
    updatePositions,
    updateSettings,
    clearAll,
  } = useCollageApi()

  const { canUndo, canRedo, pushSnapshot, undo, redo, setRestoring, clear: clearHistory } = useCollageHistory()

  const getCurrentSnapshot = useCallback((): CollageSnapshot => ({
    selectedLayoutId,
    photoPositions,
    settings,
  }), [selectedLayoutId, photoPositions, settings])

  const previewRef = useRef<HTMLDivElement>(null)
  const [editingArea, setEditingArea] = useState<string | null>(null)
  const settingsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [availableLayouts, setAvailableLayouts] = useState<GridLayout[]>([])
  const [selectedLayout, setSelectedLayout] = useState<GridLayout | null>(null)
  const [showCarousel, setShowCarousel] = useState(false)
  const [compareIds, setCompareIds] = useState<string[]>([])
  const isComparing = compareIds.length > 0

  const compareLayouts = useMemo(
    () => compareIds.map(id => availableLayouts.find(l => l.id === id)).filter(Boolean) as GridLayout[],
    [compareIds, availableLayouts]
  )

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
    if (!collageId) {
      initCollage()
    }
    // initCollage is a stable ref — safe to omit from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collageId])

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

      await Promise.all(
        converted.map(async (file) => {
          const dataUrl = await fileToDataUrl(file)
          const id = generateUniqueId()
          await addPhoto({ id, dataUrl, fileName: file.name })
        })
      )
      toast.success(`Added ${converted.length} ${converted.length === 1 ? 'photo' : 'photos'}`)
    } catch (error) {
      toast.error('Failed to upload photos')
      console.error(error)
    }
  }, [photos.length, addPhoto])

  const handleRemovePhoto = useCallback(async (photoId: string) => {
    try {
      await removePhoto(photoId)
      toast.success('Photo removed')
    } catch (error) {
      toast.error('Failed to remove photo')
      console.error(error)
    }
  }, [removePhoto])

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
    pushSnapshot(getCurrentSnapshot())
    const newPositions = initializePositions(layout, photos)
    await updateLayout(layoutId, newPositions)
    toast.success(`Layout changed to ${layout.name}`)
  }, [availableLayouts, photos, updateLayout, pushSnapshot, getCurrentSnapshot])

  const handleArrangementApply = useCallback(async (layoutId: string, positions: PhotoPosition[]) => {
    const layout = availableLayouts.find(l => l.id === layoutId)
    if (!layout) return
    pushSnapshot(getCurrentSnapshot())
    await updateLayout(layoutId, positions)
    setShowCarousel(false)
    toast.success(`Applied ${layout.name} arrangement`)
  }, [availableLayouts, updateLayout, pushSnapshot, getCurrentSnapshot])

  const handleDownload = async (options: ExportOptions) => {
    if (!previewRef.current || !selectedLayout) {
      toast.error('No collage to download')
      return
    }

    try {
      toast.info('Preparing your collage...')
      await downloadCollage(
        previewRef.current,
        options.filename,
        options.format,
        options.quality
      )
      toast.success('Collage downloaded successfully!')
    } catch (error) {
      toast.error('Failed to download collage')
      console.error(error)
    }
  }

  const handleClearAll = async () => {
    await clearAll()
    clearHistory()
    toast.success('All photos cleared')
  }

  const handleEditPhoto = (area: string) => {
    setEditingArea(area)
  }

  const handleApplyEdit = async (updatedPosition: PhotoPosition) => {
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
    setRestoring(true)
    try {
      if (snapshot.selectedLayoutId) {
        await updateLayout(snapshot.selectedLayoutId, snapshot.photoPositions)
      }
      await updateSettings(snapshot.settings)
    } finally {
      setRestoring(false)
    }
  }, [undo, getCurrentSnapshot, setRestoring, updateLayout, updateSettings])

  const handleRedo = useCallback(async () => {
    const snapshot = redo(getCurrentSnapshot())
    if (!snapshot) return
    setRestoring(true)
    try {
      if (snapshot.selectedLayoutId) {
        await updateLayout(snapshot.selectedLayoutId, snapshot.photoPositions)
      }
      await updateSettings(snapshot.settings)
    } finally {
      setRestoring(false)
    }
  }, [redo, getCurrentSnapshot, setRestoring, updateLayout, updateSettings])

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

  // Derived state for edit dialog
  const editingPosition = editingArea
    ? photoPositions.find(p => p.gridArea === editingArea)
    : undefined
  const editingPhotoId = editingPosition?.photoId
  const editingPhoto = editingPhotoId
    ? photos.find(p => p.id === editingPhotoId)
    : undefined

  if (isLoading && !collageId) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>
  }

  return (
    <div className="min-h-screen bg-background">
      <Toaster position="top-right" />
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <header className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-primary to-accent rounded-2xl flex items-center justify-center">
                <Sparkle className="w-6 h-6 text-white" weight="fill" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground">
                  Collage Maker
                </h1>
                <p className="text-muted-foreground">
                  Create beautiful photo grids in seconds
                </p>
              </div>
            </div>
            {photos.length > 0 && (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleUndo}
                  disabled={!canUndo}
                  title="Undo (⌘Z)"
                  aria-label="Undo"
                  aria-keyshortcuts="Meta+Z"
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
                >
                  <ArrowClockwise className="w-4 h-4" weight="bold" />
                </Button>
              </div>
            )}
          </div>
        </header>

        <main className="grid lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-2 space-y-6">
            {photos.length === 0 ? (
              <UploadZone 
                onFilesSelected={handleFilesSelected}
                currentFileCount={photos.length}
              />
            ) : (
              <Card className="p-6">
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
                    onClick={handleClearAll}
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
                  <ExportDialog
                    onExport={handleDownload}
                    disabled={!selectedLayout}
                  />
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
                    pushSnapshot(getCurrentSnapshot())
                    void updatePositions(nextPositions).catch(() => {
                      toast.error('Failed to update photo positions')
                    })
                  }}
                  onEditPhoto={handleEditPhoto}
                  previewRef={previewRef}
                />
              </div>
            )}
          </div>

          <div className="space-y-6">
            {photos.length > 0 && (
              <>
                <CollapsibleSection title="Presets" defaultOpen={false}>
                  <PresetGallery
                    onApplyPreset={handleSettingsChange}
                    currentSettings={settings}
                  />
                </CollapsibleSection>

                <CollapsibleSection title="Customize" defaultOpen={true}>
                  <CustomizationControls
                    settings={settings}
                    onSettingsChange={handleSettingsChange}
                  />
                </CollapsibleSection>

                <CollapsibleSection title="Layout Options" defaultOpen={true}>
                  <LayoutGallery
                    layouts={availableLayouts}
                    photos={photos}
                    photoPositions={photoPositions}
                    selectedLayoutId={selectedLayoutId}
                    onLayoutSelect={handleLayoutSelect}
                    onArrangementApply={handleArrangementApply}
                    showCarousel={showCarousel}
                    onToggleCarousel={handleToggleCarousel}
                    compareIds={compareIds}
                    onToggleCompare={handleToggleCompare}
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
            <div className="flex items-center justify-center gap-4 sm:gap-6 py-4 flex-wrap">
              <div className="flex flex-col items-center gap-2">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <UploadSimple className="w-7 h-7 text-primary" weight="duotone" />
                </div>
                <span className="text-sm font-medium text-foreground">Upload</span>
              </div>
              <svg className="w-6 h-6 text-muted-foreground/50 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              <div className="flex flex-col items-center gap-2">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Sliders className="w-7 h-7 text-primary" weight="duotone" />
                </div>
                <span className="text-sm font-medium text-foreground">Customize</span>
              </div>
              <svg className="w-6 h-6 text-muted-foreground/50 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              <div className="flex flex-col items-center gap-2">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <GridFour className="w-7 h-7 text-primary" weight="duotone" />
                </div>
                <span className="text-sm font-medium text-foreground">Choose Layout</span>
              </div>
              <svg className="w-6 h-6 text-muted-foreground/50 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              <div className="flex flex-col items-center gap-2">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <DownloadSimple className="w-7 h-7 text-primary" weight="duotone" />
                </div>
                <span className="text-sm font-medium text-foreground">Download</span>
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

      <AppFooter />
    </div>
  )
}

export default App