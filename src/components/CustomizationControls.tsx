import { useEffect, useMemo, useRef } from 'react'
import { CollageSettings } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Palette, Sparkle, CircleNotch } from '@phosphor-icons/react'
import type { DominantColor, SuggestedColor } from '@/lib/color-intelligence'
import { suggestBackgroundColors, averageLuminanceFromColors } from '@/lib/color-intelligence'
import type { DetectionMode } from '@/hooks/use-smart-position'
import type { WorkerStatus } from '@/lib/ml-worker-client'

interface CustomizationControlsProps {
  settings: CollageSettings
  onSettingsChange: (settings: CollageSettings) => void
  photoColors?: DominantColor[]
  smartPositionEnabled?: boolean
  detectionMode?: DetectionMode
  onDetectionModeChange?: (mode: DetectionMode) => void
  workerStatus?: WorkerStatus
}

const PRESET_COLORS = [
  { name: 'Transparent', value: 'transparent' },
  { name: 'White', value: '#FFFFFF' },
  { name: 'Black', value: '#000000' },
  { name: 'Cream', value: '#FAF9F6' },
  { name: 'Soft Pink', value: '#FFE4E8' },
  { name: 'Lavender', value: '#E6E6FA' },
  { name: 'Mint', value: '#E8F5E9' },
  { name: 'Sky Blue', value: '#E3F2FD' },
  { name: 'Peach', value: '#FFE5D9' },
  { name: 'Sage', value: '#D4E7D4' },
]

