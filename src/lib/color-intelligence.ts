import { getPalette, type Color } from 'colorthief'

export interface DominantColor {
  r: number
  g: number
  b: number
  hex: string
  proportion: number
  isDark: boolean
}

export interface ColorAnalysis {
  dominantColors: DominantColor[]
  isDark: boolean
  averageLuminance: number
}

/**
 * Extracts dominant colors from an HTMLImageElement using colorthief.
 * Returns 6 colors by default, sorted by proportion (most dominant first).
 */
export async function extractDominantColors(
  img: HTMLImageElement,
  colorCount = 6,
): Promise<DominantColor[]> {
  const palette = await getPalette(img, {
    colorCount,
    quality: 5,
    ignoreWhite: true,
  })

  if (!palette || palette.length === 0) return []

  return palette.map(colorToDominant)
}

function colorToDominant(color: Color): DominantColor {
  const { r, g, b } = color.rgb()
  return {
    r, g, b,
    hex: color.hex(),
    proportion: color.proportion,
    isDark: color.isDark,
  }
}

/**
 * Calculates relative luminance (0-1) from RGB values.
 * Uses the BT.709 coefficients per WCAG 2.0 definition.
 */
export function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

/**
 * Determines whether a photo is predominantly dark based on
 * the weighted average luminance of its dominant colors.
 */
export function isDarkPhoto(colors: DominantColor[]): boolean {
  if (colors.length === 0) return false
  const avgLum = averageLuminanceFromColors(colors)
  return avgLum <= 0.179
}

/**
 * Computes the weighted average luminance across dominant colors.
 */
export function averageLuminanceFromColors(colors: DominantColor[]): number {
  if (colors.length === 0) return 0.5
  const totalProportion = colors.reduce((s, c) => s + c.proportion, 0)
  if (totalProportion === 0) {
    // Equal-weight fallback when proportion data is unavailable
    return colors.reduce((s, c) => s + relativeLuminance(c.r, c.g, c.b), 0) / colors.length
  }
  return colors.reduce(
    (s, c) => s + relativeLuminance(c.r, c.g, c.b) * c.proportion,
    0,
  ) / totalProportion
}

/**
 * Runs full color analysis on an image element.
 */
export async function analyzeColors(img: HTMLImageElement): Promise<ColorAnalysis> {
  const dominantColors = await extractDominantColors(img)
  const averageLuminance = averageLuminanceFromColors(dominantColors)
  return {
    dominantColors,
    isDark: averageLuminance <= 0.179,
    averageLuminance,
  }
}

// ─── Background Color Suggestions ────────────────────────────────────────────

/**
 * Converts RGB to HSL. Returns { h: 0-360, s: 0-100, l: 0-100 }.
 */
export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  let h = 0
  let s = 0

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case rn: h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60; break
      case gn: h = ((bn - rn) / d + 2) * 60; break
      case bn: h = ((rn - gn) / d + 4) * 60; break
    }
  }

  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) }
}

/**
 * Converts HSL to hex string.
 */
export function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100
  const ln = l / 100
  const a = sn * Math.min(ln, 1 - ln)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const color = ln - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * Math.max(0, Math.min(1, color)))
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

export interface SuggestedColor {
  hex: string
  name: string
  reason: string
}

/**
 * Suggests background colors that complement the photo set's palette.
 * Returns 3-5 suggestions sorted by relevance.
 *
 * Strategies:
 * 1. Muted complement — desaturated version of the dominant hue
 * 2. Neutral warm/cool — warm or cool gray based on the palette's temperature
 * 3. Light tint — very light tint of the most prominent color
 * 4. Dark contrast — dark shade when photos are predominantly light
 * 5. Complementary accent — complementary hue at very low saturation
 */
export function suggestBackgroundColors(
  allColors: DominantColor[],
  averageLuminance: number,
): SuggestedColor[] {
  if (allColors.length === 0) return []

  const suggestions: SuggestedColor[] = []

  // Aggregate colors across all photos — weight by proportion
  const weightedHues: Array<{ h: number; s: number; l: number; weight: number }> = []
  for (const c of allColors) {
    const hsl = rgbToHsl(c.r, c.g, c.b)
    // Skip very desaturated colors (grays) for hue-based suggestions
    if (hsl.s > 10) {
      weightedHues.push({ ...hsl, weight: c.proportion || 1 / allColors.length })
    }
  }

  // Find dominant hue via weighted circular mean
  const dominantHue = circularMeanHue(weightedHues)
  const isWarmPalette = isWarm(dominantHue)

  // 1. Muted complement — same family, very desaturated and light
  if (weightedHues.length > 0) {
    const hex = hslToHex(dominantHue, 15, 92)
    suggestions.push({
      hex,
      name: 'Soft Tint',
      reason: 'Muted tint from your photo palette',
    })
  }

  // 2. Neutral warm or cool gray
  if (isWarmPalette) {
    suggestions.push({
      hex: '#F5F0EB',
      name: 'Warm Neutral',
      reason: 'Warm gray to complement warm tones',
    })
  } else {
    suggestions.push({
      hex: '#EEF0F5',
      name: 'Cool Neutral',
      reason: 'Cool gray to complement cool tones',
    })
  }

  // 3. Light tint of dominant color
  if (weightedHues.length > 0) {
    const hex = hslToHex(dominantHue, 25, 96)
    suggestions.push({
      hex,
      name: 'Whisper Tint',
      reason: 'Subtle tint matching your dominant colors',
    })
  }

  // 4. Contrast suggestion — dark bg for light photos, light bg for dark photos
  if (averageLuminance > 0.5) {
    suggestions.push({
      hex: '#1A1A2E',
      name: 'Deep Dark',
      reason: 'Dark contrast for your light photos',
    })
  } else {
    suggestions.push({
      hex: '#FAFAFA',
      name: 'Clean White',
      reason: 'Light contrast for your dark photos',
    })
  }

  // 5. Complementary accent at very low saturation
  if (weightedHues.length > 0) {
    const complementHue = (dominantHue + 180) % 360
    const hex = hslToHex(complementHue, 12, 93)
    suggestions.push({
      hex,
      name: 'Complement',
      reason: 'Subtle complementary tone',
    })
  }

  return suggestions
}

