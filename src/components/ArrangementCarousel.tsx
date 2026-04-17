import { useState, useMemo, useCallback } from 'react'
import { GridLayout, PhotoPosition, UploadedPhoto } from '@/lib/types'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowsClockwise, Check, X } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { getUniqueAreaNames } from '@/lib/layouts'

interface Arrangement {
  layout: GridLayout
  positions: PhotoPosition[]
}

interface ArrangementCarouselProps {
  layouts: GridLayout[]
  photos: UploadedPhoto[]
  currentLayoutId: string | null
  currentPositions: PhotoPosition[]
  onApply: (layoutId: string, positions: PhotoPosition[]) => void
  onClose: () => void
}

function parseTemplate(template: string): { rows: string[], columns: string[] } {
  const parts = template.split('/')
  if (parts.length === 1) {
    return { rows: ['1fr'], columns: parts[0].trim().split(' ') }
  }
  const [rows, cols] = parts
  return { rows: rows.trim().split(' '), columns: cols ? cols.trim().split(' ') : ['1fr'] }
}

function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

function generateArrangements(
  layouts: GridLayout[],
  photos: UploadedPhoto[],
  currentLayoutId: string | null,
  currentPositions: PhotoPosition[],
  count: number
): Arrangement[] {
  if (layouts.length === 0 || photos.length === 0) return []

  const arrangements: Arrangement[] = []
  const seen = new Set<string>()

  // Serialize for dedup
  const key = (layout: GridLayout, positions: PhotoPosition[]) =>
    `${layout.id}:${positions.map(p => `${p.gridArea}=${p.photoId}`).sort().join(',')}`

  // Add current arrangement first if it exists
  if (currentLayoutId) {
    const currentLayout = layouts.find(l => l.id === currentLayoutId)
    if (currentLayout) {
      const currentKey = key(currentLayout, currentPositions)
      seen.add(currentKey)
    }
  }

  let attempts = 0
  const maxAttempts = count * 10

  while (arrangements.length < count && attempts < maxAttempts) {
    attempts++
    const layout = layouts[Math.floor(Math.random() * layouts.length)]
    const areas = getUniqueAreaNames(layout.areas)
    const shuffledPhotos = shuffleArray(photos)

    const positions: PhotoPosition[] = areas.map((area, i) => ({
      photoId: shuffledPhotos[i]?.id || '',
      gridArea: area,
    }))

    const k = key(layout, positions)
    if (!seen.has(k)) {
      seen.add(k)
      arrangements.push({ layout, positions })
    }
  }

  return arrangements
}

function ArrangementCard({
  arrangement,
  photos,
  isCurrentLayout,
  onApply,
}: {
  arrangement: Arrangement
  photos: UploadedPhoto[]
  isCurrentLayout: boolean
  onApply: () => void
}) {
  const { layout, positions } = arrangement

  const getPhotoForArea = (area: string): UploadedPhoto | undefined => {
    const position = positions.find(p => p.gridArea === area)
    if (!position) return undefined
    return photos.find(p => p.id === position.photoId)
  }

  const gridTemplateAreas = layout.areas.map(area => `"${area}"`).join(' ')
  const { rows, columns } = parseTemplate(layout.gridTemplate)

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <Card
        className={cn(
          "relative cursor-pointer transition-all duration-300 overflow-hidden",
          "hover:ring-2 hover:ring-accent/50 hover:shadow-md"
        )}
        onClick={onApply}
      >
        <div className="p-3">
          <div
            className="w-full rounded-lg overflow-hidden"
            style={{
              aspectRatio: layout.aspectRatio || '1/1',
              display: 'grid',
              gridTemplateRows: rows.join(' '),
              gridTemplateColumns: columns.join(' '),
              gridTemplateAreas,
              gap: '2px',
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
                    <div className="w-4 h-4 bg-border rounded-sm" />
                  )}
                </div>
              )
            })}
          </div>
          <div className="flex items-center justify-between mt-2">
            <p className="text-xs font-medium text-muted-foreground truncate">
              {layout.name}
            </p>
            {isCurrentLayout && (
              <span className="text-xs text-accent font-medium flex items-center gap-0.5">
                <Check className="w-3 h-3" weight="bold" /> Layout
              </span>
            )}
          </div>
        </div>
      </Card>
    </motion.div>
  )
}

export function ArrangementCarousel({
  layouts,
  photos,
  currentLayoutId,
  currentPositions,
  onApply,
  onClose,
}: ArrangementCarouselProps) {
  const [seed, setSeed] = useState(0)

  const arrangements = useMemo(
    () => generateArrangements(layouts, photos, currentLayoutId, currentPositions, 8),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layouts, photos, currentLayoutId, seed]
  )

  const handleRegenerate = useCallback(() => {
    setSeed(prev => prev + 1)
  }, [])

  if (photos.length === 0) return null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="mb-4"
    >
      <div className="p-3 bg-muted/50 rounded-lg border border-border/50">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium">
            Explore Arrangements
            <span className="text-muted-foreground ml-1">
              ({arrangements.length} options)
            </span>
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRegenerate}
              title="Generate new arrangements"
            >
              <ArrowsClockwise className="w-4 h-4" weight="bold" />
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" weight="bold" />
            </Button>
          </div>
        </div>

        {arrangements.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Upload photos and select a layout to see arrangement options.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {arrangements.map((arrangement, index) => (
              <ArrangementCard
                key={`${arrangement.layout.id}-${index}-${seed}`}
                arrangement={arrangement}
                photos={photos}
                isCurrentLayout={arrangement.layout.id === currentLayoutId}
                onApply={() => onApply(arrangement.layout.id, arrangement.positions)}
              />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}
