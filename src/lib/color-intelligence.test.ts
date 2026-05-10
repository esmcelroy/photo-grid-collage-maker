import { jest, describe, it, expect, beforeEach } from '@jest/globals'

// Mock colorthief before importing the module under test
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGetPalette = jest.fn<(...args: any[]) => Promise<any>>()
jest.unstable_mockModule('colorthief', () => ({
  getPalette: mockGetPalette,
}))

// Dynamic import of module under test after mock registration
const {
  relativeLuminance,
  isDarkPhoto,
  averageLuminanceFromColors,
  rgbToHsl,
  hslToHex,
  suggestBackgroundColors,
  hexToRgb,
  scoreColorHarmony,
  extractDominantColors,
} = await import('./color-intelligence')

function makeDominantColor(
  r: number, g: number, b: number,
  overrides: Partial<{ hex: string; proportion: number; isDark: boolean }> = {},
) {
  const hex = overrides.hex ?? `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
  return {
    r, g, b, hex,
    proportion: overrides.proportion ?? 0.2,
    isDark: overrides.isDark ?? false,
  }
}

describe('relativeLuminance', () => {
  it('returns 0 for pure black', () => {
    expect(relativeLuminance(0, 0, 0)).toBe(0)
  })

  it('returns 1 for pure white', () => {
    expect(relativeLuminance(255, 255, 255)).toBeCloseTo(1, 3)
  })

  it('returns intermediate value for mid-gray', () => {
    const lum = relativeLuminance(128, 128, 128)
    expect(lum).toBeGreaterThan(0.1)
    expect(lum).toBeLessThan(0.5)
  })
})

describe('isDarkPhoto', () => {
  it('returns false for empty color array', () => {
    expect(isDarkPhoto([])).toBe(false)
  })

  it('returns true for dark colors', () => {
    const darkColors = [
      makeDominantColor(20, 20, 30, { proportion: 0.5, isDark: true }),
      makeDominantColor(40, 10, 15, { proportion: 0.3, isDark: true }),
    ]
    expect(isDarkPhoto(darkColors)).toBe(true)
  })

  it('returns false for light colors', () => {
    const lightColors = [
      makeDominantColor(200, 210, 220, { proportion: 0.5 }),
      makeDominantColor(230, 240, 250, { proportion: 0.3 }),
    ]
    expect(isDarkPhoto(lightColors)).toBe(false)
  })
})

describe('averageLuminanceFromColors', () => {
  it('returns 0.5 for empty array', () => {
    expect(averageLuminanceFromColors([])).toBe(0.5)
  })

  it('weights by proportion when available', () => {
    const colors = [
      makeDominantColor(0, 0, 0, { proportion: 0.9 }),   // dark, dominant
      makeDominantColor(255, 255, 255, { proportion: 0.1 }), // light, minor
    ]
    const lum = averageLuminanceFromColors(colors)
    expect(lum).toBeLessThan(0.2) // heavily weighted toward black
  })

  it('falls back to equal weight when proportions are zero', () => {
    const colors = [
      makeDominantColor(0, 0, 0, { proportion: 0 }),
      makeDominantColor(255, 255, 255, { proportion: 0 }),
    ]
    const lum = averageLuminanceFromColors(colors)
    expect(lum).toBeCloseTo(0.5, 1)
  })
})

describe('rgbToHsl', () => {
  it('converts pure red', () => {
    const { h, s, l } = rgbToHsl(255, 0, 0)
    expect(h).toBe(0)
    expect(s).toBe(100)
    expect(l).toBe(50)
  })

  it('converts pure green', () => {
    const { h, s, l } = rgbToHsl(0, 255, 0)
    expect(h).toBe(120)
    expect(s).toBe(100)
    expect(l).toBe(50)
  })

  it('converts pure blue', () => {
    const { h, s, l } = rgbToHsl(0, 0, 255)
    expect(h).toBe(240)
    expect(s).toBe(100)
    expect(l).toBe(50)
  })

  it('converts gray to zero saturation', () => {
    const { s } = rgbToHsl(128, 128, 128)
    expect(s).toBe(0)
  })
})

describe('hslToHex', () => {
  it('converts red (0, 100, 50) to #ff0000', () => {
    expect(hslToHex(0, 100, 50)).toBe('#ff0000')
  })

  it('converts white (0, 0, 100) to #ffffff', () => {
    expect(hslToHex(0, 0, 100)).toBe('#ffffff')
  })

  it('converts black (0, 0, 0) to #000000', () => {
    expect(hslToHex(0, 0, 0)).toBe('#000000')
  })
})

describe('hexToRgb', () => {
  it('parses valid hex color', () => {
    expect(hexToRgb('#ff8040')).toEqual({ r: 255, g: 128, b: 64 })
  })

  it('returns null for invalid format', () => {
    expect(hexToRgb('not-a-color')).toBeNull()
    expect(hexToRgb('#fff')).toBeNull() // short form not supported
  })

  it('handles uppercase hex', () => {
    expect(hexToRgb('#AABBCC')).toEqual({ r: 170, g: 187, b: 204 })
  })
})

describe('suggestBackgroundColors', () => {
  it('returns empty array for no colors', () => {
    expect(suggestBackgroundColors([], 0.5)).toEqual([])
  })

  it('returns suggestions for warm-toned photos', () => {
    const warmColors = [
      makeDominantColor(200, 120, 80, { proportion: 0.4 }),
      makeDominantColor(180, 100, 60, { proportion: 0.3 }),
    ]
    const suggestions = suggestBackgroundColors(warmColors, 0.3)
    expect(suggestions.length).toBeGreaterThanOrEqual(3)
    expect(suggestions.some(s => s.name === 'Warm Neutral')).toBe(true)
  })

  it('returns suggestions for cool-toned photos', () => {
    const coolColors = [
      makeDominantColor(60, 100, 200, { proportion: 0.4 }),
      makeDominantColor(80, 120, 180, { proportion: 0.3 }),
    ]
    const suggestions = suggestBackgroundColors(coolColors, 0.3)
    expect(suggestions.length).toBeGreaterThanOrEqual(3)
    expect(suggestions.some(s => s.name === 'Cool Neutral')).toBe(true)
  })

  it('suggests dark background for light photos', () => {
    const lightColors = [
      makeDominantColor(220, 230, 240, { proportion: 0.5 }),
    ]
    const suggestions = suggestBackgroundColors(lightColors, 0.8)
    expect(suggestions.some(s => s.name === 'Deep Dark')).toBe(true)
  })

  it('suggests light background for dark photos', () => {
    const darkColors = [
      makeDominantColor(20, 25, 30, { proportion: 0.5, isDark: true }),
    ]
    const suggestions = suggestBackgroundColors(darkColors, 0.05)
    expect(suggestions.some(s => s.name === 'Clean White')).toBe(true)
  })

  it('skips hue-based suggestions for grayscale photos', () => {
    const grayColors = [
      makeDominantColor(128, 128, 128, { proportion: 0.5 }),
      makeDominantColor(200, 200, 200, { proportion: 0.3 }),
    ]
    const suggestions = suggestBackgroundColors(grayColors, 0.5)
    // Should not have Soft Tint or Complement (no chromatic content)
    expect(suggestions.some(s => s.name === 'Soft Tint')).toBe(false)
  })

  it('all suggestions have valid hex colors', () => {
    const colors = [
      makeDominantColor(150, 60, 90, { proportion: 0.4 }),
      makeDominantColor(80, 140, 100, { proportion: 0.3 }),
    ]
    const suggestions = suggestBackgroundColors(colors, 0.4)
    for (const s of suggestions) {
      expect(s.hex).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })
})

describe('scoreColorHarmony', () => {
  it('returns 0 for fewer than 2 profiles', () => {
    const single = [{
      photoId: 'p1',
      dominantColors: [makeDominantColor(100, 50, 50)],
      isDark: false,
      averageLuminance: 0.3,
    }]
    expect(scoreColorHarmony(single)).toBe(0)
  })

  it('gives positive score for harmonious (similar hue) photos', () => {
    const profiles = [
      {
        photoId: 'p1',
        dominantColors: [makeDominantColor(200, 100, 80, { proportion: 0.5 })],
        isDark: false,
        averageLuminance: 0.3,
      },
      {
        photoId: 'p2',
        dominantColors: [makeDominantColor(190, 110, 70, { proportion: 0.5 })],
        isDark: false,
        averageLuminance: 0.35,
      },
    ]
    const score = scoreColorHarmony(profiles)
    expect(score).toBeGreaterThan(0)
  })

  it('gives bonus for complementary (opposite hue) photos', () => {
    const profiles = [
      {
        photoId: 'p1',
        dominantColors: [makeDominantColor(200, 50, 50, { proportion: 0.5 })], // red-ish
        isDark: false,
        averageLuminance: 0.3,
      },
      {
        photoId: 'p2',
        dominantColors: [makeDominantColor(50, 200, 200, { proportion: 0.5 })], // cyan-ish
        isDark: false,
        averageLuminance: 0.4,
      },
    ]
    const score = scoreColorHarmony(profiles)
    expect(score).toBeGreaterThanOrEqual(0) // complementary gets a small bonus
  })

  it('considers background color contrast', () => {
    const profiles = [
      {
        photoId: 'p1',
        dominantColors: [makeDominantColor(40, 40, 40, { proportion: 0.5, isDark: true })],
        isDark: true,
        averageLuminance: 0.05,
      },
      {
        photoId: 'p2',
        dominantColors: [makeDominantColor(30, 30, 30, { proportion: 0.5, isDark: true })],
        isDark: true,
        averageLuminance: 0.04,
      },
    ]
    // White background = high contrast with dark photos → bonus
    const withWhiteBg = scoreColorHarmony(profiles, '#FFFFFF')
    // Dark background = low contrast with dark photos → penalty
    const withDarkBg = scoreColorHarmony(profiles, '#1A1A1A')
    expect(withWhiteBg).toBeGreaterThan(withDarkBg)
  })

  it('stays within -15 to +15 range', () => {
    const profiles = Array.from({ length: 10 }, (_, i) => ({
      photoId: `p${i}`,
      dominantColors: [makeDominantColor(
        Math.floor(Math.random() * 255),
        Math.floor(Math.random() * 255),
        Math.floor(Math.random() * 255),
        { proportion: 0.2 },
      )],
      isDark: Math.random() > 0.5,
      averageLuminance: Math.random(),
    }))
    const score = scoreColorHarmony(profiles)
    expect(score).toBeGreaterThanOrEqual(-15)
    expect(score).toBeLessThanOrEqual(15)
  })
})

describe('extractDominantColors', () => {
  beforeEach(() => {
    mockGetPalette.mockReset()
  })

  it('returns empty array when getPalette returns null', async () => {
    mockGetPalette.mockResolvedValue(null)
    const img = {} as HTMLImageElement
    const result = await extractDominantColors(img)
    expect(result).toEqual([])
  })

  it('maps colorthief Color objects to DominantColor', async () => {
    const mockColor = {
      rgb: () => ({ r: 150, g: 80, b: 40 }),
      hex: () => '#96502a',
      proportion: 0.35,
      isDark: false,
    }
    mockGetPalette.mockResolvedValue([mockColor])
    const img = {} as HTMLImageElement
    const result = await extractDominantColors(img)
    expect(result).toEqual([{
      r: 150, g: 80, b: 40,
      hex: '#96502a',
      proportion: 0.35,
      isDark: false,
    }])
  })

  it('passes colorCount and quality options to getPalette', async () => {
    mockGetPalette.mockResolvedValue([])
    const img = {} as HTMLImageElement
    await extractDominantColors(img, 8)
    expect(mockGetPalette).toHaveBeenCalledWith(img, {
      colorCount: 8,
      quality: 5,
      ignoreWhite: true,
    })
  })
})
