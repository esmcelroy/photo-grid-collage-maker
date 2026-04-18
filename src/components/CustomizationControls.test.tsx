import React from 'react'
import { jest } from '@jest/globals'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Radix Popover uses portals that don't work in jsdom — render children directly.
jest.unstable_mockModule('@/components/ui/popover', () => ({
  Popover: (props: { children?: React.ReactNode }) =>
    React.createElement('div', null, props.children),
  PopoverTrigger: (props: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, props.children),
  PopoverContent: (props: { children?: React.ReactNode }) =>
    React.createElement('div', null, props.children),
}))

const { CustomizationControls } = await import('@/components/CustomizationControls')

// Intentionally NOT mocking the Slider: mocking with JSX or React.createElement
// inside jest.mock() factory functions is unreliable in ESM mode because the JSX
// runtime / React import is not yet in scope at hoist time.
// We interact with the real Radix Slider via ARIA keyboard events instead.

const defaultSettings = { gap: 8, backgroundColor: 'transparent', borderRadius: 0 }

describe('CustomizationControls', () => {
  it('renders the Photo Spacing label', () => {
    render(<CustomizationControls settings={defaultSettings} onSettingsChange={jest.fn()} />)
    expect(screen.getByText('Photo Spacing')).toBeInTheDocument()
  })

  it('displays the current gap value', () => {
    render(<CustomizationControls settings={defaultSettings} onSettingsChange={jest.fn()} />)
    expect(screen.getByText('8px')).toBeInTheDocument()
  })

  it('displays the current border radius value', () => {
    render(
      <CustomizationControls
        settings={{ ...defaultSettings, borderRadius: 16 }}
        onSettingsChange={jest.fn()}
      />
    )
    expect(screen.getByText('16px')).toBeInTheDocument()
  })

  it('calls onSettingsChange when a color is selected', async () => {
    const onSettingsChange = jest.fn()
    render(<CustomizationControls settings={defaultSettings} onSettingsChange={onSettingsChange} />)
    // Click the White preset color button
    const whiteBtn = screen.getByTitle('White')
    await userEvent.click(whiteBtn)
    expect(onSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({ backgroundColor: '#FFFFFF' })
    )
  })

  it('shows "Custom Color" button', () => {
    render(<CustomizationControls settings={defaultSettings} onSettingsChange={jest.fn()} />)
    expect(screen.getByRole('button', { name: /custom color/i })).toBeInTheDocument()
  })

  // ─── slider onValueChange handlers ────────────────────────────────────────
  // The real Radix Slider responds to ARIA keyboard events (Arrow keys);
  // firing them in jsdom triggers the internal onValueChange callback.

  it('calls onSettingsChange with an incremented gap when the spacing slider moves right', () => {
    const onSettingsChange = jest.fn()
    render(<CustomizationControls settings={defaultSettings} onSettingsChange={onSettingsChange} />)

    // getAllByRole('slider') returns the Radix Slider thumbs in DOM order
    const [gapSlider] = screen.getAllByRole('slider')
    gapSlider.focus()
    fireEvent.keyDown(gapSlider, { key: 'ArrowRight', code: 'ArrowRight' })

    // gap starts at 8, step is 2 → expected 10
    expect(onSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({ gap: 10 })
    )
  })

  it('calls onSettingsChange with an incremented borderRadius when the corner-radius slider moves right', () => {
    const onSettingsChange = jest.fn()
    render(<CustomizationControls settings={defaultSettings} onSettingsChange={onSettingsChange} />)

    // Second slider in DOM order is the border-radius slider
    const [, radiusSlider] = screen.getAllByRole('slider')
    radiusSlider.focus()
    fireEvent.keyDown(radiusSlider, { key: 'ArrowRight', code: 'ArrowRight' })

    // borderRadius starts at 0, step is 2 → expected 2
    expect(onSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({ borderRadius: 2 })
    )
  })

  // ─── custom colour picker ─────────────────────────────────────────────────

  it('calls onSettingsChange with updated backgroundColor when the custom colour input changes', async () => {
    const onSettingsChange = jest.fn()
    render(<CustomizationControls settings={defaultSettings} onSettingsChange={onSettingsChange} />)

    // The Popover mock renders content inline, so the color input is already in the DOM
    const colorInput = screen.getByLabelText(/pick a custom color/i)
    fireEvent.change(colorInput, { target: { value: '#ff0000' } })

    expect(onSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({ backgroundColor: '#ff0000' })
    )
  })
})