export function CustomizationControls({
  settings,
  onSettingsChange,
  photoColors,
  smartPositionEnabled,
  detectionMode,
  onDetectionModeChange,
  workerStatus,
}: CustomizationControlsProps) {
  const gapSliderRef = useRef<HTMLDivElement>(null)
  const radiusSliderRef = useRef<HTMLDivElement>(null)

  const suggestedColors: SuggestedColor[] = useMemo(() => {
    if (!photoColors || photoColors.length === 0) return []
    const avgLum = averageLuminanceFromColors(photoColors)
    return suggestBackgroundColors(photoColors, avgLum)
  }, [photoColors])

  // Radix Slider doesn't forward aria-label to Thumb, so inject it post-render
  useEffect(() => {
    gapSliderRef.current
      ?.querySelector('[role="slider"]')
      ?.setAttribute('aria-label', 'Photo spacing')
    radiusSliderRef.current
      ?.querySelector('[role="slider"]')
      ?.setAttribute('aria-label', 'Corner radius')
  })

  return (
    <div>
      <div className="space-y-6">
        <div ref={gapSliderRef}>
          <div className="flex items-center justify-between mb-3">
            <Label htmlFor="gap-slider" id="gap-slider-label" className="text-sm font-medium">
              Photo Spacing
            </Label>
            <span className="text-sm text-muted-foreground">{settings.gap}px</span>
          </div>
          <Slider
            id="gap-slider"
            aria-labelledby="gap-slider-label"
            min={0}
            max={40}
            step={2}
            value={[settings.gap]}
            onValueChange={(value) => 
              onSettingsChange({ ...settings, gap: value[0] })
            }
            className="w-full"
          />
        </div>

        <div ref={radiusSliderRef}>
          <div className="flex items-center justify-between mb-3">
            <Label htmlFor="radius-slider" id="radius-slider-label" className="text-sm font-medium">
              Corner Radius
            </Label>
            <span className="text-sm text-muted-foreground">{settings.borderRadius}px</span>
          </div>
          <Slider
            id="radius-slider"
            aria-labelledby="radius-slider-label"
            min={0}
            max={32}
            step={2}
            value={[settings.borderRadius]}
            onValueChange={(value) => 
              onSettingsChange({ ...settings, borderRadius: value[0] })
            }
            className="w-full"
          />
        </div>

        {smartPositionEnabled && onDetectionModeChange && (
          <div>
            <Label className="text-sm font-medium mb-3 block">
              Detection Mode
            </Label>
            <div className="space-y-2" role="radiogroup" aria-label="Detection mode">
              <label className="flex items-start gap-3 p-2.5 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                <input
                  type="radio"
                  name="detection-mode"
                  value="basic"
                  checked={detectionMode === 'basic'}
                  onChange={() => onDetectionModeChange('basic')}
                  className="mt-0.5 accent-primary"
                />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium">Basic</span>
                  <p className="text-xs text-muted-foreground mt-0.5">Edge-based positioning only. No downloads.</p>
                </div>
              </label>
              <label className="flex items-start gap-3 p-2.5 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                <input
                  type="radio"
                  name="detection-mode"
                  value="standard"
                  checked={detectionMode === 'standard'}
                  onChange={() => onDetectionModeChange('standard')}
                  className="mt-0.5 accent-primary"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Standard</span>
                    {workerStatus === 'loading' && (
                      <CircleNotch className="w-3.5 h-3.5 text-primary animate-spin" weight="bold" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    + Face detection. ~2 MB one-time download.
                  </p>
                </div>
              </label>
              <label className={cn(
                "flex items-start gap-3 p-2.5 rounded-lg transition-colors",
                detectionMode === 'advanced'
                  ? "bg-primary/5 ring-1 ring-primary/30"
                  : "hover:bg-muted/50 cursor-pointer"
              )}>
                <input
                  type="radio"
                  name="detection-mode"
                  value="advanced"
                  checked={detectionMode === 'advanced'}
                  onChange={() => onDetectionModeChange('advanced')}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium">Advanced</span>
                    {detectionMode === 'advanced' && workerStatus === 'loading' && (
                      <CircleNotch className="w-3.5 h-3.5 text-primary animate-spin" weight="bold" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    + Object detection (pets, food, etc). ~4 MB download.
                  </p>
                </div>
              </label>
            </div>
          </div>
        )}

        <div>
          <Label className="text-sm font-medium mb-3 block">
            Background Color
          </Label>
          {suggestedColors.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-1.5 mb-2">
                <Sparkle className="w-3.5 h-3.5 text-purple-500" weight="duotone" />
                <span className="text-xs font-medium text-muted-foreground">Suggested for your photos</span>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {suggestedColors.map((color) => (
                  <button
                    key={color.hex}
                    onClick={() =>
                      onSettingsChange({ ...settings, backgroundColor: color.hex })
                    }
                    className="group relative aspect-square rounded-lg overflow-hidden border-2 transition-all hover:scale-105"
                    style={{
                      backgroundColor: color.hex,
                      borderColor: settings.backgroundColor === color.hex
                        ? '#7c3aed'
                        : '#d4d0dc'
                    }}
                    title={`${color.name}: ${color.reason}`}
                  >
                    {settings.backgroundColor === color.hex && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-2 h-2 bg-accent rounded-full" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-5 gap-2">
            {PRESET_COLORS.map((color) => (
              <button
                key={color.value}
                onClick={() => 
                  onSettingsChange({ ...settings, backgroundColor: color.value })
                }
                className="group relative aspect-square rounded-lg overflow-hidden border-2 transition-all hover:scale-105"
                style={{
                  backgroundColor: color.value === 'transparent' ? '#FFFFFF' : color.value,
                  borderColor: settings.backgroundColor === color.value 
                    ? '#7c3aed' 
                    : '#d4d0dc'
                }}
                title={color.name}
              >
                {color.value === 'transparent' && (
                  <div className="absolute inset-0 opacity-30"
                    style={{
                      backgroundImage: 
                        'linear-gradient(45deg, #ccc 25%, transparent 25%), ' +
                        'linear-gradient(-45deg, #ccc 25%, transparent 25%), ' +
                        'linear-gradient(45deg, transparent 75%, #ccc 75%), ' +
                        'linear-gradient(-45deg, transparent 75%, #ccc 75%)',
                      backgroundSize: '10px 10px',
                      backgroundPosition: '0 0, 0 5px, 5px -5px, -5px 0px'
                    }}
                  />
                )}
                {settings.backgroundColor === color.value && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-2 h-2 bg-accent rounded-full" />
                  </div>
                )}
              </button>
            ))}
          </div>
          
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full mt-3" size="sm">
                <Palette className="w-4 h-4 mr-2" weight="duotone" />
                Custom Color
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64">
              <div className="space-y-3">
                <Label htmlFor="custom-color" className="text-sm font-medium">
                  Pick a custom color
                </Label>
                <input
                  id="custom-color"
                  type="color"
                  value={settings.backgroundColor === 'transparent' ? '#FFFFFF' : settings.backgroundColor}
                  onChange={(e) => 
                    onSettingsChange({ ...settings, backgroundColor: e.target.value })
                  }
                  className="w-full h-20 rounded-lg border-2 border-border cursor-pointer"
                />
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  )
}
