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
    expect(getLayoutsForPhotoCount(10)).toHaveLength(0)
  })
})
