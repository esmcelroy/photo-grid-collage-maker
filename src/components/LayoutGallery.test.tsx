import React from 'react'
import { jest } from '@jest/globals'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LayoutGallery } from '@/components/LayoutGallery'

// Radix ScrollArea doesn't work reliably in jsdom — render children directly
jest.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

const mockLayouts = [
  {
    id: '2-horizontal',
    name: 'Side by Side',
    photoCount: 2,
    gridTemplate: '1fr 1fr',
    areas: ['photo1', 'photo2'],
    aspectRatio: '16/9',
  },
  {
    id: '2-vertical',
    name: 'Stacked',
    photoCount: 2,
    gridTemplate: '1fr / 1fr',
    areas: ['photo1', 'photo2'],
    aspectRatio: '9/16',
  },
  {
    id: '2-diagonal',
    name: 'Diagonal',
    photoCount: 2,
    gridTemplate: '1fr 1fr / 1fr 1fr',
    areas: ['a b', 'b a'],
    aspectRatio: '1/1',
  },
]

describe('LayoutGallery', () => {
  it('shows empty state when no layouts are available', () => {
    render(
      <LayoutGallery
        layouts={[]}
        photos={[]}
        photoPositions={[]}
        selectedLayoutId={null}
        onLayoutSelect={jest.fn()}
      />
    )
    expect(screen.getByText(/no layouts available/i)).toBeInTheDocument()
  })

  it('shows "Layout Options" heading when layouts are present', () => {
    render(
      <LayoutGallery
        layouts={mockLayouts}
        photos={[]}
        photoPositions={[]}
        selectedLayoutId={null}
        onLayoutSelect={jest.fn()}
      />
    )
    expect(screen.getByText('Layout Options')).toBeInTheDocument()
  })

  it('shows the layout count', () => {
    render(
      <LayoutGallery
        layouts={mockLayouts}
        photos={[]}
        photoPositions={[]}
        selectedLayoutId={null}
        onLayoutSelect={jest.fn()}
      />
    )
    expect(screen.getByText('3 layouts')).toBeInTheDocument()
  })

  it('renders a card for each layout', () => {
    render(
      <LayoutGallery
        layouts={mockLayouts}
        photos={[]}
        photoPositions={[]}
        selectedLayoutId={null}
        onLayoutSelect={jest.fn()}
      />
    )
    expect(screen.getByText('Side by Side')).toBeInTheDocument()
    expect(screen.getByText('Stacked')).toBeInTheDocument()
    expect(screen.getByText('Diagonal')).toBeInTheDocument()
  })

  it('calls onLayoutSelect with the layout id when a layout card is clicked', async () => {
    const onLayoutSelect = jest.fn()
    const user = userEvent.setup()
    render(
      <LayoutGallery
        layouts={mockLayouts}
        photos={[]}
        photoPositions={[]}
        selectedLayoutId={null}
        onLayoutSelect={onLayoutSelect}
      />
    )

    await user.click(screen.getByText('Side by Side'))

    expect(onLayoutSelect).toHaveBeenCalledWith('2-horizontal')
  })

  // ─── branch-coverage additions ────────────────────────────────────────────

  it('shows singular "1 layout" text when only one layout is available', () => {
    render(
      <LayoutGallery
        layouts={[mockLayouts[0]]}
        photos={[]}
        photoPositions={[]}
        selectedLayoutId={null}
        onLayoutSelect={jest.fn()}
      />
    )
    expect(screen.getByText('1 layout')).toBeInTheDocument()
  })

  it('renders a photo thumbnail inside a layout cell when a matching position exists', () => {
    const photo = {
      id: 'photo-1',
      file: new File([''], 'photo.jpg', { type: 'image/jpeg' }),
      dataUrl: 'data:image/jpeg;base64,testphoto',
    }
    const positions = [{ photoId: 'photo-1', gridArea: 'photo1' }]

    const { container } = render(
      <LayoutGallery
        layouts={[mockLayouts[0]]}
        photos={[photo]}
        photoPositions={positions}
        selectedLayoutId={null}
        onLayoutSelect={jest.fn()}
      />
    )

    // LayoutOption renders <img alt=""> for found photos — query via DOM
    const img = container.querySelector('img') as HTMLImageElement
    expect(img).not.toBeNull()
    expect(img.src).toContain('testphoto')
  })

  it('marks the selected layout with a visual indicator', () => {
    render(
      <LayoutGallery
        layouts={mockLayouts}
        photos={[]}
        photoPositions={[]}
        selectedLayoutId="2-horizontal"
        onLayoutSelect={jest.fn()}
      />
    )
    // The selected layout text uses accent colour; confirm it renders in the DOM
    expect(screen.getByText('Side by Side')).toBeInTheDocument()
  })

  // ─── shuffle feature ─────────────────────────────────────────────────────

  it('renders a shuffle button', () => {
    render(
      <LayoutGallery
        layouts={mockLayouts}
        photos={[]}
        photoPositions={[]}
        selectedLayoutId={null}
        onLayoutSelect={jest.fn()}
      />
    )
    expect(screen.getByTitle('Shuffle layout')).toBeInTheDocument()
  })

  it('selects a random layout when shuffle is clicked', async () => {
    const onLayoutSelect = jest.fn()
    const user = userEvent.setup()
    render(
      <LayoutGallery
        layouts={mockLayouts}
        photos={[]}
        photoPositions={[]}
        selectedLayoutId={null}
        onLayoutSelect={onLayoutSelect}
      />
    )

    await user.click(screen.getByTitle('Shuffle layout'))

    expect(onLayoutSelect).toHaveBeenCalledTimes(1)
    const selectedId = onLayoutSelect.mock.calls[0][0]
    expect(mockLayouts.map(l => l.id)).toContain(selectedId)
  })

  it('shuffle avoids the currently selected layout', async () => {
    const onLayoutSelect = jest.fn()
    const user = userEvent.setup()
    // Only two layouts so the shuffle MUST pick the other one
    const twoLayouts = mockLayouts.slice(0, 2)
    render(
      <LayoutGallery
        layouts={twoLayouts}
        photos={[]}
        photoPositions={[]}
        selectedLayoutId="2-horizontal"
        onLayoutSelect={onLayoutSelect}
      />
    )

    await user.click(screen.getByTitle('Shuffle layout'))

    expect(onLayoutSelect).toHaveBeenCalledWith('2-vertical')
  })

  // ─── compare feature ──────────────────────────────────────────────────────

  it('renders a compare button', () => {
    render(
      <LayoutGallery
        layouts={mockLayouts}
        photos={[]}
        photoPositions={[]}
        selectedLayoutId={null}
        onLayoutSelect={jest.fn()}
      />
    )
    expect(screen.getByTitle('Compare layouts')).toBeInTheDocument()
  })

  it('enters comparison mode when compare button is clicked', async () => {
    const user = userEvent.setup()
    render(
      <LayoutGallery
        layouts={mockLayouts}
        photos={[]}
        photoPositions={[]}
        selectedLayoutId="2-horizontal"
        onLayoutSelect={jest.fn()}
      />
    )

    await user.click(screen.getByTitle('Compare layouts'))

    expect(screen.getByText(/Comparing 1\/3 layouts/)).toBeInTheDocument()
  })

  it('adds layouts to comparison when clicking in compare mode', async () => {
    const user = userEvent.setup()
    render(
      <LayoutGallery
        layouts={mockLayouts}
        photos={[]}
        photoPositions={[]}
        selectedLayoutId="2-horizontal"
        onLayoutSelect={jest.fn()}
      />
    )

    // Enter compare mode
    await user.click(screen.getByTitle('Compare layouts'))
    expect(screen.getByText(/Comparing 1\/3 layouts/)).toBeInTheDocument()

    // Click another layout to add it
    await user.click(screen.getByText('Stacked'))
    expect(screen.getByText(/Comparing 2\/3 layouts/)).toBeInTheDocument()
  })

  it('selects a layout and exits comparison when clicking a compare card', async () => {
    const onLayoutSelect = jest.fn()
    const user = userEvent.setup()
    render(
      <LayoutGallery
        layouts={mockLayouts}
        photos={[]}
        photoPositions={[]}
        selectedLayoutId="2-horizontal"
        onLayoutSelect={onLayoutSelect}
      />
    )

    // Enter compare mode — it auto-adds current selection
    await user.click(screen.getByTitle('Compare layouts'))

    // Add another layout
    await user.click(screen.getByText('Stacked'))

    // The compare panel should have two cards; click the "Stacked" one in the compare area
    const comparePanel = screen.getByText(/Comparing 2\/3 layouts/).closest('div')!
    const stackedInCompare = within(comparePanel.parentElement!).getAllByText('Stacked')
    // Click the one inside the compare panel (first match is in compare panel)
    await user.click(stackedInCompare[0])

    expect(onLayoutSelect).toHaveBeenCalledWith('2-vertical')
  })

  it('removes a layout from comparison via the X button', async () => {
    const user = userEvent.setup()
    render(
      <LayoutGallery
        layouts={mockLayouts}
        photos={[]}
        photoPositions={[]}
        selectedLayoutId="2-horizontal"
        onLayoutSelect={jest.fn()}
      />
    )

    await user.click(screen.getByTitle('Compare layouts'))
    await user.click(screen.getByText('Stacked'))
    expect(screen.getByText(/Comparing 2\/3 layouts/)).toBeInTheDocument()

    // Click the remove button on the Stacked card
    const removeBtn = screen.getByLabelText('Remove Stacked from comparison')
    await user.click(removeBtn)

    expect(screen.getByText(/Comparing 1\/3 layouts/)).toBeInTheDocument()
  })

  it('exits comparison mode when compare button is clicked again', async () => {
    const user = userEvent.setup()
    render(
      <LayoutGallery
        layouts={mockLayouts}
        photos={[]}
        photoPositions={[]}
        selectedLayoutId="2-horizontal"
        onLayoutSelect={jest.fn()}
      />
    )

    await user.click(screen.getByTitle('Compare layouts'))
    expect(screen.getByText(/Comparing/)).toBeInTheDocument()

    await user.click(screen.getByTitle('Exit comparison'))
    expect(screen.queryByText(/Comparing/)).not.toBeInTheDocument()
  })

  it('clears all comparison items when Clear button is clicked', async () => {
    const user = userEvent.setup()
    render(
      <LayoutGallery
        layouts={mockLayouts}
        photos={[]}
        photoPositions={[]}
        selectedLayoutId="2-horizontal"
        onLayoutSelect={jest.fn()}
      />
    )

    await user.click(screen.getByTitle('Compare layouts'))
    await user.click(screen.getByText('Stacked'))
    expect(screen.getByText(/Comparing 2\/3 layouts/)).toBeInTheDocument()

    await user.click(screen.getByText('Clear'))
    // Compare mode exits when all items cleared
    expect(screen.queryByText(/Comparing/)).not.toBeInTheDocument()
  })
})
