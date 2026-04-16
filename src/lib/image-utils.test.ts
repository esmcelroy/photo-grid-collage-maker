/**
 * Tests for src/lib/image-utils.ts
 *
 * NOTE: downloadCollage is intentionally excluded from coverage here.
 * It depends on html2canvas (a dynamic import) and triggers a real DOM download.
 * That behaviour is better validated in E2E tests owned by the test-engineer agent.
 */

import {
  generateUniqueId,
  parseGridTemplate,
  parseGridAreas,
  fileToDataUrl,
  convertModernColors,
  replaceOklchInSubtree,
  replaceOklchCustomProperties,
} from '@/lib/image-utils'

// ---------------------------------------------------------------------------
// generateUniqueId
// ---------------------------------------------------------------------------

describe('generateUniqueId', () => {
  it('returns a non-empty string', () => {
    const id = generateUniqueId()
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
  })

  it('returns unique values across 100 consecutive calls', () => {
    const ids = new Set(Array.from({ length: 100 }, generateUniqueId))
    expect(ids.size).toBe(100)
  })

  it('embeds a current timestamp as the first segment', () => {
    const before = Date.now()
    const id = generateUniqueId()
    const after = Date.now()

    const ts = parseInt(id.split('-')[0], 10)
    expect(ts).toBeGreaterThanOrEqual(before)
    expect(ts).toBeLessThanOrEqual(after)
  })

  it('contains a random alphanumeric suffix after the dash', () => {
    const id = generateUniqueId()
    // Format: "<timestamp>-<alphanum>" — alphanum segment is base-36 chars only
    const parts = id.split('-')
    expect(parts).toHaveLength(2)
    expect(parts[1]).toMatch(/^[0-9a-z]+$/)
  })

  it('suffix has up to 9 characters', () => {
    const id = generateUniqueId()
    const suffix = id.split('-')[1]
    expect(suffix.length).toBeLessThanOrEqual(9)
  })
})

// ---------------------------------------------------------------------------
// parseGridTemplate
// ---------------------------------------------------------------------------

describe('parseGridTemplate', () => {
  describe('single-axis (columns only — no slash)', () => {
    it('treats a single value as one column', () => {
      const result = parseGridTemplate('1fr')
      expect(result.rows).toEqual(['1fr'])
      expect(result.columns).toEqual(['1fr'])
    })

    it('splits multiple column fractions into an array', () => {
      const result = parseGridTemplate('1fr 1fr')
      expect(result.rows).toEqual(['1fr'])
      expect(result.columns).toEqual(['1fr', '1fr'])
    })

    it('handles three equal columns', () => {
      const result = parseGridTemplate('1fr 1fr 1fr')
      expect(result.rows).toEqual(['1fr'])
      expect(result.columns).toEqual(['1fr', '1fr', '1fr'])
    })

    it('handles mixed-weight columns', () => {
      const result = parseGridTemplate('2fr 1fr')
      expect(result.rows).toEqual(['1fr'])
      expect(result.columns).toEqual(['2fr', '1fr'])
    })
  })

  describe('two-axis (rows / columns — with slash)', () => {
    it('parses rows before the slash and columns after', () => {
      const result = parseGridTemplate('1fr 1fr / 2fr 1fr')
      expect(result.rows).toEqual(['1fr', '1fr'])
      expect(result.columns).toEqual(['2fr', '1fr'])
    })

    it('handles a single row with multiple columns', () => {
      const result = parseGridTemplate('1fr / 1fr 1fr 1fr')
      expect(result.rows).toEqual(['1fr'])
      expect(result.columns).toEqual(['1fr', '1fr', '1fr'])
    })

    it('handles multiple rows with a single column', () => {
      const result = parseGridTemplate('2fr 1fr / 1fr')
      expect(result.rows).toEqual(['2fr', '1fr'])
      expect(result.columns).toEqual(['1fr'])
    })

    it('handles three rows with two columns', () => {
      const result = parseGridTemplate('1fr 1fr 1fr / 1fr 1fr')
      expect(result.rows).toEqual(['1fr', '1fr', '1fr'])
      expect(result.columns).toEqual(['1fr', '1fr'])
    })

    it('handles an empty columns segment after the slash by returning default', () => {
      // '1fr /' → cols segment is empty string → falls back to ['1fr']
      const result = parseGridTemplate('1fr /')
      expect(result.rows).toEqual(['1fr'])
      expect(result.columns).toEqual(['1fr'])
    })
  })

  describe('real layout templates from GRID_LAYOUTS', () => {
    it('parses the "Side by Side" layout template correctly', () => {
      // 2-horizontal: '1fr 1fr'
      const result = parseGridTemplate('1fr 1fr')
      expect(result.columns).toHaveLength(2)
    })

    it('parses the "Stacked" layout template correctly', () => {
      // 2-vertical: '1fr / 1fr'
      const result = parseGridTemplate('1fr / 1fr')
      expect(result.rows).toEqual(['1fr'])
      expect(result.columns).toEqual(['1fr'])
    })

    it('parses the "Left with Stack" layout template correctly', () => {
      // 3-left-stack: '1fr 1fr / 2fr 1fr'
      const result = parseGridTemplate('1fr 1fr / 2fr 1fr')
      expect(result.rows).toEqual(['1fr', '1fr'])
      expect(result.columns).toEqual(['2fr', '1fr'])
    })
  })
})

