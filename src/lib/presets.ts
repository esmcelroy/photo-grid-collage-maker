import { CollageSettings } from './types'

export interface CollagePreset {
  id: string
  name: string
  settings: CollageSettings
  isCustom?: boolean
}

export const BUILT_IN_PRESETS: CollagePreset[] = [
  {
    id: 'clean-white',
    name: 'Clean White',
    settings: { gap: 4, backgroundColor: '#ffffff', borderRadius: 0 },
  },
  {
    id: 'dark-moody',
    name: 'Dark Moody',
    settings: { gap: 8, backgroundColor: '#1a1a1a', borderRadius: 8 },
  },
  {
    id: 'soft-pastel',
    name: 'Soft Pastel',
    settings: { gap: 12, backgroundColor: '#f5f0ff', borderRadius: 16 },
  },
  {
    id: 'polaroid',
    name: 'Polaroid',
    settings: { gap: 16, backgroundColor: '#faf8f0', borderRadius: 4 },
  },
  {
    id: 'minimal',
    name: 'Minimal',
    settings: { gap: 2, backgroundColor: 'transparent', borderRadius: 0 },
  },
  {
    id: 'bold-black',
    name: 'Bold Black',
    settings: { gap: 6, backgroundColor: '#000000', borderRadius: 12 },
  },
]

const CUSTOM_PRESETS_KEY = 'collage-custom-presets'

export function loadCustomPresets(): CollagePreset[] {
  try {
    const raw = localStorage.getItem(CUSTOM_PRESETS_KEY)
    if (!raw) return []
    return JSON.parse(raw) as CollagePreset[]
  } catch {
    return []
  }
}

export function saveCustomPresets(presets: CollagePreset[]): void {
  localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(presets))
}

export function getAllPresets(customPresets: CollagePreset[]): CollagePreset[] {
  return [...BUILT_IN_PRESETS, ...customPresets]
}
