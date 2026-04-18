import {
  BUILT_IN_PRESETS,
  loadCustomPresets,
  saveCustomPresets,
  getAllPresets,
  CollagePreset,
} from './presets'

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

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock })

beforeEach(() => {
  localStorageMock.clear()
})

describe('BUILT_IN_PRESETS', () => {
  it('has 6 built-in presets', () => {
    expect(BUILT_IN_PRESETS).toHaveLength(6)
  })

  it('each preset has valid settings', () => {
    for (const preset of BUILT_IN_PRESETS) {
      expect(preset.id).toBeTruthy()
      expect(preset.name).toBeTruthy()
      expect(typeof preset.settings.gap).toBe('number')
      expect(typeof preset.settings.backgroundColor).toBe('string')
      expect(typeof preset.settings.borderRadius).toBe('number')
    }
  })
})

describe('loadCustomPresets', () => {
  it('returns empty array when localStorage is empty', () => {
    expect(loadCustomPresets()).toEqual([])
  })

  it('returns parsed presets from localStorage', () => {
    const presets: CollagePreset[] = [
      {
        id: 'custom-1',
        name: 'My Preset',
        settings: { gap: 10, backgroundColor: '#ff0000', borderRadius: 5 },
        isCustom: true,
      },
    ]
    localStorage.setItem('collage-custom-presets', JSON.stringify(presets))
    expect(loadCustomPresets()).toEqual(presets)
  })

  it('returns empty array on invalid JSON', () => {
    localStorage.setItem('collage-custom-presets', 'not valid json')
    expect(loadCustomPresets()).toEqual([])
  })
})

describe('saveCustomPresets', () => {
  it('writes to localStorage', () => {
    const presets: CollagePreset[] = [
      {
        id: 'custom-2',
        name: 'Saved',
        settings: { gap: 5, backgroundColor: '#00ff00', borderRadius: 3 },
        isCustom: true,
      },
    ]
    saveCustomPresets(presets)
    expect(JSON.parse(localStorage.getItem('collage-custom-presets')!)).toEqual(presets)
  })
})

describe('getAllPresets', () => {
  it('combines built-in and custom presets', () => {
    const custom: CollagePreset[] = [
      {
        id: 'custom-3',
        name: 'Extra',
        settings: { gap: 1, backgroundColor: '#0000ff', borderRadius: 0 },
        isCustom: true,
      },
    ]
    const all = getAllPresets(custom)
    expect(all).toHaveLength(BUILT_IN_PRESETS.length + 1)
    expect(all[all.length - 1].id).toBe('custom-3')
  })
})
