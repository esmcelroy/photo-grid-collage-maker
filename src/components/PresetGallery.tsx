import { useState, useEffect, useCallback } from 'react'
import { CollageSettings } from '@/lib/types'
import {
  CollagePreset,
  BUILT_IN_PRESETS,
  loadCustomPresets,
  saveCustomPresets,
  getAllPresets,
} from '@/lib/presets'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FloppyDisk, X } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

interface PresetGalleryProps {
  onApplyPreset: (settings: CollageSettings) => void
  currentSettings: CollageSettings
}

function settingsMatch(a: CollageSettings, b: CollageSettings): boolean {
  return (
    a.gap === b.gap &&
    a.backgroundColor === b.backgroundColor &&
    a.borderRadius === b.borderRadius
  )
}

export function PresetGallery({ onApplyPreset, currentSettings }: PresetGalleryProps) {
  const [customPresets, setCustomPresets] = useState<CollagePreset[]>([])
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [newPresetName, setNewPresetName] = useState('')

  useEffect(() => {
    setCustomPresets(loadCustomPresets())
  }, [])

  const allPresets = getAllPresets(customPresets)

  const handleSavePreset = useCallback(() => {
    const name = newPresetName.trim()
    if (!name) return

    const preset: CollagePreset = {
      id: `custom-${Date.now()}`,
      name,
      settings: { ...currentSettings },
      isCustom: true,
    }

    const updated = [...customPresets, preset]
    setCustomPresets(updated)
    saveCustomPresets(updated)
    setNewPresetName('')
    setShowSaveDialog(false)
  }, [newPresetName, currentSettings, customPresets])

  const handleDeletePreset = useCallback(
    (presetId: string) => {
      const updated = customPresets.filter((p) => p.id !== presetId)
      setCustomPresets(updated)
      saveCustomPresets(updated)
    },
    [customPresets],
  )

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Presets</h3>
        <Button variant="ghost" size="sm" onClick={() => setShowSaveDialog(true)}>
          <FloppyDisk className="w-4 h-4 mr-1" />
          Save Current
        </Button>
      </div>

      {showSaveDialog && (
        <div className="mb-3 p-3 bg-secondary/50 rounded-lg">
          <input
            type="text"
            className="w-full px-2 py-1 text-sm rounded border border-border bg-background"
            placeholder="Preset name"
            value={newPresetName}
            onChange={(e) => setNewPresetName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSavePreset()
            }}
            aria-label="Preset name"
          />
          <div className="flex gap-2 mt-2">
            <Button size="sm" onClick={handleSavePreset}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowSaveDialog(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {allPresets.map((preset) => {
          const isActive = settingsMatch(preset.settings, currentSettings)
          return (
            <button
              key={preset.id}
              onClick={() => onApplyPreset(preset.settings)}
              className={cn(
                'p-3 rounded-lg border text-left transition-all',
                isActive
                  ? 'border-accent bg-accent/10'
                  : 'border-border hover:border-accent/50',
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <div
                  className="w-6 h-6 rounded border border-border/50 shrink-0"
                  style={{ backgroundColor: preset.settings.backgroundColor }}
                />
                <span className="text-sm font-medium truncate">{preset.name}</span>
                {preset.isCustom && (
                  <button
                    aria-label={`Delete ${preset.name}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeletePreset(preset.id)
                    }}
                    className="ml-auto shrink-0"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Gap {preset.settings.gap}px · Radius {preset.settings.borderRadius}px
              </p>
            </button>
          )
        })}
      </div>
    </Card>
  )
}
