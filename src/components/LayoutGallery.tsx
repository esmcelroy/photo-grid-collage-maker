import { useState, useCallback, useMemo } from 'react'
import { GridLayout, PhotoPosition, UploadedPhoto } from '@/lib/types'
import { LayoutOption } from './LayoutOption'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { GridFour, Shuffle, Columns, MagicWand, X } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { getUniqueAreaNames } from '@/lib/layouts'
import { ArrangementCarousel } from './ArrangementCarousel'

interface LayoutGalleryProps {
  layouts: GridLayout[]
  photos: UploadedPhoto[]
  photoPositions: PhotoPosition[]
  selectedLayoutId: string | null
  onLayoutSelect: (layoutId: string) => void
  onArrangementApply?: (layoutId: string, positions: PhotoPosition[]) => void
}

function parseTemplate(template: string): { rows: string[], columns: string[] } {
  const parts = template.split('/')
  if (parts.length === 1) {
    return { rows: ['1fr'], columns: parts[0].trim().split(' ') }
  }
  const [rows, cols] = parts
  return { rows: rows.trim().split(' '), columns: cols ? cols.trim().split(' ') : ['1fr'] }
}

interface CompareCardProps {
  layout: GridLayout
  photos: UploadedPhoto[]
  photoPositions: PhotoPosition[]
  isSelected: boolean
  onSelect: () => void
  onRemove: () => void
}

function CompareCard({ layout, photos, photoPositions, isSelected, onSelect, onRemove }: CompareCardProps) {
  const getPhotoForArea = (area: string): UploadedPhoto | undefined => {
    const position = photoPositions.find(p => p.gridArea === area)
    if (!position) return undefined
    return photos.find(p => p.id === position.photoId)
  }

  const gridTemplateAreas = layout.areas.map(area => `"${area}"`).join(' ')
  const { rows, columns } = parseTemplate(layout.gridTemplate)

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
    >
      <Card
        className={cn(
          "relative cursor-pointer transition-all duration-300 overflow-hidden",
          isSelected
            ? "ring-2 ring-accent shadow-lg"
            : "hover:ring-2 hover:ring-accent/50 hover:shadow-md"
        )}
        onClick={onSelect}
      >
        <button
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          className="absolute top-2 right-2 z-10 w-6 h-6 bg-background/80 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground transition-colors"
          aria-label={`Remove ${layout.name} from comparison`}
        >
          <X className="w-3 h-3" weight="bold" />
        </button>
        <div className="p-4">
          <div
            className="w-full rounded-lg overflow-hidden"
            style={{
              aspectRatio: layout.aspectRatio || '1/1',
              display: 'grid',
              gridTemplateRows: rows.join(' '),
              gridTemplateColumns: columns.join(' '),
              gridTemplateAreas,
              gap: '3px',
            }}
          >
            {getUniqueAreaNames(layout.areas).map((area) => {
              const photo = getPhotoForArea(area)
              return (
                <div
                  key={area}
                  style={{ gridArea: area }}
                  className={cn(
                    "relative bg-muted overflow-hidden rounded-sm",
                    !photo && "flex items-center justify-center"
                  )}
                >
                  {photo ? (
                    <img src={photo.dataUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-6 h-6 bg-border rounded-sm" />
                  )}
                </div>
              )
            })}
          </div>
          <p className={cn(
            "text-sm font-medium text-center mt-3 transition-colors",
            isSelected ? "text-accent" : "text-foreground"
          )}>
            {layout.name}
          </p>
        </div>
        {isSelected && (
          <div className="absolute top-2 left-2 px-2 py-0.5 bg-accent text-accent-foreground text-xs font-medium rounded-full">
            Current
          </div>
        )}
      </Card>
    </motion.div>
  )
}

