import { useState, useCallback, useRef } from 'react'
import { GridLayout, PhotoPosition, UploadedPhoto, CollageSettings } from '@/lib/types'
import { getUniqueAreaNames } from '@/lib/layouts'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { ArrowsOutSimple } from '@phosphor-icons/react'

interface CollagePreviewProps {
  layout: GridLayout
  photos: UploadedPhoto[]
  photoPositions: PhotoPosition[]
  settings: CollageSettings
  onPositionsChange: (positions: PhotoPosition[]) => void
  previewRef?: React.RefObject<HTMLDivElement | null>
}

export function CollagePreview({
  layout,
  photos,
  photoPositions,
  settings,
  onPositionsChange,
  previewRef
}: CollagePreviewProps) {
  const [draggedArea, setDraggedArea] = useState<string | null>(null)
  const [dragOverArea, setDragOverArea] = useState<string | null>(null)
  const [selectedArea, setSelectedArea] = useState<string | null>(null)

  // Touch drag state
  const touchDragRef = useRef<{
    area: string
    startX: number
    startY: number
    ghostEl: HTMLDivElement | null
  } | null>(null)

  const getPhotoForArea = (area: string): UploadedPhoto | undefined => {
    const position = photoPositions.find(p => p.gridArea === area)
    if (!position) return undefined
    return photos.find(p => p.id === position.photoId)
  }

  const swapPositions = useCallback((fromArea: string, toArea: string) => {
    if (fromArea === toArea) return

    const newPositions = photoPositions.map(p => {
      if (p.gridArea === fromArea) {
        const targetPosition = photoPositions.find(pp => pp.gridArea === toArea)
        return { ...p, photoId: targetPosition?.photoId ?? p.photoId }
      }
      if (p.gridArea === toArea) {
        const sourcePosition = photoPositions.find(pp => pp.gridArea === fromArea)
        return { ...p, photoId: sourcePosition?.photoId ?? p.photoId }
      }
      return { ...p }
    })

    onPositionsChange(newPositions)
  }, [photoPositions, onPositionsChange])

  // --- HTML5 Drag and Drop handlers ---

  const handleDragStart = (e: React.DragEvent, area: string) => {
    setDraggedArea(area)
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move'

      // Custom drag ghost: use the photo thumbnail
      const img = (e.target as HTMLElement).querySelector('img')
      if (img) {
        e.dataTransfer.setDragImage(img, img.width / 2, img.height / 2)
      }
    }
  }

  const handleDragOver = (e: React.DragEvent, area: string) => {
    e.preventDefault()
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move'
    }
    setDragOverArea(area)
  }

  const handleDrop = (targetArea: string) => {
    if (draggedArea && draggedArea !== targetArea) {
      swapPositions(draggedArea, targetArea)
    }
    setDraggedArea(null)
    setDragOverArea(null)
  }

  const handleDragEnd = () => {
    setDraggedArea(null)
    setDragOverArea(null)
  }

  // --- Touch drag handlers (mobile) ---

  /* istanbul ignore next -- touch events not supported in jsdom */
  const handleTouchStart = (e: React.TouchEvent, area: string) => {
    const photo = getPhotoForArea(area)
    if (!photo) return

    const touch = e.touches[0]
    touchDragRef.current = {
      area,
      startX: touch.clientX,
      startY: touch.clientY,
      ghostEl: null,
    }

    // Create ghost element after a short delay to distinguish taps from drags
    const el = e.currentTarget as HTMLElement
    const rect = el.getBoundingClientRect()
    const ghost = document.createElement('div')
    ghost.style.cssText = `
      position: fixed;
      width: ${rect.width}px;
      height: ${rect.height}px;
      pointer-events: none;
      opacity: 0.8;
      z-index: 9999;
      border-radius: ${settings.borderRadius}px;
      overflow: hidden;
      left: ${rect.left}px;
      top: ${rect.top}px;
      transition: none;
    `
    const img = document.createElement('img')
    img.src = photo.dataUrl
    img.style.cssText = 'width: 100%; height: 100%; object-fit: cover;'
    ghost.appendChild(img)
    touchDragRef.current.ghostEl = ghost

    setDraggedArea(area)
  }

  /* istanbul ignore next -- touch events not supported in jsdom */
  const handleTouchMove = (e: React.TouchEvent) => {
    const state = touchDragRef.current
    if (!state) return

    const touch = e.touches[0]

    // Only show ghost after moving 10px (prevents accidental drags)
    const dx = touch.clientX - state.startX
    const dy = touch.clientY - state.startY
    if (!state.ghostEl?.parentNode && Math.sqrt(dx * dx + dy * dy) > 10) {
      document.body.appendChild(state.ghostEl!)
    }

    if (state.ghostEl?.parentNode) {
      e.preventDefault() // Prevent scroll while dragging
      const rect = state.ghostEl.getBoundingClientRect()
      state.ghostEl.style.left = `${touch.clientX - rect.width / 2}px`
      state.ghostEl.style.top = `${touch.clientY - rect.height / 2}px`
    }

    // Find which grid cell is under the touch point
    const elemBelow = document.elementFromPoint(touch.clientX, touch.clientY)
    const gridCell = elemBelow?.closest('[data-grid-area]') as HTMLElement | null
    setDragOverArea(gridCell?.dataset.gridArea ?? null)
  }

  /* istanbul ignore next -- touch events not supported in jsdom */
  const handleTouchEnd = () => {
    const state = touchDragRef.current
    if (state) {
      if (state.ghostEl?.parentNode) {
        state.ghostEl.remove()
      }
      if (dragOverArea && dragOverArea !== state.area) {
        swapPositions(state.area, dragOverArea)
      }
    }
    touchDragRef.current = null
    setDraggedArea(null)
    setDragOverArea(null)
  }

  // --- Keyboard/click-to-swap handler ---

  const handleSlotClick = (area: string) => {
    const photo = getPhotoForArea(area)
    if (!photo) return

    if (!selectedArea) {
      setSelectedArea(area)
    } else if (selectedArea === area) {
      setSelectedArea(null)
    } else {
      swapPositions(selectedArea, area)
      setSelectedArea(null)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent, area: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleSlotClick(area)
    } else if (e.key === 'Escape') {
      setSelectedArea(null)
    }
  }

  const gridTemplateAreas = layout.areas.map(area => `"${area}"`).join(' ')
  const { rows, columns } = parseTemplate(layout.gridTemplate)

  const backgroundColor = settings.backgroundColor === 'transparent' 
    ? 'transparent' 
    : settings.backgroundColor

  return (
    <Card className="p-6">
      <div
        ref={previewRef}
        className="w-full mx-auto rounded-lg overflow-hidden"
        style={{
          aspectRatio: layout.aspectRatio || '1/1',
          display: 'grid',
          gridTemplateRows: rows.join(' '),
          gridTemplateColumns: columns.join(' '),
          gridTemplateAreas,
          gap: `${settings.gap}px`,
          backgroundColor,
          padding: backgroundColor !== 'transparent' ? `${settings.gap}px` : '0',
        }}
      >
        {getUniqueAreaNames(layout.areas).map((area) => {
          const photo = getPhotoForArea(area)
          const isDragging = draggedArea === area
          const isDragOver = dragOverArea === area && draggedArea !== area
          const isSelected = selectedArea === area
          const isSwapTarget = selectedArea !== null && selectedArea !== area && !!photo

          return (
            <div
              key={area}
              data-grid-area={area}
              draggable={!!photo}
              tabIndex={photo ? 0 : -1}
              role={photo ? 'button' : undefined}
              aria-label={
                photo
                  ? isSelected
                    ? `Photo slot ${area}, selected — click another slot to swap`
                    : `Photo slot ${area}, click or drag to reorder`
                  : `Empty slot ${area}`
              }
              aria-pressed={isSelected || undefined}
              onDragStart={(e) => handleDragStart(e, area)}
              onDragOver={(e) => handleDragOver(e, area)}
              onDragLeave={() => setDragOverArea(null)}
              onDrop={() => handleDrop(area)}
              onDragEnd={handleDragEnd}
              onTouchStart={(e) => handleTouchStart(e, area)}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onClick={() => handleSlotClick(area)}
              onKeyDown={(e) => handleKeyDown(e, area)}
              style={{ 
                gridArea: area,
                borderRadius: `${settings.borderRadius}px`,
              }}
              className={cn(
                "relative bg-muted overflow-hidden transition-all duration-200 group",
                photo && "cursor-move",
                isDragging && "opacity-50 scale-95",
                isDragOver && "ring-2 ring-accent scale-[1.02]",
                isSelected && "ring-2 ring-primary ring-offset-2",
                isSwapTarget && "ring-1 ring-primary/40",
              )}
            >
              {photo ? (
                <>
                  <img
                    src={photo.dataUrl}
                    alt=""
                    className="w-full h-full object-cover select-none pointer-events-none"
                    draggable={false}
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-200 flex items-center justify-center pointer-events-none">
                    <div className="opacity-0 group-hover:opacity-100 transition-all duration-200 bg-white/90 rounded-full p-3 backdrop-blur-sm">
                      <ArrowsOutSimple className="w-6 h-6 text-primary" weight="bold" />
                    </div>
                  </div>
                </>
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="w-12 h-12 bg-border rounded-lg" />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function parseTemplate(template: string): { rows: string[], columns: string[] } {
  const parts = template.split('/')
  
  if (parts.length === 1) {
    return {
      rows: ['1fr'],
      columns: parts[0].trim().split(' ')
    }
  }
  
  const [rows, cols] = parts
  
  return {
    rows: rows.trim().split(' '),
    columns: cols ? cols.trim().split(' ') : ['1fr']
  }
}
