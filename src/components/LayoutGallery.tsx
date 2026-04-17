import { useCallback } from 'react'
import { GridLayout, PhotoPosition, UploadedPhoto } from '@/lib/types'
import { LayoutOption } from './LayoutOption'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { GridFour, Shuffle, Columns, MagicWand } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { getUniqueAreaNames } from '@/lib/layouts'

interface LayoutGalleryProps {
  layouts: GridLayout[]
  photos: UploadedPhoto[]
  photoPositions: PhotoPosition[]
  selectedLayoutId: string | null
  onLayoutSelect: (layoutId: string) => void
  onArrangementApply?: (layoutId: string, positions: PhotoPosition[]) => void
  showCarousel: boolean
  onToggleCarousel: () => void
  compareIds: string[]
  onToggleCompare: (layoutId?: string) => void
}

export function LayoutGallery({
  layouts,
  photos,
  photoPositions,
  selectedLayoutId,
  onLayoutSelect,
  onArrangementApply,
  showCarousel,
  onToggleCarousel,
  compareIds,
  onToggleCompare,
}: LayoutGalleryProps) {
  const isComparing = compareIds.length > 0

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
          <h2 className="text-lg font-semibold mb-2">No Layouts Available</h2>
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
        <h2 className="text-lg font-semibold">
          Layout Options
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {layouts.length} {layouts.length === 1 ? 'layout' : 'layouts'}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleShuffle}
            title="Shuffle layout"
            aria-label="Shuffle layout"
          >
            <Shuffle className="w-4 h-4" weight="bold" />
          </Button>
          <Button
            variant={isComparing ? "default" : "ghost"}
            size="sm"
            onClick={() => onToggleCompare(selectedLayoutId ?? undefined)}
            title={isComparing ? "Exit comparison" : "Compare layouts"}
            aria-label={isComparing ? "Exit comparison" : "Compare layouts"}
          >
            <Columns className="w-4 h-4" weight="bold" />
          </Button>
          {onArrangementApply && photos.length > 0 && (
            <Button
              variant={showCarousel ? "default" : "ghost"}
              size="sm"
              onClick={onToggleCarousel}
              title={showCarousel ? "Close arrangements" : "Explore arrangements"}
              aria-label={showCarousel ? "Close arrangements" : "Explore arrangements"}
            >
              <MagicWand className="w-4 h-4" weight="bold" />
            </Button>
          )}
        </div>
      </div>

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
                    onToggleCompare(layout.id)
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
