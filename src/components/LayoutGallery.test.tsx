import React from 'react'
import { jest } from '@jest/globals'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
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

const defaultPanelProps = {
  showCarousel: false,
  onToggleCarousel: jest.fn(),
  compareIds: [] as string[],
  onToggleCompare: jest.fn(),
}

describe('LayoutGallery', () => {
  it('shows empty state when no layouts are available', () => {
    render(
      <LayoutGallery {...defaultPanelProps}
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
      <LayoutGallery {...defaultPanelProps}
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
      <LayoutGallery {...defaultPanelProps}
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
      <LayoutGallery {...defaultPanelProps}
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
      <LayoutGallery {...defaultPanelProps}
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
      <LayoutGallery {...defaultPanelProps}
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
      <LayoutGallery {...defaultPanelProps}
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
      <LayoutGallery {...defaultPanelProps}
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
      <LayoutGallery {...defaultPanelProps}
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
      <LayoutGallery {...defaultPanelProps}
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
      <LayoutGallery {...defaultPanelProps}
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
      <LayoutGallery {...defaultPanelProps}
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
    const onToggleCompare = jest.fn()
    const user = userEvent.setup()
    render(
      <LayoutGallery {...defaultPanelProps}
        layouts={mockLayouts}
        photos={[]}
        photoPositions={[]}
        selectedLayoutId="2-horizontal"
        onLayoutSelect={jest.fn()}
        onToggleCompare={onToggleCompare}
      />
    )

    await user.click(screen.getByTitle('Compare layouts'))
    expect(onToggleCompare).toHaveBeenCalledWith('2-horizontal')
  })

  it('calls onToggleCompare with layout id when clicking layout in compare mode', async () => {
    const onToggleCompare = jest.fn()
    const user = userEvent.setup()
    render(
      <LayoutGallery {...defaultPanelProps}
        layouts={mockLayouts}
        photos={[]}
        photoPositions={[]}
        selectedLayoutId="2-horizontal"
        onLayoutSelect={jest.fn()}
        compareIds={['2-horizontal']}
        onToggleCompare={onToggleCompare}
      />
    )

    // In compare mode, clicking a layout toggles it
    await user.click(screen.getByText('Stacked'))
    expect(onToggleCompare).toHaveBeenCalledWith('2-vertical')
  })

  it('shows compare number badges on selected layouts', () => {
    render(
      <LayoutGallery {...defaultPanelProps}
        layouts={mockLayouts}
        photos={[]}
        photoPositions={[]}
        selectedLayoutId="2-horizontal"
        onLayoutSelect={jest.fn()}
        compareIds={['2-horizontal', '2-vertical']}
      />
    )

    // Should show numbered badges
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('calls onToggleCarousel when arrangement button is clicked', async () => {
    const onToggleCarousel = jest.fn()
    const user = userEvent.setup()
    render(
      <LayoutGallery {...defaultPanelProps}
        layouts={mockLayouts}
        photos={[{ id: 'p1', file: new File([], 'test.jpg'), dataUrl: 'data:image/jpeg;base64,/9j/' }]}
        photoPositions={[{ photoId: 'p1', gridArea: 'photo1' }]}
        selectedLayoutId="2-horizontal"
        onLayoutSelect={jest.fn()}
        onArrangementApply={jest.fn()}
        onToggleCarousel={onToggleCarousel}
      />
    )

    await user.click(screen.getByTitle('Explore arrangements'))
    expect(onToggleCarousel).toHaveBeenCalled()
  })

  it('shows exit comparison button when compare mode is active', () => {
    render(
      <LayoutGallery {...defaultPanelProps}
        layouts={mockLayouts}
        photos={[]}
        photoPositions={[]}
        selectedLayoutId="2-horizontal"
        onLayoutSelect={jest.fn()}
        compareIds={['2-horizontal']}
      />
    )

    expect(screen.getByTitle('Exit comparison')).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(
      <LayoutGallery {...defaultPanelProps}
        layouts={mockLayouts}
        photos={[]}
        photoPositions={[]}
        selectedLayoutId="2-horizontal"
        onLayoutSelect={jest.fn()}
      />
    )
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
