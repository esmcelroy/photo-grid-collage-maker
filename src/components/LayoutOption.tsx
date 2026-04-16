import { GridLayout, PhotoPosition, UploadedPhoto } from '@/lib/types'
import { getUniqueAreaNames } from '@/lib/layouts'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'

interface LayoutOptionProps {
  layout: GridLayout
  photos: UploadedPhoto[]
  photoPositions: PhotoPosition[]
  isSelected: boolean
  onSelect: () => void
}

export function LayoutOption({ 
  layout, 
  photos, 
  photoPositions,
  isSelected, 
  onSelect 
}: LayoutOptionProps) {
  const getPhotoForArea = (area: string): UploadedPhoto | undefined => {
    const position = photoPositions.find(p => p.gridArea === area)
    if (!position) return undefined
    return photos.find(p => p.id === position.photoId)
  }

  const gridTemplateAreas = layout.areas.map(area => `"${area}"`).join(' ')
  
  const { rows, columns } = parseTemplate(layout.gridTemplate)

  return (
    <Card
      className={cn(
        "relative cursor-pointer transition-all duration-300 overflow-hidden group",
        "hover:shadow-lg hover:scale-[1.02]",
        isSelected 
          ? "ring-2 ring-accent shadow-md bg-accent/5" 
          : "hover:ring-2 hover:ring-accent/50"
      )}
      onClick={onSelect}
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
                  "relative bg-muted overflow-hidden",
                  !photo && "flex items-center justify-center"
                )}
              >
                {photo ? (
                  <img
                    src={photo.dataUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-4 h-4 bg-border rounded-sm" />
                )}
              </div>
            )
          })}
        </div>
        
        <p className={cn(
          "text-xs font-medium text-center mt-2 transition-colors",
          isSelected ? "text-accent" : "text-muted-foreground"
        )}>
          {layout.name}
        </p>
      </div>
      
      {isSelected && (
        <div className="absolute top-2 right-2 w-5 h-5 bg-accent rounded-full flex items-center justify-center">
          <div className="w-2 h-2 bg-white rounded-full" />
        </div>
      )}
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
