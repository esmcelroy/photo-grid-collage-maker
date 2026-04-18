import React from 'react'
import { jest } from '@jest/globals'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PresetGallery } from '@/components/PresetGallery'
import { BUILT_IN_PRESETS, CollagePreset } from '@/lib/presets'
import { CollageSettings } from '@/lib/types'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    clear: () => {
      store = {}
    },
  }
})()

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

const defaultSettings: CollageSettings = {
  gap: 4,
  backgroundColor: '#ffffff',
  borderRadius: 0,
}

beforeEach(() => {
  localStorageMock.clear()
})

describe('PresetGallery', () => {
  it('renders all built-in presets', () => {
    render(
      <PresetGallery onApplyPreset={jest.fn()} currentSettings={defaultSettings} />,
    )
    for (const preset of BUILT_IN_PRESETS) {
      expect(screen.getByText(preset.name)).toBeInTheDocument()
    }
  })

  it('clicking a preset calls onApplyPreset with correct settings', async () => {
    const user = userEvent.setup()
    const onApply = jest.fn<(s: CollageSettings) => void>()
    render(
      <PresetGallery onApplyPreset={onApply} currentSettings={defaultSettings} />,
    )

    await user.click(screen.getByText('Dark Moody'))
    expect(onApply).toHaveBeenCalledWith(BUILT_IN_PRESETS[1].settings)
  })

  it('active preset is visually highlighted', () => {
    const { container } = render(
      <PresetGallery onApplyPreset={jest.fn()} currentSettings={defaultSettings} />,
    )
    // "Clean White" matches defaultSettings
    const cleanWhiteBtn = screen.getByText('Clean White').closest('button')!
    expect(cleanWhiteBtn.className).toContain('border-accent')
  })

  it('save button shows save dialog', async () => {
    const user = userEvent.setup()
    render(
      <PresetGallery onApplyPreset={jest.fn()} currentSettings={defaultSettings} />,
    )

    expect(screen.queryByPlaceholderText('Preset name')).not.toBeInTheDocument()
    await user.click(screen.getByText('Save Current'))
    expect(screen.getByPlaceholderText('Preset name')).toBeInTheDocument()
  })

  it('can save a custom preset', async () => {
    const user = userEvent.setup()
    const customSettings: CollageSettings = {
      gap: 20,
      backgroundColor: '#abcdef',
      borderRadius: 10,
    }
    render(
      <PresetGallery onApplyPreset={jest.fn()} currentSettings={customSettings} />,
    )

    await user.click(screen.getByText('Save Current'))
    await user.type(screen.getByPlaceholderText('Preset name'), 'My Custom')
    await user.click(screen.getByText('Save'))

    expect(screen.getByText('My Custom')).toBeInTheDocument()
    // Verify persisted to localStorage
    const stored = JSON.parse(localStorage.getItem('collage-custom-presets')!)
    expect(stored).toHaveLength(1)
    expect(stored[0].name).toBe('My Custom')
  })

  it('can delete a custom preset', async () => {
    const user = userEvent.setup()
    const custom: CollagePreset[] = [
      {
        id: 'custom-del',
        name: 'Deletable',
        settings: { gap: 5, backgroundColor: '#111', borderRadius: 2 },
        isCustom: true,
      },
    ]
    localStorage.setItem('collage-custom-presets', JSON.stringify(custom))

    render(
      <PresetGallery onApplyPreset={jest.fn()} currentSettings={defaultSettings} />,
    )

    expect(screen.getByText('Deletable')).toBeInTheDocument()
    await user.click(screen.getByLabelText('Delete Deletable'))
    expect(screen.queryByText('Deletable')).not.toBeInTheDocument()
  })
})
