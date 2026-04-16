import { describe, expect, it } from '@jest/globals'
import { getLayoutsForPhotoCount } from '@/lib/layouts'

describe('getLayoutsForPhotoCount', () => {
  it('returns layouts for the exact photo count', () => {
    const layouts = getLayoutsForPhotoCount(2)

    expect(layouts.length).toBeGreaterThan(0)
    expect(layouts.every(layout => layout.photoCount === 2)).toBe(true)
  })

  it('returns an empty array for 0 photos', () => {
    expect(getLayoutsForPhotoCount(0)).toHaveLength(0)
  })

  it('returns an empty array for counts above the maximum', () => {
    expect(getLayoutsForPhotoCount(17)).toHaveLength(0)
  })

  it('returns layouts for all counts from 1 to 16', () => {
    for (let count = 1; count <= 16; count++) {
      const layouts = getLayoutsForPhotoCount(count)
      expect(layouts.length).toBeGreaterThanOrEqual(4)
      expect(layouts.every(l => l.photoCount === count)).toBe(true)
    }
  })
})
