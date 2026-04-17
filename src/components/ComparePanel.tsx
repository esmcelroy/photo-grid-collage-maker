import { GridLayout, PhotoPosition, UploadedPhoto } from '@/lib/types'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { X } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { getUniqueAreaNames } from '@/lib/layouts'

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

interface ComparePanelProps {
  layouts: GridLayout[]
  compareIds: string[]
  photos: UploadedPhoto[]
  photoPositions: PhotoPosition[]
  selectedLayoutId: string | null
  onLayoutSelect: (layoutId: string) => void
  onClearCompare: () => void
  onToggleCompare: (layoutId: string) => void
}

export function ComparePanel({
  layouts,
  compareIds,
  photos,
  photoPositions,
  selectedLayoutId,
  onLayoutSelect,
  onClearCompare,
  onToggleCompare,
}: ComparePanelProps) {
  const compareLayouts = compareIds
    .map(id => layouts.find(l => l.id === id))
    .filter(Boolean) as GridLayout[]

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
    >
      <div className="p-4 bg-muted/50 rounded-lg border border-border/50">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-medium">
            Comparing {compareLayouts.length}/3 layouts
            <span className="text-muted-foreground ml-1">(click layouts in the sidebar to add)</span>
          </p>
          <Button variant="ghost" size="sm" onClick={onClearCompare}>
            Clear
          </Button>
        </div>
        <div className={cn(
          "grid gap-4",
          compareLayouts.length === 1 && "grid-cols-1 max-w-md mx-auto",
          compareLayouts.length === 2 && "grid-cols-2 max-w-2xl mx-auto",
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
                  onClearCompare()
                }}
                onRemove={() => onToggleCompare(layout.id)}
              />
            ))}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  )
}
