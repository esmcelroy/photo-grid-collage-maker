import { describe, expect, it } from '@jest/globals'
import { getLayoutsForPhotoCount, GRID_LAYOUTS } from '@/lib/layouts'

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

describe('layout structure validation', () => {
  it.each(GRID_LAYOUTS.map(l => [l.id, l]))('layout %s has consistent grid dimensions', (_id, layout) => {
    const l = layout as (typeof GRID_LAYOUTS)[number]
    const parts = l.gridTemplate.split('/')
    let templateRows: number, templateCols: number
    if (parts.length === 1) {
      templateRows = 1
      templateCols = parts[0].trim().split(' ').length
    } else {
      templateRows = parts[0].trim().split(' ').length
      templateCols = parts[1].trim().split(' ').length
    }

    expect(l.areas.length).toBe(templateRows)
    l.areas.forEach(row => {
      expect(row.split(' ').length).toBe(templateCols)
    })
  })

  it.each(GRID_LAYOUTS.map(l => [l.id, l]))('layout %s has correct photo count', (_id, layout) => {
    const l = layout as (typeof GRID_LAYOUTS)[number]
    const uniqueAreas = new Set<string>()
    l.areas.forEach(row => row.split(' ').forEach(c => uniqueAreas.add(c)))
    expect(uniqueAreas.size).toBe(l.photoCount)
  })

  it.each(GRID_LAYOUTS.map(l => [l.id, l]))('layout %s has platforms defined', (_id, layout) => {
    const l = layout as (typeof GRID_LAYOUTS)[number]
    expect(l.platforms).toBeDefined()
    expect(l.platforms!.length).toBeGreaterThan(0)
  })

  it('has no duplicate layout IDs', () => {
    const ids = GRID_LAYOUTS.map(l => l.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
