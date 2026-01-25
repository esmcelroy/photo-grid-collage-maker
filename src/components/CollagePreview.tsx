import { useState } from 'react'
import { GridLayout, PhotoPosition, UploadedPhoto, CollageSettings } from '@/lib/types'
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

  const getPhotoForArea = (area: string): UploadedPhoto | undefined => {
    const position = photoPositions.find(p => p.gridArea === area)
    if (!position) return undefined
    return photos.find(p => p.id === position.photoId)
  }

  const handleDragStart = (area: string) => {
    setDraggedArea(area)
  }

  const handleDragOver = (e: React.DragEvent, area: string) => {
    e.preventDefault()
    setDragOverArea(area)
  }

  const handleDrop = (targetArea: string) => {
    if (!draggedArea || draggedArea === targetArea) {
      setDraggedArea(null)
      setDragOverArea(null)
      return
    }

    const newPositions = [...photoPositions]
    const draggedIndex = newPositions.findIndex(p => p.gridArea === draggedArea)
    const targetIndex = newPositions.findIndex(p => p.gridArea === targetArea)

    if (draggedIndex !== -1 && targetIndex !== -1) {
      const temp = newPositions[draggedIndex].photoId
      newPositions[draggedIndex].photoId = newPositions[targetIndex].photoId
      newPositions[targetIndex].photoId = temp
    }

    onPositionsChange(newPositions)
    setDraggedArea(null)
    setDragOverArea(null)
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
        {layout.areas.map((area) => {
          const photo = getPhotoForArea(area)
          const isDragging = draggedArea === area
          const isDragOver = dragOverArea === area

          return (
            <div
              key={area}
              draggable={!!photo}
              onDragStart={() => handleDragStart(area)}
              onDragOver={(e) => handleDragOver(e, area)}
              onDrop={() => handleDrop(area)}
              onDragEnd={() => {
                setDraggedArea(null)
                setDragOverArea(null)
              }}
              style={{ 
                gridArea: area,
                borderRadius: `${settings.borderRadius}px`,
              }}
              className={cn(
                "relative bg-muted overflow-hidden transition-all duration-200 group",
                photo && "cursor-move",
                isDragging && "opacity-50 scale-95",
                isDragOver && "ring-2 ring-accent scale-[1.02]"
              )}
            >
              {photo ? (
                <>
                  <img
                    src={photo.dataUrl}
                    alt=""
                    className="w-full h-full object-cover select-none"
                    draggable={false}
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-200 flex items-center justify-center">
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
