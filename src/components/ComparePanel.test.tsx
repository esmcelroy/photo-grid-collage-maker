import '@testing-library/jest-dom/jest-globals'
import React from 'react'
import { jest, describe, it, expect } from '@jest/globals'
import { render, screen, fireEvent } from '@testing-library/react'

// Framer-motion: render children immediately without animation
jest.unstable_mockModule('framer-motion', () => ({
  motion: {
    div: React.forwardRef(({ children, ...props }: any, ref: any) =>
      React.createElement('div', { ...props, ref }, children)
    ),
  },
  AnimatePresence: ({ children }: any) =>
    React.createElement(React.Fragment, null, children),
}))

const { ComparePanel } = await import('@/components/ComparePanel')
import type { GridLayout, UploadedPhoto, PhotoPosition } from '@/lib/types'

// ── fixtures ───────────────────────────────────────────────────────────────────

const layouts: GridLayout[] = [
  {
    id: 'layout-1',
    name: 'Grid A',
    photoCount: 2,
    gridTemplate: '1fr 1fr / 1fr 1fr',
    areas: ['a b', 'a b'],
    aspectRatio: '1/1',
  },
  {
    id: 'layout-2',
    name: 'Grid B',
    photoCount: 1,
    gridTemplate: '1fr',
    areas: ['a'],
    aspectRatio: '4/3',
  },
  {
    id: 'layout-3',
    name: 'Grid C',
    photoCount: 2,
    gridTemplate: '1fr / 1fr 1fr',
    areas: ['a b'],
    aspectRatio: '16/9',
  },
]

const photos: UploadedPhoto[] = [
  { id: 'photo-1', file: new File([''], 'a.jpg', { type: 'image/jpeg' }), dataUrl: 'data:image/jpeg;base64,aaa' },
  { id: 'photo-2', file: new File([''], 'b.jpg', { type: 'image/jpeg' }), dataUrl: 'data:image/jpeg;base64,bbb' },
]

const photoPositions: PhotoPosition[] = [
  { photoId: 'photo-1', gridArea: 'a' },
  { photoId: 'photo-2', gridArea: 'b' },
]

function renderPanel(overrides?: {
  compareIds?: string[]
  selectedLayoutId?: string | null
  onLayoutSelect?: jest.Mock
  onClearCompare?: jest.Mock
  onToggleCompare?: jest.Mock
}) {
  const onLayoutSelect = overrides?.onLayoutSelect ?? jest.fn()
  const onClearCompare = overrides?.onClearCompare ?? jest.fn()
  const onToggleCompare = overrides?.onToggleCompare ?? jest.fn()

  const result = render(
    <ComparePanel
      layouts={layouts}
      compareIds={overrides?.compareIds ?? ['layout-1']}
      photos={photos}
      photoPositions={photoPositions}
      selectedLayoutId={overrides?.selectedLayoutId ?? null}
      onLayoutSelect={onLayoutSelect}
      onClearCompare={onClearCompare}
      onToggleCompare={onToggleCompare}
    />
  )
  return { ...result, onLayoutSelect, onClearCompare, onToggleCompare }
}

// ── tests ──────────────────────────────────────────────────────────────────────

describe('ComparePanel', () => {
  it('renders the comparison count text', () => {
    renderPanel({ compareIds: ['layout-1', 'layout-2'] })
    expect(screen.getByText(/Comparing 2\/3 layouts/)).toBeInTheDocument()
  })

  it('renders Clear button and fires onClearCompare', () => {
    const { onClearCompare } = renderPanel()
    const clearBtn = screen.getByRole('button', { name: /clear/i })
    fireEvent.click(clearBtn)
    expect(onClearCompare).toHaveBeenCalled()
  })

  it('renders layout name for each compare card', () => {
    renderPanel({ compareIds: ['layout-1', 'layout-2'] })
    expect(screen.getByText('Grid A')).toBeInTheDocument()
    expect(screen.getByText('Grid B')).toBeInTheDocument()
  })

  it('shows "Current" badge on the selected layout', () => {
    renderPanel({ compareIds: ['layout-1'], selectedLayoutId: 'layout-1' })
    expect(screen.getByText('Current')).toBeInTheDocument()
  })

  it('does not show "Current" badge on non-selected layout', () => {
    renderPanel({ compareIds: ['layout-1'], selectedLayoutId: 'layout-2' })
    expect(screen.queryByText('Current')).not.toBeInTheDocument()
  })

  it('calls onLayoutSelect and onClearCompare when a card is clicked', () => {
    const { onLayoutSelect, onClearCompare } = renderPanel({ compareIds: ['layout-1'] })
    fireEvent.click(screen.getByText('Grid A'))
    expect(onLayoutSelect).toHaveBeenCalledWith('layout-1')
    expect(onClearCompare).toHaveBeenCalled()
  })

  it('calls onToggleCompare when remove button is clicked', () => {
    const { onToggleCompare } = renderPanel({ compareIds: ['layout-1'] })
    const removeBtn = screen.getByLabelText('Remove Grid A from comparison')
    fireEvent.click(removeBtn)
    expect(onToggleCompare).toHaveBeenCalledWith('layout-1')
  })

  it('does not trigger onLayoutSelect when remove button is clicked (stopPropagation)', () => {
    const { onLayoutSelect } = renderPanel({ compareIds: ['layout-1'] })
    const removeBtn = screen.getByLabelText('Remove Grid A from comparison')
    fireEvent.click(removeBtn)
    expect(onLayoutSelect).not.toHaveBeenCalled()
  })

  it('renders photo images for areas that have a matching photo', () => {
    const { container } = renderPanel({ compareIds: ['layout-1'] })
    const imgs = container.querySelectorAll('img')
    expect(imgs.length).toBeGreaterThanOrEqual(1)
  })

  it('renders placeholder for areas without a photo', () => {
    render(
      <ComparePanel
        layouts={layouts}
        compareIds={['layout-2']}
        photos={[]}
        photoPositions={[]}
        selectedLayoutId={null}
        onLayoutSelect={jest.fn()}
        onClearCompare={jest.fn()}
        onToggleCompare={jest.fn()}
      />
    )
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('renders 3 compare cards', () => {
    renderPanel({ compareIds: ['layout-1', 'layout-2', 'layout-3'] })
    expect(screen.getByText('Grid A')).toBeInTheDocument()
    expect(screen.getByText('Grid B')).toBeInTheDocument()
    expect(screen.getByText('Grid C')).toBeInTheDocument()
  })

  it('handles parseTemplate with single value (no slash)', () => {
    renderPanel({ compareIds: ['layout-2'] })
    expect(screen.getByText('Grid B')).toBeInTheDocument()
  })

  it('skips layouts not found in the layouts array', () => {
    renderPanel({ compareIds: ['layout-1', 'nonexistent'] })
    expect(screen.getByText('Grid A')).toBeInTheDocument()
    expect(screen.getByText(/Comparing 1\/3 layouts/)).toBeInTheDocument()
  })

  it('renders area with photo when position matches', () => {
    const { container } = renderPanel({ compareIds: ['layout-1'] })
    const imgs = container.querySelectorAll('img')
    const src = Array.from(imgs).map(i => i.getAttribute('src'))
    expect(src).toContain('data:image/jpeg;base64,aaa')
  })
})
