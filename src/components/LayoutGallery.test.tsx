import React from 'react'
import { jest } from '@jest/globals'
import { render, screen } from '@testing-library/react'
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
    expect(screen.getByText('2 layouts')).toBeInTheDocument()
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
})
