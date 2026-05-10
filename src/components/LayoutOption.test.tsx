import React from 'react'
import { jest } from '@jest/globals'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { LayoutOption } from '@/components/LayoutOption'

const mockLayout = {
  id: '1-landscape',
  name: 'Landscape',
  photoCount: 1,
  gridTemplate: '1fr',
  areas: ['a'],
  aspectRatio: '16/9',
}

const longNameLayout = {
  id: '1-instagram-story',
  name: 'Instagram Story',
  photoCount: 1,
  gridTemplate: '1fr',
  areas: ['a'],
  aspectRatio: '9/16',
}

const defaultProps = {
  layout: mockLayout,
  photos: [],
  photoPositions: [],
  isSelected: false,
  onSelect: jest.fn(),
}

describe('LayoutOption', () => {
  it('renders the layout name as label text', () => {
    render(<LayoutOption {...defaultProps} />)
    expect(screen.getByText('Landscape')).toBeInTheDocument()
  })

  it('label has truncate class for text-overflow: ellipsis', () => {
    const { container } = render(<LayoutOption {...defaultProps} />)
    const label = container.querySelector('p')
    expect(label).not.toBeNull()
    expect(label!.className).toMatch(/\btruncate\b/)
  })

  it('label has title attribute with the full layout name', () => {
    const { container } = render(<LayoutOption {...defaultProps} />)
    const label = container.querySelector('p')
    expect(label).not.toBeNull()
    expect(label!.getAttribute('title')).toBe('Landscape')
  })

  it('long layout names have title attribute with full name', () => {
    const { container } = render(
      <LayoutOption {...defaultProps} layout={longNameLayout} />
    )
    const label = container.querySelector('p')
    expect(label).not.toBeNull()
    expect(label!.getAttribute('title')).toBe('Instagram Story')
  })

  it('calls onSelect when clicked', async () => {
    const onSelect = jest.fn()
    const user = userEvent.setup()
    render(<LayoutOption {...defaultProps} onSelect={onSelect} />)
    await user.click(screen.getByRole('button', { name: /select landscape layout/i }))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('calls onSelect on Enter key press', async () => {
    const onSelect = jest.fn()
    const user = userEvent.setup()
    render(<LayoutOption {...defaultProps} onSelect={onSelect} />)
    const card = screen.getByRole('button', { name: /select landscape layout/i })
    card.focus()
    await user.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('shows selected state with accent color', () => {
    const { container } = render(
      <LayoutOption {...defaultProps} isSelected={true} />
    )
    const label = container.querySelector('p')
    expect(label).not.toBeNull()
    expect(label!.className).toMatch(/text-accent/)
  })

  it('shows unselected state with muted-foreground color', () => {
    const { container } = render(
      <LayoutOption {...defaultProps} isSelected={false} />
    )
    const label = container.querySelector('p')
    expect(label).not.toBeNull()
    expect(label!.className).toMatch(/text-muted-foreground/)
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<LayoutOption {...defaultProps} />)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
