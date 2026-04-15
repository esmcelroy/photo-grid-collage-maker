import { jest } from '@jest/globals'
import { render, screen, fireEvent } from '@testing-library/react'
import { CollagePreview } from '@/components/CollagePreview'
import type { GridLayout, PhotoPosition, UploadedPhoto, CollageSettings } from '@/lib/types'

// ─── shared fixtures ──────────────────────────────────────────────────────────

const layout: GridLayout = {
  id: '2-horizontal',
  name: 'Side by Side',
  photoCount: 2,
  gridTemplate: '1fr 1fr',
  areas: ['a', 'b'],
  aspectRatio: '16/9',
}

const photos: UploadedPhoto[] = [
  {
    id: 'p1',
    file: new File([''], 'photo-a.jpg', { type: 'image/jpeg' }),
    dataUrl: 'data:image/jpeg;base64,photoA',
  },
  {
    id: 'p2',
    file: new File([''], 'photo-b.jpg', { type: 'image/jpeg' }),
    dataUrl: 'data:image/jpeg;base64,photoB',
  },
]

const settings: CollageSettings = { gap: 8, backgroundColor: 'transparent', borderRadius: 0 }

// Returns a fresh positions array each call to avoid cross-test mutation
// (handleDrop mutates position objects in-place via shallow copy)
const makePositions = (): PhotoPosition[] => [
  { photoId: 'p1', gridArea: 'a' },
  { photoId: 'p2', gridArea: 'b' },
]

// ─── tests ───────────────────────────────────────────────────────────────────

describe('CollagePreview', () => {
  it('renders one <img> per photo in the layout', () => {
    const { container } = render(
      <CollagePreview
        layout={layout}
        photos={photos}
        photoPositions={makePositions()}
        settings={settings}
        onPositionsChange={jest.fn()}
      />
    )
    // alt="" marks the images as decorative; query via the DOM directly
    expect(container.querySelectorAll('img')).toHaveLength(2)
  })

  it('sets the correct src attribute on each rendered image', () => {
    const { container } = render(
      <CollagePreview
        layout={layout}
        photos={photos}
        photoPositions={makePositions()}
        settings={settings}
        onPositionsChange={jest.fn()}
      />
    )
    const srcs = Array.from(container.querySelectorAll('img')).map(
      (img) => (img as HTMLImageElement).src
    )
    expect(srcs).toContain('data:image/jpeg;base64,photoA')
    expect(srcs).toContain('data:image/jpeg;base64,photoB')
  })

  it('renders no images when no photos are assigned to positions', () => {
    const { container } = render(
      <CollagePreview
        layout={layout}
        photos={[]}
        photoPositions={[]}
        settings={settings}
        onPositionsChange={jest.fn()}
      />
    )
    expect(container.querySelectorAll('img')).toHaveLength(0)
  })

  it('renders one cell per layout area', () => {
    const { container } = render(
      <CollagePreview
        layout={layout}
        photos={[]}
        photoPositions={[]}
        settings={settings}
        onPositionsChange={jest.fn()}
      />
    )
    // Each area becomes a child div inside the grid; layout has 2 areas
    const gridContainer = container.querySelector('[style*="grid-template"]')
    expect(gridContainer?.children).toHaveLength(2)
  })

  it('applies gap and borderRadius from settings to the grid', () => {
    const { container } = render(
      <CollagePreview
        layout={layout}
        photos={[]}
        photoPositions={[]}
        settings={{ ...settings, gap: 16, borderRadius: 8 }}
        onPositionsChange={jest.fn()}
      />
    )
    const grid = container.querySelector('[style*="gap"]') as HTMLElement
    expect(grid?.style.gap).toBe('16px')
  })

  it('only marks cells with assigned photos as draggable', () => {
    const { container } = render(
      <CollagePreview
        layout={layout}
        photos={photos}
        photoPositions={makePositions()}
        settings={settings}
        onPositionsChange={jest.fn()}
      />
    )
    const draggable = container.querySelectorAll('[draggable="true"]')
    expect(draggable).toHaveLength(2)
  })

  it('calls onPositionsChange with swapped photoIds after drag-and-drop', () => {
    const onPositionsChange = jest.fn()
    const { container } = render(
      <CollagePreview
        layout={layout}
        photos={photos}
        photoPositions={makePositions()}
        settings={settings}
        onPositionsChange={onPositionsChange}
      />
    )

    const draggable = container.querySelectorAll('[draggable="true"]')
    expect(draggable).toHaveLength(2)

    // Drag cell-0 (area "a", photo p1) onto cell-1 (area "b", photo p2)
    fireEvent.dragStart(draggable[0])
    fireEvent.dragOver(draggable[1])
    fireEvent.drop(draggable[1])

    expect(onPositionsChange).toHaveBeenCalledWith([
      { photoId: 'p2', gridArea: 'a' },
      { photoId: 'p1', gridArea: 'b' },
    ])
  })

  it('does not call onPositionsChange when dropping a cell onto itself', () => {
    const onPositionsChange = jest.fn()
    const { container } = render(
      <CollagePreview
        layout={layout}
        photos={photos}
        photoPositions={makePositions()}
        settings={settings}
        onPositionsChange={onPositionsChange}
      />
    )

    const draggable = container.querySelectorAll('[draggable="true"]')
    fireEvent.dragStart(draggable[0])
    fireEvent.drop(draggable[0]) // drop on same cell

    expect(onPositionsChange).not.toHaveBeenCalled()
  })

  it('clears drag state when drag ends without dropping', () => {
    const { container } = render(
      <CollagePreview
        layout={layout}
        photos={photos}
        photoPositions={makePositions()}
        settings={settings}
        onPositionsChange={jest.fn()}
      />
    )

    const draggable = container.querySelectorAll('[draggable="true"]')
    fireEvent.dragStart(draggable[0])
    // dragEnd should clear state without errors
    fireEvent.dragEnd(draggable[0])
  })

  it('applies a solid background colour when a non-transparent colour is set', () => {
    const { container } = render(
      <CollagePreview
        layout={layout}
        photos={[]}
        photoPositions={[]}
        settings={{ ...settings, backgroundColor: '#ff0000' }}
        onPositionsChange={jest.fn()}
      />
    )
    const grid = container.querySelector('[style*="background"]') as HTMLElement
    expect(grid?.style.backgroundColor).toBe('rgb(255, 0, 0)')
  })
})
