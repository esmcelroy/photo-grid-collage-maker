import { CollageSettings } from '@/lib/types'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Palette } from '@phosphor-icons/react'

interface CustomizationControlsProps {
  settings: CollageSettings
  onSettingsChange: (settings: CollageSettings) => void
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
  onSettingsChange
}: CustomizationControlsProps) {
  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-6">Customize</h3>
      
      <div className="space-y-6">
        <div>
          <div className="flex items-center justify-between mb-3">
            <Label htmlFor="gap-slider" className="text-sm font-medium">
              Photo Spacing
            </Label>
            <span className="text-sm text-muted-foreground">{settings.gap}px</span>
          </div>
          <Slider
            id="gap-slider"
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

        <div>
          <div className="flex items-center justify-between mb-3">
            <Label htmlFor="radius-slider" className="text-sm font-medium">
              Corner Radius
            </Label>
            <span className="text-sm text-muted-foreground">{settings.borderRadius}px</span>
          </div>
          <Slider
            id="radius-slider"
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

        <div>
          <Label className="text-sm font-medium mb-3 block">
            Background Color
          </Label>
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
    </Card>
  )
}
