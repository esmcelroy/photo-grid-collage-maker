export const MAX_EXPORT_DIMENSION = 8192
export const MAX_EXPORT_PIXELS = 40_000_000

export interface ExportDimensionPreset {
  id: string
  label: string
  longestEdge: number
  description: string
}

export const EXPORT_DIMENSION_PRESETS: readonly ExportDimensionPreset[] = [
  {
    id: 'web',
    label: 'Web HD',
    longestEdge: 1920,
    description: '1920px longest edge',
  },
  {
    id: 'social',
    label: 'Social',
    longestEdge: 1080,
    description: '1080px longest edge',
  },
  {
    id: 'print',
    label: 'Print',
    longestEdge: 2400,
    description: '2400px longest edge (8in at 300 DPI)',
  },
]

export function getPresetDimensions(
  preset: ExportDimensionPreset,
  aspectRatio: number
): { width: number; height: number } {
  if (aspectRatio >= 1) {
    return { width: preset.longestEdge, height: Math.round(preset.longestEdge / aspectRatio) }
  }

  return { width: Math.round(preset.longestEdge * aspectRatio), height: preset.longestEdge }
}

export function validateExportDimensions(width: number, height: number): string | null {
  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    return 'Width and height must be whole pixels.'
  }
  if (width < 1 || height < 1) {
    return 'Width and height must be at least 1 pixel.'
  }
  if (width > MAX_EXPORT_DIMENSION || height > MAX_EXPORT_DIMENSION) {
    return `Each dimension must be ${MAX_EXPORT_DIMENSION}px or smaller.`
  }
  if (width * height > MAX_EXPORT_PIXELS) {
    return 'Export size must be 40 megapixels or smaller to avoid exhausting browser memory.'
  }
  return null
}
