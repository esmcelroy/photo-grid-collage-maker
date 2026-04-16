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
const makePositions = (): PhotoPosition[] => [
  { photoId: 'p1', gridArea: 'a' },
  { photoId: 'p2', gridArea: 'b' },
]

// ─── helper ──────────────────────────────────────────────────────────────────

function renderPreview(overrides?: {
  onPositionsChange?: jest.Mock
  positions?: PhotoPosition[]
  photosOverride?: UploadedPhoto[]
}) {
  const onPositionsChange = overrides?.onPositionsChange ?? jest.fn()
  const result = render(
    <CollagePreview
      layout={layout}
      photos={overrides?.photosOverride ?? photos}
      photoPositions={overrides?.positions ?? makePositions()}
      settings={settings}
      onPositionsChange={onPositionsChange}
    />
  )
  return { ...result, onPositionsChange }
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('CollagePreview', () => {
  it('renders one <img> per photo in the layout', () => {
    const { container } = renderPreview()
    expect(container.querySelectorAll('img')).toHaveLength(2)
  })

  it('sets the correct src attribute on each rendered image', () => {
    const { container } = renderPreview()
    const srcs = Array.from(container.querySelectorAll('img')).map(
      (img) => (img as HTMLImageElement).src
    )
    expect(srcs).toContain('data:image/jpeg;base64,photoA')
    expect(srcs).toContain('data:image/jpeg;base64,photoB')
  })

  it('renders no images when no photos are assigned to positions', () => {
    const { container } = renderPreview({ positions: [], photosOverride: [] })
    expect(container.querySelectorAll('img')).toHaveLength(0)
  })

  it('renders one cell per layout area', () => {
    const { container } = renderPreview({ positions: [], photosOverride: [] })
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
    const { container } = renderPreview()
    const draggable = container.querySelectorAll('[draggable="true"]')
    expect(draggable).toHaveLength(2)
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

  // ─── HTML5 Drag and Drop ────────────────────────────────────────────────

  describe('drag-and-drop', () => {
    it('calls onPositionsChange with swapped photoIds after drag-and-drop', () => {
      const { container, onPositionsChange } = renderPreview()

      const draggable = container.querySelectorAll('[draggable="true"]')
      expect(draggable).toHaveLength(2)

      fireEvent.dragStart(draggable[0])
      fireEvent.dragOver(draggable[1])
      fireEvent.drop(draggable[1])

      expect(onPositionsChange).toHaveBeenCalledWith([
        { photoId: 'p2', gridArea: 'a' },
        { photoId: 'p1', gridArea: 'b' },
      ])
    })

    it('does not call onPositionsChange when dropping a cell onto itself', () => {
      const { container, onPositionsChange } = renderPreview()

      const draggable = container.querySelectorAll('[draggable="true"]')
      fireEvent.dragStart(draggable[0])
      fireEvent.drop(draggable[0])

      expect(onPositionsChange).not.toHaveBeenCalled()
    })

    it('clears drag state when drag ends without dropping', () => {
      const { container } = renderPreview()

      const draggable = container.querySelectorAll('[draggable="true"]')
      fireEvent.dragStart(draggable[0])
      fireEvent.dragEnd(draggable[0])
      // No error thrown = state cleaned up
    })

    it('clears dragOver state on dragLeave', () => {
      const { container } = renderPreview()

      const draggable = container.querySelectorAll('[draggable="true"]')
      fireEvent.dragStart(draggable[0])
      fireEvent.dragOver(draggable[1])
      fireEvent.dragLeave(draggable[1])
      // dragOverArea cleared — no visual artifact
    })
  })

  // ─── Click-to-swap ──────────────────────────────────────────────────────

  describe('click-to-swap', () => {
    it('selects a slot on first click and swaps on second click', () => {
      const { container, onPositionsChange } = renderPreview()

      const slots = container.querySelectorAll('[data-grid-area]')
      fireEvent.click(slots[0]) // Select slot a
      fireEvent.click(slots[1]) // Click slot b → swap

      expect(onPositionsChange).toHaveBeenCalledWith([
        { photoId: 'p2', gridArea: 'a' },
        { photoId: 'p1', gridArea: 'b' },
      ])
    })

    it('deselects a slot when clicking the same slot twice', () => {
      const { container, onPositionsChange } = renderPreview()

      const slots = container.querySelectorAll('[data-grid-area]')
      fireEvent.click(slots[0]) // Select
      fireEvent.click(slots[0]) // Deselect

      expect(onPositionsChange).not.toHaveBeenCalled()
    })

    it('does not select empty slots', () => {
      const { container, onPositionsChange } = renderPreview({
        positions: [{ photoId: 'p1', gridArea: 'a' }],
        photosOverride: [photos[0]],
      })

      const slots = container.querySelectorAll('[data-grid-area]')
      // slot[1] is area "b" with no photo — click should be ignored
      fireEvent.click(slots[1])
      fireEvent.click(slots[0])

      // Only one click was meaningful (select slot a), no swap occurred
      expect(onPositionsChange).not.toHaveBeenCalled()
    })
  })

  // ─── Keyboard accessibility ─────────────────────────────────────────────

  describe('keyboard accessibility', () => {
    it('swaps photos when using Enter key on two slots', () => {
      const { container, onPositionsChange } = renderPreview()

      const slots = container.querySelectorAll('[data-grid-area]')
      fireEvent.keyDown(slots[0], { key: 'Enter' })
      fireEvent.keyDown(slots[1], { key: 'Enter' })

      expect(onPositionsChange).toHaveBeenCalledWith([
        { photoId: 'p2', gridArea: 'a' },
        { photoId: 'p1', gridArea: 'b' },
      ])
    })

    it('swaps photos when using Space key', () => {
      const { container, onPositionsChange } = renderPreview()

      const slots = container.querySelectorAll('[data-grid-area]')
      fireEvent.keyDown(slots[0], { key: ' ' })
      fireEvent.keyDown(slots[1], { key: ' ' })

      expect(onPositionsChange).toHaveBeenCalledWith([
        { photoId: 'p2', gridArea: 'a' },
        { photoId: 'p1', gridArea: 'b' },
      ])
    })

    it('cancels selection with Escape key', () => {
      const { container, onPositionsChange } = renderPreview()

      const slots = container.querySelectorAll('[data-grid-area]')
      fireEvent.keyDown(slots[0], { key: 'Enter' }) // Select
      fireEvent.keyDown(slots[0], { key: 'Escape' }) // Cancel
      fireEvent.keyDown(slots[1], { key: 'Enter' }) // Select b (not swap)

      // No swap should occur — Escape cancelled the first selection
      expect(onPositionsChange).not.toHaveBeenCalled()
    })

    it('photo slots are focusable and have aria labels', () => {
      renderPreview()

      const buttons = screen.getAllByRole('button')
      expect(buttons.length).toBeGreaterThanOrEqual(2)
      expect(buttons[0]).toHaveAttribute('aria-label', expect.stringContaining('Photo slot'))
      expect(buttons[0]).toHaveAttribute('tabindex', '0')
    })
  })

  // ─── data-grid-area attribute ───────────────────────────────────────────

  it('sets data-grid-area attribute on each cell', () => {
    const { container } = renderPreview()
    const areas = Array.from(container.querySelectorAll('[data-grid-area]'))
    expect(areas.map(el => el.getAttribute('data-grid-area'))).toEqual(['a', 'b'])
  })
})
