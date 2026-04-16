import { useState, useRef, useCallback, useEffect } from 'react'
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
import { ExportDialog } from '@/components/ExportDialog'
import { PhotoEditDialog } from '@/components/PhotoEditDialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Toaster } from '@/components/ui/sonner'
import { Trash, Sparkle } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'

function initializePositions(layout: GridLayout, photosArray: UploadedPhoto[]): PhotoPosition[] {
  return getUniqueAreaNames(layout.areas).map((area, index) => ({
    photoId: photosArray[index]?.id || '',
    gridArea: area,
  }))
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

  const previewRef = useRef<HTMLDivElement>(null)
  const [editingArea, setEditingArea] = useState<string | null>(null)
  const settingsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [availableLayouts, setAvailableLayouts] = useState<GridLayout[]>([])
  const [selectedLayout, setSelectedLayout] = useState<GridLayout | null>(null)

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
    if (settingsTimerRef.current) clearTimeout(settingsTimerRef.current)
    settingsTimerRef.current = setTimeout(() => {
      void updateSettings(newSettings).catch(() => {
        toast.error('Failed to save settings')
      })
    }, 300)
  }, [updateSettings])

  const handleLayoutSelect = useCallback(async (layoutId: string) => {
    const layout = availableLayouts.find(l => l.id === layoutId)
    if (!layout) return
    const newPositions = initializePositions(layout, photos)
    await updateLayout(layoutId, newPositions)
    toast.success(`Layout changed to ${layout.name}`)
  }, [availableLayouts, photos, updateLayout])

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
    toast.success('All photos cleared')
  }

  const handleEditPhoto = (area: string) => {
    setEditingArea(area)
  }

  const handleApplyEdit = async (updatedPosition: PhotoPosition) => {
    const newPositions = photoPositions.map(p =>
      p.gridArea === updatedPosition.gridArea ? updatedPosition : p
    )
    try {
      await updatePositions(newPositions)
    } catch {
      toast.error('Failed to save photo edits')
    }
  }

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
          <div className="flex items-center gap-3 mb-2">
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
        </header>

        <div className="grid lg:grid-cols-3 gap-6 mb-6">
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
                    <h3 className="text-lg font-semibold">Your Photos</h3>
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
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Preview</h3>
                  <ExportDialog
                    onExport={handleDownload}
                    disabled={!selectedLayout}
                  />
                </div>
                <CollagePreview
                  layout={selectedLayout}
                  photos={photos}
                  photoPositions={photoPositions}
                  settings={settings}
                  onPositionsChange={(nextPositions) => {
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
                <CustomizationControls
                  settings={settings}
                  onSettingsChange={handleSettingsChange}
                />

                <LayoutGallery
                  layouts={availableLayouts}
                  photos={photos}
                  photoPositions={photoPositions}
                  selectedLayoutId={selectedLayoutId}
                  onLayoutSelect={handleLayoutSelect}
                />
              </>
            )}
          </div>
        </div>

        {photos.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-center py-12"
          >
            <h2 className="text-2xl font-semibold mb-3 text-foreground">
              Get Started
            </h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Upload 1-{MAX_PHOTOS} photos to begin creating your custom collage. 
              Choose from dozens of beautiful layouts and customize to your liking.
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
    </div>
  )
}

export default App