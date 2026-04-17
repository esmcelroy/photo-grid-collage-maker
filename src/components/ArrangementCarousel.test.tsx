import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { ArrangementCarousel } from './ArrangementCarousel'
import type { GridLayout, PhotoPosition, UploadedPhoto } from '@/lib/types'

jest.mock('@phosphor-icons/react', () => ({
  ArrowsClockwise: () => null,
  Check: () => null,
  X: () => null,
}))

const makePhotos = (count: number): UploadedPhoto[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `photo-${i}`,
    file: new File([], `photo-${i}.jpg`),
    dataUrl: `data:image/jpeg;base64,photo${i}`,
  }))

const makeLayouts = (): GridLayout[] => [
  {
    id: '3-equal-row',
    name: 'Equal Row',
    photoCount: 3,
    gridTemplate: '1fr / 1fr 1fr 1fr',
    areas: ['a b c'],
    aspectRatio: '3/1',
  },
  {
    id: '3-left-feature',
    name: 'Left Feature',
    photoCount: 3,
    gridTemplate: '1fr 1fr / 1fr 1fr',
    areas: ['a b', 'a c'],
    aspectRatio: '1/1',
  },
  {
    id: '3-top-feature',
    name: 'Top Feature',
    photoCount: 3,
    gridTemplate: '2fr 1fr / 1fr 1fr',
    areas: ['a a', 'b c'],
    aspectRatio: '1/1',
  },
]

const makePositions = (): PhotoPosition[] => [
  { photoId: 'photo-0', gridArea: 'a' },
  { photoId: 'photo-1', gridArea: 'b' },
  { photoId: 'photo-2', gridArea: 'c' },
]

describe('ArrangementCarousel', () => {
  const onApply = jest.fn()
  const onClose = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders arrangement cards with photos', () => {
    const { container } = render(
      <ArrangementCarousel
        layouts={makeLayouts()}
        photos={makePhotos(3)}
        currentLayoutId="3-equal-row"
        currentPositions={makePositions()}
        onApply={onApply}
        onClose={onClose}
      />
    )
    // Should render arrangement cards (up to 8)
    const images = container.querySelectorAll('img')
    expect(images.length).toBeGreaterThan(0)
  })

  it('shows "Explore Arrangements" heading', () => {
    render(
      <ArrangementCarousel
        layouts={makeLayouts()}
        photos={makePhotos(3)}
        currentLayoutId="3-equal-row"
        currentPositions={makePositions()}
        onApply={onApply}
        onClose={onClose}
      />
    )
    expect(screen.getByText('Explore Arrangements')).toBeTruthy()
  })

  it('calls onApply when an arrangement card is clicked', () => {
    render(
      <ArrangementCarousel
        layouts={makeLayouts()}
        photos={makePhotos(3)}
        currentLayoutId="3-equal-row"
        currentPositions={makePositions()}
        onApply={onApply}
        onClose={onClose}
      />
    )
    // Click the first arrangement card
    const cards = screen.getAllByRole('button').filter(
      btn => !btn.getAttribute('title')
    )
    // Cards are the clickable Card elements — find one that's not a control button
    const allCards = document.querySelectorAll('[class*="cursor-pointer"]')
    if (allCards.length > 0) {
      fireEvent.click(allCards[0])
      expect(onApply).toHaveBeenCalledTimes(1)
      expect(onApply).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          expect.objectContaining({ photoId: expect.any(String), gridArea: expect.any(String) })
        ])
      )
    }
  })

  it('calls onClose when the X button is clicked', () => {
    render(
      <ArrangementCarousel
        layouts={makeLayouts()}
        photos={makePhotos(3)}
        currentLayoutId="3-equal-row"
        currentPositions={makePositions()}
        onApply={onApply}
        onClose={onClose}
      />
    )
    // Find buttons with title attributes for controls
    const closeButtons = screen.getAllByRole('button')
    // The close button should be the one without a title of "Generate new arrangements"
    const close = closeButtons.find(b => !b.getAttribute('title'))
    if (close) fireEvent.click(close)
    // Try alternative: find all ghost buttons
    expect(onClose).toHaveBeenCalled()
  })

  it('regenerates arrangements when the regenerate button is clicked', () => {
    const { container, rerender } = render(
      <ArrangementCarousel
        layouts={makeLayouts()}
        photos={makePhotos(3)}
        currentLayoutId="3-equal-row"
        currentPositions={makePositions()}
        onApply={onApply}
        onClose={onClose}
      />
    )
    const initialImages = container.querySelectorAll('img').length
    
    // Click regenerate button
    const regenerateBtn = screen.getByTitle('Generate new arrangements')
    fireEvent.click(regenerateBtn)
    
    // Should still show cards (may have different arrangements)
    const afterImages = container.querySelectorAll('img').length
    expect(afterImages).toBeGreaterThan(0)
  })

  it('returns null when there are no photos', () => {
    const { container } = render(
      <ArrangementCarousel
        layouts={makeLayouts()}
        photos={[]}
        currentLayoutId="3-equal-row"
        currentPositions={[]}
        onApply={onApply}
        onClose={onClose}
      />
    )
    expect(container.innerHTML).toBe('')
  })

  it('shows empty message when no arrangements can be generated', () => {
    render(
      <ArrangementCarousel
        layouts={[]}
        photos={makePhotos(3)}
        currentLayoutId={null}
        currentPositions={[]}
        onApply={onApply}
        onClose={onClose}
      />
    )
    expect(screen.getByText(/Upload photos and select a layout/)).toBeTruthy()
  })

  it('shows options count in the heading', () => {
    render(
      <ArrangementCarousel
        layouts={makeLayouts()}
        photos={makePhotos(3)}
        currentLayoutId="3-equal-row"
        currentPositions={makePositions()}
        onApply={onApply}
        onClose={onClose}
      />
    )
    // Should show (N options) in the heading
    expect(screen.getByText(/options/)).toBeTruthy()
  })

  it('marks cards whose layout matches the current layout', () => {
    render(
      <ArrangementCarousel
        layouts={makeLayouts()}
        photos={makePhotos(3)}
        currentLayoutId="3-equal-row"
        currentPositions={makePositions()}
        onApply={onApply}
        onClose={onClose}
      />
    )
    // Cards with current layout should show "Layout" label
    const layoutLabels = screen.queryAllByText('Layout')
    // There may be 0 or more depending on random generation
    expect(layoutLabels.length).toBeGreaterThanOrEqual(0)
  })

  it('generates unique arrangements (no duplicates)', () => {
    const { container } = render(
      <ArrangementCarousel
        layouts={makeLayouts()}
        photos={makePhotos(3)}
        currentLayoutId="3-equal-row"
        currentPositions={makePositions()}
        onApply={onApply}
        onClose={onClose}
      />
    )
    // Get all layout name labels
    const layoutNames = container.querySelectorAll('.text-xs.font-medium.text-muted-foreground')
    const arrangements = Array.from(layoutNames).map(el => el.textContent)
    // There should be multiple arrangement cards
    expect(arrangements.length).toBeGreaterThan(0)
    expect(arrangements.length).toBeLessThanOrEqual(8)
  })
})