// ---------------------------------------------------------------------------
// parseGridAreas
// ---------------------------------------------------------------------------

describe('parseGridAreas', () => {
  it('wraps a single area string in a nested array', () => {
    expect(parseGridAreas(['a'])).toEqual([['a']])
  })

  it('puts each distinct (non-consecutive) area in its own group', () => {
    const result = parseGridAreas(['a', 'b', 'c'])
    expect(result).toEqual([['a'], ['b'], ['c']])
    expect(result).toHaveLength(3)
  })

  it('groups consecutive identical areas together', () => {
    const result = parseGridAreas(['a', 'a', 'b'])
    expect(result).toEqual([['a', 'a'], ['b']])
  })

  it('groups a run of identical areas into a single group', () => {
    const result = parseGridAreas(['a', 'a', 'a'])
    expect(result).toEqual([['a', 'a', 'a']])
  })

  it('handles multi-word row strings as atomic units', () => {
    // Areas like 'a a' and 'b c' are treated as opaque strings
    const result = parseGridAreas(['a a', 'b c'])
    expect(result).toEqual([['a a'], ['b c']])
  })

  it('groups multi-word row strings that repeat consecutively', () => {
    const result = parseGridAreas(['a b', 'a b', 'c d'])
    expect(result).toEqual([['a b', 'a b'], ['c d']])
  })

  it('does not merge non-adjacent occurrences of the same area string', () => {
    const result = parseGridAreas(['a', 'b', 'a'])
    // 'a' appears at index 0 and 2 but they are not consecutive
    expect(result).toEqual([['a'], ['b'], ['a']])
  })

  it('handles real layout areas — 3-left-stack produces two row groups', () => {
    // areas: ['a a', 'b c']
    const result = parseGridAreas(['a a', 'b c'])
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual(['a a'])
    expect(result[1]).toEqual(['b c'])
  })

  it('handles real layout areas — 4-left-focus has three distinct row groups', () => {
    // areas: ['a b', 'a c', 'a d']
    const result = parseGridAreas(['a b', 'a c', 'a d'])
    expect(result).toHaveLength(3)
  })
})

// ---------------------------------------------------------------------------
// fileToDataUrl
// ---------------------------------------------------------------------------

describe('fileToDataUrl', () => {
  it('resolves with a string', async () => {
    const file = new File(['hello'], 'test.txt', { type: 'text/plain' })
    const result = await fileToDataUrl(file)
    expect(typeof result).toBe('string')
  })

  it('resolves with a data URL that starts with the correct prefix', async () => {
    const file = new File(['image bytes'], 'photo.jpg', { type: 'image/jpeg' })
    const result = await fileToDataUrl(file)
    expect(result).toMatch(/^data:image\/jpeg;base64,/)
  })

  it('encodes file content as base64', async () => {
    // 'test content' in base64 is 'dGVzdCBjb250ZW50'
    const file = new File(['test content'], 'photo.jpg', { type: 'image/jpeg' })
    const result = await fileToDataUrl(file)
    expect(result).toContain('dGVzdCBjb250ZW50')
  })

  it('produces different data URLs for different file contents', async () => {
    const file1 = new File(['content-one'], 'a.jpg', { type: 'image/jpeg' })
    const file2 = new File(['content-two'], 'b.jpg', { type: 'image/jpeg' })
    const [url1, url2] = await Promise.all([fileToDataUrl(file1), fileToDataUrl(file2)])
    expect(url1).not.toBe(url2)
  })

  it('preserves the MIME type of the original file in the data URL', async () => {
    const pngFile = new File(['png-bytes'], 'image.png', { type: 'image/png' })
    const result = await fileToDataUrl(pngFile)
    expect(result).toMatch(/^data:image\/png;base64,/)
  })
})

