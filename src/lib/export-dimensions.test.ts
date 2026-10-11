import { describe, expect, it } from '@jest/globals'
import {
  EXPORT_DIMENSION_PRESETS,
  getPresetDimensions,
  validateExportDimensions,
} from '@/lib/export-dimensions'

describe('export dimensions', () => {
  it('derives each preset from the collage aspect ratio', () => {
    const dimensions = getPresetDimensions(EXPORT_DIMENSION_PRESETS[0], 3 / 2)

    expect(dimensions).toEqual({ width: 1920, height: 1280 })
  })

  it('rejects non-integer, oversized, and excessive-memory dimensions before rendering', () => {
    expect(validateExportDimensions(100.5, 100)).toMatch(/whole pixels/i)
    expect(validateExportDimensions(8193, 100)).toMatch(/8192/i)
    expect(validateExportDimensions(8000, 8000)).toMatch(/40 megapixels/i)
  })

  it('accepts safe exact pixel dimensions', () => {
    expect(validateExportDimensions(1080, 1350)).toBeNull()
  })
})