export function LayoutGallery({
  layouts,
  photos,
  photoPositions,
  selectedLayoutId,
  onLayoutSelect,
  onArrangementApply,
}: LayoutGalleryProps) {
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [showCarousel, setShowCarousel] = useState(false)
  const isComparing = compareIds.length > 0

  const compareLayouts = useMemo(
    () => compareIds.map(id => layouts.find(l => l.id === id)).filter(Boolean) as GridLayout[],
    [compareIds, layouts]
  )

  const toggleCompare = useCallback((layoutId: string) => {
    setCompareIds(prev => {
      if (prev.includes(layoutId)) return prev.filter(id => id !== layoutId)
      if (prev.length >= 3) return prev
      return [...prev, layoutId]
    })
  }, [])

  const handleShuffle = useCallback(() => {
    if (layouts.length <= 1) return
    let randomId: string
    do {
      randomId = layouts[Math.floor(Math.random() * layouts.length)].id
    } while (randomId === selectedLayoutId && layouts.length > 1)
    onLayoutSelect(randomId)
  }, [layouts, selectedLayoutId, onLayoutSelect])

  if (layouts.length === 0) {
    return (
      <Card className="p-8">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto bg-secondary/50 rounded-full flex items-center justify-center mb-4">
            <GridFour className="w-8 h-8 text-muted-foreground" weight="duotone" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No Layouts Available</h3>
          <p className="text-sm text-muted-foreground">
            Upload at least one photo to see layout options
          </p>
        </div>
      </Card>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">
          Layout Options
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {layouts.length} {layouts.length === 1 ? 'layout' : 'layouts'}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleShuffle}
            title="Shuffle layout"
          >
            <Shuffle className="w-4 h-4" weight="bold" />
          </Button>
          <Button
            variant={isComparing ? "default" : "ghost"}
            size="sm"
            onClick={() => setCompareIds(isComparing ? [] : (selectedLayoutId ? [selectedLayoutId] : []))}
            title={isComparing ? "Exit comparison" : "Compare layouts"}
          >
            <Columns className="w-4 h-4" weight="bold" />
          </Button>
          {onArrangementApply && photos.length > 0 && (
            <Button
              variant={showCarousel ? "default" : "ghost"}
              size="sm"
              onClick={() => {
                setShowCarousel(prev => !prev)
                if (!showCarousel) setCompareIds([])
              }}
              title={showCarousel ? "Close arrangements" : "Explore arrangements"}
            >
              <MagicWand className="w-4 h-4" weight="bold" />
            </Button>
          )}
        </div>
      </div>

      {showCarousel && onArrangementApply && (
        <ArrangementCarousel
          layouts={layouts}
          photos={photos}
          currentLayoutId={selectedLayoutId}
          currentPositions={photoPositions}
          onApply={(layoutId, positions) => {
            onArrangementApply(layoutId, positions)
            setShowCarousel(false)
          }}
          onClose={() => setShowCarousel(false)}
        />
      )}

      {isComparing && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="mb-4"
        >
          <div className="p-3 bg-muted/50 rounded-lg border border-border/50">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium">
                Comparing {compareLayouts.length}/3 layouts
                <span className="text-muted-foreground ml-1">(click layouts below to add)</span>
              </p>
              <Button variant="ghost" size="sm" onClick={() => setCompareIds([])}>
                Clear
              </Button>
            </div>
            <div className={cn(
              "grid gap-4",
              compareLayouts.length === 1 && "grid-cols-1 max-w-sm mx-auto",
              compareLayouts.length === 2 && "grid-cols-2",
              compareLayouts.length === 3 && "grid-cols-3",
            )}>
              <AnimatePresence>
                {compareLayouts.map(layout => (
                  <CompareCard
                    key={layout.id}
                    layout={layout}
                    photos={photos}
                    photoPositions={photoPositions}
                    isSelected={selectedLayoutId === layout.id}
                    onSelect={() => {
                      onLayoutSelect(layout.id)
                      setCompareIds([])
                    }}
                    onRemove={() => toggleCompare(layout.id)}
                  />
                ))}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      )}

      <ScrollArea className="h-[400px] pr-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {layouts.map((layout) => (
            <div key={layout.id} className="relative">
              <LayoutOption
                layout={layout}
                photos={photos}
                photoPositions={photoPositions}
                isSelected={selectedLayoutId === layout.id}
                onSelect={() => {
                  if (isComparing) {
                    toggleCompare(layout.id)
                  } else {
                    onLayoutSelect(layout.id)
                  }
                }}
              />
              {isComparing && compareIds.includes(layout.id) && (
                <div className="absolute top-1 left-1 w-5 h-5 bg-accent rounded-full flex items-center justify-center text-accent-foreground text-xs font-bold">
                  {compareIds.indexOf(layout.id) + 1}
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
