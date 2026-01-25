import { useState, useRef, useCallback, useEffect } from 'react'
import { useKV } from '@github/spark/hooks'
import { UploadedPhoto, PhotoPosition, GridLayout, CollageSettings } from '@/lib/types'
import { getLayoutsForPhotoCount } from '@/lib/layouts'
import { fileToDataUrl, generateUniqueId, downloadCollage } from '@/lib/image-utils'
import { UploadZone } from '@/components/UploadZone'
import { PhotoThumbnail } from '@/components/PhotoThumbnail'
import { LayoutGallery } from '@/components/LayoutGallery'
import { CollagePreview } from '@/components/CollagePreview'
import { CustomizationControls } from '@/components/CustomizationControls'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Toaster } from '@/components/ui/sonner'
import { DownloadSimple, Trash, Sparkle } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'

function App() {
  const [photos, setPhotos] = useKV<UploadedPhoto[]>('collage-photos', [])
  const [selectedLayoutId, setSelectedLayoutId] = useKV<string | null>('selected-layout', null)
  const [photoPositions, setPhotoPositions] = useKV<PhotoPosition[]>('photo-positions', [])
  const [settings, setSettings] = useKV<CollageSettings>('collage-settings', {
    gap: 8,
    backgroundColor: 'transparent',
    borderRadius: 0
  })

  const previewRef = useRef<HTMLDivElement>(null)
  const [availableLayouts, setAvailableLayouts] = useState<GridLayout[]>([])
  const [selectedLayout, setSelectedLayout] = useState<GridLayout | null>(null)

  const currentPhotos = photos || []
  const currentPositions = photoPositions || []
  const currentSettings = settings || { gap: 8, backgroundColor: 'transparent', borderRadius: 0 }
  const currentLayoutId = selectedLayoutId || null

  useEffect(() => {
    const layouts = getLayoutsForPhotoCount(currentPhotos.length)
    setAvailableLayouts(layouts)

    if (currentPhotos.length > 0 && layouts.length > 0) {
      const currentLayoutValid = layouts.some(l => l.id === currentLayoutId)
      
      if (!currentLayoutValid) {
        const newLayout = layouts[0]
        setSelectedLayoutId(newLayout.id)
        setSelectedLayout(newLayout)
        initializePhotoPositions(newLayout, currentPhotos)
      } else {
        const layout = layouts.find(l => l.id === currentLayoutId)
        setSelectedLayout(layout || null)
      }
    } else {
      setSelectedLayoutId(null)
      setSelectedLayout(null)
      setPhotoPositions([])
    }
  }, [currentPhotos.length])

  useEffect(() => {
    if (currentLayoutId) {
      const layout = availableLayouts.find(l => l.id === currentLayoutId)
      setSelectedLayout(layout || null)
    }
  }, [currentLayoutId, availableLayouts])

  const initializePhotoPositions = (layout: GridLayout, photosArray: UploadedPhoto[]) => {
    const newPositions: PhotoPosition[] = layout.areas.map((area, index) => ({
      photoId: photosArray[index]?.id || '',
      gridArea: area
    }))
    setPhotoPositions(newPositions)
  }

  const handleFilesSelected = useCallback(async (files: File[]) => {
    try {
      const newPhotos = await Promise.all(
        files.map(async (file) => ({
          id: generateUniqueId(),
          file,
          dataUrl: await fileToDataUrl(file)
        }))
      )

      setPhotos((currentPhotos = []) => {
        const updated = [...currentPhotos, ...newPhotos]
        return updated.slice(0, 9)
      })

      toast.success(`Added ${newPhotos.length} ${newPhotos.length === 1 ? 'photo' : 'photos'}`)
    } catch (error) {
      toast.error('Failed to upload photos')
      console.error(error)
    }
  }, [setPhotos])

  const handleRemovePhoto = useCallback((photoId: string) => {
    setPhotos((currentPhotos = []) => currentPhotos.filter(p => p.id !== photoId))
    toast.success('Photo removed')
  }, [setPhotos])

  const handleLayoutSelect = useCallback((layoutId: string) => {
    const layout = availableLayouts.find(l => l.id === layoutId)
    if (!layout) return

    setSelectedLayoutId(layoutId)
    initializePhotoPositions(layout, currentPhotos)
    toast.success(`Layout changed to ${layout.name}`)
  }, [availableLayouts, currentPhotos, setSelectedLayoutId])

  const handleDownload = async () => {
    if (!previewRef.current || !selectedLayout) {
      toast.error('No collage to download')
      return
    }

    try {
      toast.info('Preparing your collage...')
      await downloadCollage(previewRef.current, `collage-${Date.now()}.png`)
      toast.success('Collage downloaded successfully!')
    } catch (error) {
      toast.error('Failed to download collage')
      console.error(error)
    }
  }

  const handleClearAll = () => {
    setPhotos([])
    setSelectedLayoutId(null)
    setPhotoPositions([])
    toast.success('All photos cleared')
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
            {currentPhotos.length === 0 ? (
              <UploadZone 
                onFilesSelected={handleFilesSelected}
                currentFileCount={currentPhotos.length}
              />
            ) : (
              <Card className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold">Your Photos</h3>
                    <Badge variant="secondary">
                      {currentPhotos.length} / 9
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
                    {currentPhotos.map((photo, index) => (
                      <PhotoThumbnail
                        key={photo.id}
                        photo={photo}
                        onRemove={handleRemovePhoto}
                        index={index}
                      />
                    ))}
                  </AnimatePresence>
                </div>

                {currentPhotos.length < 9 && (
                  <UploadZone 
                    onFilesSelected={handleFilesSelected}
                    currentFileCount={currentPhotos.length}
                  />
                )}
              </Card>
            )}

            {selectedLayout && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Preview</h3>
                  <Button onClick={handleDownload} size="lg">
                    <DownloadSimple className="w-5 h-5 mr-2" weight="duotone" />
                    Download
                  </Button>
                </div>
                <CollagePreview
                  layout={selectedLayout}
                  photos={currentPhotos}
                  photoPositions={currentPositions}
                  settings={currentSettings}
                  onPositionsChange={setPhotoPositions}
                  previewRef={previewRef}
                />
              </div>
            )}
          </div>

          <div className="space-y-6">
            {currentPhotos.length > 0 && (
              <>
                <CustomizationControls
                  settings={currentSettings}
                  onSettingsChange={setSettings}
                />

                <LayoutGallery
                  layouts={availableLayouts}
                  photos={currentPhotos}
                  photoPositions={currentPositions}
                  selectedLayoutId={currentLayoutId}
                  onLayoutSelect={handleLayoutSelect}
                />
              </>
            )}
          </div>
        </div>

        {currentPhotos.length === 0 && (
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
              Upload 1-9 photos to begin creating your custom collage. 
              Choose from dozens of beautiful layouts and customize to your liking.
            </p>
          </motion.div>
        )}
      </div>
    </div>
  )
}

export default App