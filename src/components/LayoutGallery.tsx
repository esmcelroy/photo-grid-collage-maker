import { GridLayout, PhotoPosition, UploadedPhoto } from '@/lib/types'
import { LayoutOption } from './LayoutOption'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Card } from '@/components/ui/card'
import { GridFour } from '@phosphor-icons/react'

interface LayoutGalleryProps {
  layouts: GridLayout[]
  photos: UploadedPhoto[]
  photoPositions: PhotoPosition[]
  selectedLayoutId: string | null
  onLayoutSelect: (layoutId: string) => void
}

export function LayoutGallery({
  layouts,
  photos,
  photoPositions,
  selectedLayoutId,
  onLayoutSelect
}: LayoutGalleryProps) {
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
        <span className="text-sm text-muted-foreground">
          {layouts.length} {layouts.length === 1 ? 'layout' : 'layouts'}
        </span>
      </div>
      
      <ScrollArea className="h-[400px] pr-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {layouts.map((layout) => (
            <LayoutOption
              key={layout.id}
              layout={layout}
              photos={photos}
              photoPositions={photoPositions}
              isSelected={selectedLayoutId === layout.id}
              onSelect={() => onLayoutSelect(layout.id)}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