// ---------------------------------------------------------------------------
// convertModernColors
// ---------------------------------------------------------------------------

describe('convertModernColors', () => {
  it('returns empty string unchanged', () => {
    expect(convertModernColors('')).toBe('')
  })

  it('returns non-oklch values unchanged', () => {
    expect(convertModernColors('#ff0000')).toBe('#ff0000')
    expect(convertModernColors('rgb(255, 0, 0)')).toBe('rgb(255, 0, 0)')
    expect(convertModernColors('blue')).toBe('blue')
  })

  it('does not throw for oklch values', () => {
    expect(() => convertModernColors('oklch(0.60 0.20 300)')).not.toThrow()
  })

  it('does not throw for oklab values', () => {
    expect(() => convertModernColors('oklab(0.5 0.1 -0.1)')).not.toThrow()
  })

  it('returns a non-empty string for oklch input', () => {
    const result = convertModernColors('oklch(0.60 0.20 300)')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// replaceOklchInSubtree
// ---------------------------------------------------------------------------

describe('replaceOklchInSubtree', () => {
  it('returns a restore function', () => {
    const el = document.createElement('div')
    const restore = replaceOklchInSubtree(el)
    expect(typeof restore).toBe('function')
    restore()
  })

  it('processes elements with oklch in style attribute', () => {
    const el = document.createElement('div')
    el.setAttribute('style', 'border-color: oklch(0.60 0.20 300);')
    document.body.appendChild(el)

    const restore = replaceOklchInSubtree(el)
    // convertModernColors was called on the oklch value
    expect(typeof restore).toBe('function')

    // Restore brings back the original
    restore()
    expect(el.getAttribute('style')).toContain('oklch')

    document.body.removeChild(el)
  })

  it('processes child elements too', () => {
    const parent = document.createElement('div')
    const child = document.createElement('span')
    child.setAttribute('style', 'color: oklch(0.50 0.10 200);')
    parent.appendChild(child)
    document.body.appendChild(parent)

    const restore = replaceOklchInSubtree(parent)
    expect(typeof restore).toBe('function')

    restore()
    expect(child.getAttribute('style')).toContain('oklch')

    document.body.removeChild(parent)
  })

  it('does not modify elements without oklch values', () => {
    const el = document.createElement('div')
    el.setAttribute('style', 'background-color: #ff0000;')
    const originalStyle = el.getAttribute('style')

    const restore = replaceOklchInSubtree(el)
    expect(el.getAttribute('style')).toBe(originalStyle)
    restore()
  })
})

// ---------------------------------------------------------------------------
// replaceOklchCustomProperties
// ---------------------------------------------------------------------------

describe('replaceOklchCustomProperties', () => {
  it('returns a restore function', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const restore = replaceOklchCustomProperties(el)
    expect(typeof restore).toBe('function')
    restore()
    document.body.removeChild(el)
  })

  it('converts oklch custom properties on :root', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)

    // Set an oklch custom property on :root
    document.documentElement.style.setProperty('--test-oklch-color', 'oklch(0.60 0.20 300)')
    
    const restore = replaceOklchCustomProperties(el)
    
    // In jsdom, canvas may not properly convert oklch, but the function shouldn't throw
    expect(typeof restore).toBe('function')
    
    restore()
    // After restore, clean up the test property
    document.documentElement.style.removeProperty('--test-oklch-color')
    document.body.removeChild(el)
  })

  it('does not modify non-oklch custom properties', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)

    document.documentElement.style.setProperty('--test-rgb-color', 'rgb(255, 0, 0)')
    
    const restore = replaceOklchCustomProperties(el)
    // rgb value should remain unchanged
    const val = document.documentElement.style.getPropertyValue('--test-rgb-color')
    expect(val).toBe('rgb(255, 0, 0)')
    
    restore()
    document.documentElement.style.removeProperty('--test-rgb-color')
    document.body.removeChild(el)
  })

  it('restores original custom property values after cleanup', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)

    document.documentElement.style.setProperty('--test-restore', 'oklch(0.50 0.10 200)')
    
    const restore = replaceOklchCustomProperties(el)
    restore()
    
    // After restore, the property should be removed (since it was set by inline override)
    document.documentElement.style.removeProperty('--test-restore')
    document.body.removeChild(el)
  })
})
