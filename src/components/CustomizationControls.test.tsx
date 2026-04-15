import React from 'react'
import { jest } from '@jest/globals'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CustomizationControls } from '@/components/CustomizationControls'

// Radix Popover uses portals that don't work in jsdom — render children directly.
// NOTE: Using a factory that avoids JSX (plain React.createElement) to side-step
// jest.mock hoist-time issues with the automatic JSX runtime in ESM mode.
jest.mock('@/components/ui/popover', () => ({
  Popover: (props: Record<string, unknown>) =>
    React.createElement('div', null, props.children),
  PopoverTrigger: (props: Record<string, unknown>) =>
    React.createElement(React.Fragment, null, props.children),
  PopoverContent: (props: Record<string, unknown>) =>
    React.createElement('div', null, props.children),
}))

// Intentionally NOT mocking the Slider: mocking with JSX or React.createElement
// inside jest.mock() factory functions is unreliable in ESM mode because the JSX
// runtime / React import is not yet in scope at hoist time.
// We interact with the real Radix Slider via ARIA keyboard events instead.

const defaultSettings = { gap: 8, backgroundColor: 'transparent', borderRadius: 0 }

describe('CustomizationControls', () => {
  it('renders the Customize heading', () => {
    render(<CustomizationControls settings={defaultSettings} onSettingsChange={jest.fn()} />)
    expect(screen.getByText('Customize')).toBeInTheDocument()
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
    expect(screen.getByText(/custom color/i)).toBeInTheDocument()
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
    const user = userEvent.setup()
    const onSettingsChange = jest.fn()
    render(<CustomizationControls settings={defaultSettings} onSettingsChange={onSettingsChange} />)

    // The Popover mock isn't reliable in ESM jest — interact with the real Radix
    // Popover by clicking its trigger to open it first.
    await user.click(screen.getByText(/custom color/i))

    // Content is rendered in a portal to document.body; findBy* waits for it
    const colorInput = await screen.findByLabelText(/pick a custom color/i)
    fireEvent.change(colorInput, { target: { value: '#ff0000' } })

    expect(onSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({ backgroundColor: '#ff0000' })
    )
  })
})