/**
 * Computes the circular mean of hue values (0-360).
 * Uses weighted angular averaging to handle the wrap-around at 360°.
 */
function circularMeanHue(
  hues: Array<{ h: number; weight: number }>,
): number {
  if (hues.length === 0) return 0
  let sinSum = 0
  let cosSum = 0
  let totalWeight = 0
  for (const { h, weight } of hues) {
    const rad = (h * Math.PI) / 180
    sinSum += Math.sin(rad) * weight
    cosSum += Math.cos(rad) * weight
    totalWeight += weight
  }
  if (totalWeight === 0) return 0
  const meanRad = Math.atan2(sinSum / totalWeight, cosSum / totalWeight)
  return ((meanRad * 180) / Math.PI + 360) % 360
}

/**
 * A hue is "warm" if it falls in the red-yellow range (roughly 0-60° or 300-360°).
 */
function isWarm(hue: number): boolean {
  return hue <= 60 || hue >= 300
}

// ─── Color Harmony Scoring for Layout Ranking ────────────────────────────────

export interface PhotoColorProfile {
  photoId: string
  dominantColors: DominantColor[]
  isDark: boolean
  averageLuminance: number
}

/**
 * Scores the color harmony of a photo set for layout ranking.
 * Returns a bonus/penalty between -15 and +15.
 *
 * Factors:
 * 1. Palette cohesion — photos sharing similar hues score higher
 * 2. Dark/light balance — mix of dark and light photos scores slightly lower
 * 3. Background compatibility — if a background color is set, photos that
 *    contrast well with it score higher
 */
export function scoreColorHarmony(
  profiles: PhotoColorProfile[],
  backgroundColor?: string,
): number {
  if (profiles.length < 2) return 0

  let score = 0

  // 1. Palette cohesion: compare pairwise hue similarity
  const photoHues = profiles.map(p => {
    const chromatic = p.dominantColors.filter(c => {
      const hsl = rgbToHsl(c.r, c.g, c.b)
      return hsl.s > 10
    })
    if (chromatic.length === 0) return null
    return circularMeanHue(
      chromatic.map(c => ({
        h: rgbToHsl(c.r, c.g, c.b).h,
        weight: c.proportion || 1 / chromatic.length,
      })),
    )
  })

  const validHues = photoHues.filter((h): h is number => h !== null)
  if (validHues.length >= 2) {
    let totalDiff = 0
    let pairs = 0
    for (let i = 0; i < validHues.length; i++) {
      for (let j = i + 1; j < validHues.length; j++) {
        const diff = hueDifference(validHues[i], validHues[j])
        totalDiff += diff
        pairs++
      }
    }
    const avgDiff = totalDiff / pairs
    // Harmonious: avg diff < 60° → bonus up to +8
    // Clashing: avg diff 90-150° → penalty up to -5
    // Complementary: avg diff > 150° → small bonus +3
    if (avgDiff < 60) {
      score += Math.round(8 * (1 - avgDiff / 60))
    } else if (avgDiff > 150) {
      score += 3
    } else if (avgDiff > 90) {
      score -= Math.round(5 * ((avgDiff - 90) / 60))
    }
  }

  // 2. Dark/light balance
  const darkCount = profiles.filter(p => p.isDark).length
  const lightCount = profiles.length - darkCount
  if (darkCount > 0 && lightCount > 0) {
    const balance = Math.min(darkCount, lightCount) / Math.max(darkCount, lightCount)
    // Heavily mixed = slight penalty; uniform = bonus
    if (balance > 0.6) {
      score -= 2
    } else {
      score += 2
    }
  }

  // 3. Background compatibility
  if (backgroundColor && backgroundColor !== 'transparent') {
    const bgRgb = hexToRgb(backgroundColor)
    if (bgRgb) {
      const bgLum = relativeLuminance(bgRgb.r, bgRgb.g, bgRgb.b)
      const avgPhotoLum = profiles.reduce((s, p) => s + p.averageLuminance, 0) / profiles.length
      const contrast = Math.abs(bgLum - avgPhotoLum)
      // Good contrast (>0.3) → bonus, poor contrast (<0.1) → penalty
      if (contrast > 0.3) score += 4
      else if (contrast < 0.1) score -= 3
    }
  }

  return Math.max(-15, Math.min(15, score))
}

/**
 * Angular difference between two hues (0-180°).
 */
function hueDifference(h1: number, h2: number): number {
  const diff = Math.abs(h1 - h2)
  return diff > 180 ? 360 - diff : diff
}

/**
 * Parses a hex color string to RGB.
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  if (!match) return null
  return {
    r: parseInt(match[1], 16),
    g: parseInt(match[2], 16),
    b: parseInt(match[3], 16),
  }
}
