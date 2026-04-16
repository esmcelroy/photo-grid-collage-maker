import { useState, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  ArrowCounterClockwise,
  ArrowClockwise,
  ArrowsOut,
  ArrowUUpLeft,
} from '@phosphor-icons/react'
import type { PhotoPosition, UploadedPhoto } from '@/lib/types'

interface PhotoEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  photo: UploadedPhoto
  position: PhotoPosition
  onApply: (updatedPosition: PhotoPosition) => void
}

export function PhotoEditDialog({
  open,
  onOpenChange,
  photo,
  position,
  onApply,
}: PhotoEditDialogProps) {
  const [rotation, setRotation] = useState(position.rotation ?? 0)
  const [scale, setScale] = useState(position.scale ?? 1)
  const [objectPosition, setObjectPosition] = useState(
    position.objectPosition ?? '50% 50%'
  )

  const resetToOpen = useCallback(() => {
    setRotation(position.rotation ?? 0)
    setScale(position.scale ?? 1)
    setObjectPosition(position.objectPosition ?? '50% 50%')
  }, [position])

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      resetToOpen()
    }
    onOpenChange(nextOpen)
  }

  const handleRotateStep = (direction: 'cw' | 'ccw') => {
    setRotation((prev) => {
      const step = direction === 'cw' ? 90 : -90
      return ((prev + step) % 360 + 360) % 360
    })
  }

  const handleReset = () => {
    setRotation(0)
    setScale(1)
    setObjectPosition('50% 50%')
  }

  const handleApply = () => {
    onApply({
      ...position,
      rotation: rotation === 0 ? undefined : rotation,
      scale: scale === 1 ? undefined : scale,
      objectPosition: objectPosition === '50% 50%' ? undefined : objectPosition,
    })
    onOpenChange(false)
  }

  // Parse objectPosition to x/y percentages for sliders
  const [posX, posY] = objectPosition.split(' ').map((v) => parseInt(v, 10))

  const handlePosChange = (axis: 'x' | 'y', value: number) => {
    const x = axis === 'x' ? value : posX
    const y = axis === 'y' ? value : posY
    setObjectPosition(`${x}% ${y}%`)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowsOut className="w-5 h-5" weight="duotone" />
            Edit Photo
          </DialogTitle>
          <DialogDescription>
            Adjust position, rotation, and zoom for this photo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Preview */}
          <div
            className="relative w-full aspect-video bg-muted rounded-lg overflow-hidden"
            aria-label="Photo preview"
          >
            <img
              src={photo.dataUrl}
              alt="Preview"
              className="w-full h-full object-cover"
              style={{
                objectPosition,
                transform: `rotate(${rotation}deg) scale(${scale})`,
              }}
            />
          </div>

          {/* Rotation */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Rotation</Label>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="icon"
                onClick={() => handleRotateStep('ccw')}
                aria-label="Rotate counter-clockwise"
              >
                <ArrowCounterClockwise className="w-4 h-4" weight="bold" />
              </Button>
              <span className="text-sm text-muted-foreground min-w-[3rem] text-center">
                {rotation}°
              </span>
              <Button
                variant="outline"
                size="icon"
                onClick={() => handleRotateStep('cw')}
                aria-label="Rotate clockwise"
              >
                <ArrowClockwise className="w-4 h-4" weight="bold" />
              </Button>
            </div>
          </div>

          {/* Zoom / Scale */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Zoom</Label>
              <span className="text-sm text-muted-foreground">{Math.round(scale * 100)}%</span>
            </div>
            <Slider
              min={50}
              max={300}
              step={5}
              value={[Math.round(scale * 100)]}
              onValueChange={([v]) => setScale(v / 100)}
              aria-label="Zoom level"
            />
          </div>

          {/* Pan / Object Position */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Position</Label>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-8">X</span>
                <Slider
                  min={0}
                  max={100}
                  step={1}
                  value={[posX]}
                  onValueChange={([v]) => handlePosChange('x', v)}
                  aria-label="Horizontal position"
                />
                <span className="text-xs text-muted-foreground w-8">{posX}%</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-8">Y</span>
                <Slider
                  min={0}
                  max={100}
                  step={1}
                  value={[posY]}
                  onValueChange={([v]) => handlePosChange('y', v)}
                  aria-label="Vertical position"
                />
                <span className="text-xs text-muted-foreground w-8">{posY}%</span>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex justify-between sm:justify-between">
          <Button variant="ghost" onClick={handleReset}>
            <ArrowUUpLeft className="w-4 h-4 mr-2" weight="bold" />
            Reset
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleApply}>
              Apply
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
