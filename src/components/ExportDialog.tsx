import { useState, useCallback, type ReactNode } from 'react'
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
import {
  EXPORT_DIMENSION_PRESETS,
  getPresetDimensions,
  validateExportDimensions,
} from '@/lib/export-dimensions'

interface ExportDialogProps {
  onExport: (options: ExportOptions) => Promise<void> | void
  disabled?: boolean
  trigger?: ReactNode
  aspectRatio: number
}

export function ExportDialog({ onExport, disabled, trigger, aspectRatio }: ExportDialogProps) {
  const [open, setOpen] = useState(false)
  const [format, setFormat] = useState<ExportFormat>('png')
  const [quality, setQuality] = useState(90)
  const [filename, setFilename] = useState('')
  const [width, setWidth] = useState(1920)
  const [height, setHeight] = useState(() => Math.round(1920 / aspectRatio))
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const resetDefaults = useCallback(() => {
    setFormat('png')
    setQuality(90)
    setFilename('')
    setError(null)
  }, [])

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setFilename(`collage-${Date.now()}`)
      const dimensions = getPresetDimensions(EXPORT_DIMENSION_PRESETS[0], aspectRatio)
      setWidth(dimensions.width)
      setHeight(dimensions.height)
      setError(null)
    }
    if (isExporting) return
    setOpen(nextOpen)
  }

  const applyPreset = (preset: typeof EXPORT_DIMENSION_PRESETS[number]) => {
    const dimensions = getPresetDimensions(preset, aspectRatio)
    setWidth(dimensions.width)
    setHeight(dimensions.height)
    setError(null)
  }

  const handleExport = async () => {
    const validationError = validateExportDimensions(width, height)
    if (validationError) {
      setError(validationError)
      return
    }

    const ext = format === 'jpeg' ? '.jpg' : '.png'
    const sanitized = filename.trim()
      .replace(/[/\\:*?"<>|]/g, '_')
      .replace(/\0/g, '')
      .replace(/^\.+/, '')
      .substring(0, 200)
    const name = sanitized || `collage-${Date.now()}`
    const finalFilename = name.endsWith(ext) ? name : `${name}${ext}`

    setIsExporting(true)
    setError(null)
    try {
      await onExport({
        format,
        quality: format === 'jpeg' ? quality / 100 : 1.0,
        filename: finalFilename,
        width,
        height,
      })
      setOpen(false)
      resetDefaults()
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Export failed. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }

  const estimatedSizeLabel = format === 'jpeg'
    ? `~${Math.round(quality * 0.15 + 2)}× smaller than PNG`
    : 'Lossless (largest file size)'

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger || (
          <Button size="lg" disabled={disabled}>
            <DownloadSimple className="w-5 h-5 mr-2" weight="duotone" />
            Download
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileImage className="w-5 h-5" weight="duotone" />
            Export Collage
          </DialogTitle>
          <DialogDescription>
            Choose your output size, format, and quality settings.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-3">
            <Label className="text-sm font-medium">Output size</Label>
            <div className="grid grid-cols-3 gap-2">
              {EXPORT_DIMENSION_PRESETS.map((preset) => {
                const dimensions = getPresetDimensions(preset, aspectRatio)
                return (
                  <Button
                    key={preset.id}
                    type="button"
                    variant="outline"
                    className="h-auto min-h-16 whitespace-normal py-2 text-left"
                    onClick={() => applyPreset(preset)}
                    disabled={isExporting}
                  >
                    <span>
                      <span className="block font-medium">{preset.label}</span>
                      <span className="block text-xs text-muted-foreground">{dimensions.width} × {dimensions.height}px</span>
                    </span>
                  </Button>
                )
              })}
            </div>
            <p className="text-xs text-muted-foreground">Print assumes 300 DPI; actual print size depends on your printer or print service.</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="export-width">Width (px)</Label>
                <Input id="export-width" type="number" min="1" max="8192" value={width} disabled={isExporting} onChange={(event) => setWidth(Number(event.target.value))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="export-height">Height (px)</Label>
                <Input id="export-height" type="number" min="1" max="8192" value={height} disabled={isExporting} onChange={(event) => setHeight(Number(event.target.value))} />
              </div>
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </div>

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
                disabled={isExporting}
              />
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                {format === 'jpeg' ? '.jpg' : '.png'}
              </span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isExporting}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={isExporting}>
            <DownloadSimple className="w-4 h-4 mr-2" weight="bold" />
            {isExporting ? 'Exporting…' : 'Export'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
