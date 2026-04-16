import { useState, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Slider } from '@/components/ui/slider'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { DownloadSimple, FileImage, FilePng, FileJpg } from '@phosphor-icons/react'
import type { ExportFormat, ExportOptions } from '@/lib/types'

interface ExportDialogProps {
  onExport: (options: ExportOptions) => void
  disabled?: boolean
}

export function ExportDialog({ onExport, disabled }: ExportDialogProps) {
  const [open, setOpen] = useState(false)
  const [format, setFormat] = useState<ExportFormat>('png')
  const [quality, setQuality] = useState(90)
  const [filename, setFilename] = useState('')

  const resetDefaults = useCallback(() => {
    setFormat('png')
    setQuality(90)
    setFilename('')
  }, [])

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setFilename(`collage-${Date.now()}`)
    }
    setOpen(nextOpen)
  }

  const handleExport = () => {
    const ext = format === 'jpeg' ? '.jpg' : '.png'
    const name = filename.trim() || `collage-${Date.now()}`
    const finalFilename = name.endsWith(ext) ? name : `${name}${ext}`

    onExport({
      format,
      quality: format === 'jpeg' ? quality / 100 : 1.0,
      filename: finalFilename,
    })

    setOpen(false)
    resetDefaults()
  }

  const estimatedSizeLabel = format === 'jpeg'
    ? `~${Math.round(quality * 0.15 + 2)}× smaller than PNG`
    : 'Lossless (largest file size)'

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="lg" disabled={disabled}>
          <DownloadSimple className="w-5 h-5 mr-2" weight="duotone" />
          Download
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileImage className="w-5 h-5" weight="duotone" />
            Export Collage
          </DialogTitle>
          <DialogDescription>
            Choose your export format and quality settings.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Format Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Format</Label>
            <RadioGroup
              value={format}
              onValueChange={(v) => setFormat(v as ExportFormat)}
              className="grid grid-cols-2 gap-3"
            >
              <Label
                htmlFor="format-png"
                className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5"
              >
                <RadioGroupItem value="png" id="format-png" />
                <div className="flex items-center gap-2">
                  <FilePng className="w-5 h-5 text-muted-foreground" weight="duotone" />
                  <div>
                    <div className="font-medium">PNG</div>
                    <div className="text-xs text-muted-foreground">Lossless</div>
                  </div>
                </div>
              </Label>
              <Label
                htmlFor="format-jpeg"
                className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5"
              >
                <RadioGroupItem value="jpeg" id="format-jpeg" />
                <div className="flex items-center gap-2">
                  <FileJpg className="w-5 h-5 text-muted-foreground" weight="duotone" />
                  <div>
                    <div className="font-medium">JPEG</div>
                    <div className="text-xs text-muted-foreground">Smaller files</div>
                  </div>
                </div>
              </Label>
            </RadioGroup>
          </div>

          {/* Quality Slider (JPEG only) */}
          {format === 'jpeg' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="quality-slider" className="text-sm font-medium">
                  Quality
                </Label>
                <span className="text-sm text-muted-foreground">{quality}%</span>
              </div>
              <Slider
                id="quality-slider"
                min={10}
                max={100}
                step={5}
                value={[quality]}
                onValueChange={([v]) => setQuality(v)}
                aria-label="JPEG quality"
              />
              <p className="text-xs text-muted-foreground">{estimatedSizeLabel}</p>
            </div>
          )}

          {format === 'png' && (
            <p className="text-xs text-muted-foreground">{estimatedSizeLabel}</p>
          )}

          {/* Filename Input */}
          <div className="space-y-2">
            <Label htmlFor="filename-input" className="text-sm font-medium">
              Filename
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="filename-input"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                placeholder="collage"
                className="flex-1"
              />
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                {format === 'jpeg' ? '.jpg' : '.png'}
              </span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleExport}>
            <DownloadSimple className="w-4 h-4 mr-2" weight="bold" />
            Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
