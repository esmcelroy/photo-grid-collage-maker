import '@testing-library/jest-dom/jest-globals'
import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { PhotoAnalysis } from '@/lib/face-detection'
import type { PhotoPosition, UploadedPhoto } from '@/lib/types'

const updatePositions = jest.fn<(positions: PhotoPosition[]) => Promise<void>>()
const analyzePhotoWithCache = jest.fn<(photoId: string, dataUrl: string) => Promise<PhotoAnalysis>>()
const addPhoto = jest.fn<(photo: { id: string; dataUrl: string; fileName: string }) => Promise<void>>()
const correctExifOrientation = jest.fn<(file: File) => Promise<{ dataUrl: string; exifOrientation: number }>>()
const toastError = jest.fn()
const initMLWorker = jest.fn<() => Promise<void>>().mockResolvedValue(undefined)
let smartPositionMode: 'basic' | 'standard' | 'advanced' = 'basic'
let workerStatus = 'idle'
let nativeFaceDetector = false
let smartPositionEnabled = false

let collageState: {
  collageId: string
  photos: UploadedPhoto[]
  selectedLayoutId: string | null
  photoPositions: PhotoPosition[]
} = {} as never

const layout = {
  id: '1-single',
  name: 'Single',
  areas: [['a']],
  gridTemplate: '1fr',
  aspectRatio: '1 / 1',
}

jest.unstable_mockModule('@/hooks/useCollageApi', () => ({
  useCollageApi: () => ({
    ...collageState,
    settings: { gap: 8, backgroundColor: 'transparent', borderRadius: 0 },
    isLoading: false,
    initCollage: jest.fn(),
    addPhoto,
    removePhoto: jest.fn(),
    updateLayout: jest.fn(),
    updatePositions,
    updateSettings: jest.fn(),
    clearAll: jest.fn(),
  }),
}))
jest.unstable_mockModule('@/hooks/use-collage-history', () => ({
  useCollageHistory: () => ({ canUndo: false, canRedo: false, pushSnapshot: jest.fn(), undo: jest.fn(), redo: jest.fn(), setRestoring: jest.fn(), clear: jest.fn() }),
}))
jest.unstable_mockModule('@/hooks/use-dark-mode', () => ({
  useDarkMode: () => ({ theme: 'light', setTheme: jest.fn(), isDark: false }),
}))
jest.unstable_mockModule('@/hooks/use-smart-position', () => ({
  useSmartPositioning: () => ({ enabled: smartPositionEnabled, setEnabled: (enabled: boolean) => { smartPositionEnabled = enabled }, detectionMode: smartPositionMode, setDetectionMode: jest.fn() }),
}))
jest.unstable_mockModule('@/hooks/useOnlineStatus', () => ({ useOnlineStatus: () => ({ isOnline: true }) }))
jest.unstable_mockModule('@/hooks/useServiceWorker', () => ({ useServiceWorker: () => ({ needRefresh: false, updateSw: jest.fn(), offlineReady: false }) }))
jest.unstable_mockModule('@/lib/face-detection', () => ({
  analyzePhotoWithCache,
  calculateSmartPosition: (analysis: PhotoAnalysis) => `${Math.round(analysis.subjectCenter.x * 100)}% ${Math.round(analysis.subjectCenter.y * 100)}%`,
  getCachedAnalysis: jest.fn(),
  clearAnalysisCache: jest.fn(),
  setAnalysisDetectionMode: jest.fn(),
}))
jest.unstable_mockModule('@/lib/layouts', () => ({
  getLayoutsForPhotoCount: () => [layout],
  getUniqueAreaNames: () => ['a'],
}))
jest.unstable_mockModule('@/lib/layout-scoring', () => ({ rankLayouts: jest.fn(), suggestPhotoArrangement: jest.fn() }))
jest.unstable_mockModule('@/lib/ml-worker-client', () => ({
  initMLWorker, disposeMLWorker: jest.fn(), getWorkerStatus: () => workerStatus, onWorkerStatusChange: () => () => {}, hasNativeFaceDetector: () => nativeFaceDetector,
}))
jest.unstable_mockModule('sonner', () => ({ toast: { error: toastError, success: jest.fn(), info: jest.fn(), loading: jest.fn(), dismiss: jest.fn() } }))

jest.unstable_mockModule('@/components/CollagePreview', () => ({
  CollagePreview: ({ onPositionsChange, photoPositions }: { onPositionsChange: (positions: PhotoPosition[]) => void; photoPositions: PhotoPosition[] }) => (
    <button onClick={() => onPositionsChange([{ ...photoPositions[0], objectPosition: '10% 20%' }])}>Manual crop</button>
  ),
}))
jest.unstable_mockModule('@/lib/image-utils', () => ({
  correctExifOrientation,
  generateUniqueId: () => crypto.randomUUID(),
  downloadCollage: jest.fn(),
}))
jest.unstable_mockModule('@/lib/heic-utils', () => ({
  processFilesForHeic: async (files: File[]) => ({ converted: files, errors: [] }),
}))
jest.unstable_mockModule('@/components/PhotoThumbnail', () => ({ PhotoThumbnail: () => null }))
jest.unstable_mockModule('@/components/ProjectLibrary', () => ({ ProjectLibrary: () => null }))
jest.unstable_mockModule('@/components/LayoutGallery', () => ({ LayoutGallery: () => null }))
jest.unstable_mockModule('@/components/CustomizationControls', () => ({ CustomizationControls: () => null }))
jest.unstable_mockModule('@/components/PresetGallery', () => ({ PresetGallery: () => null }))
jest.unstable_mockModule('@/components/ExportDialog', () => ({ ExportDialog: () => null }))
jest.unstable_mockModule('@/components/PhotoEditDialog', () => ({ PhotoEditDialog: () => null }))
jest.unstable_mockModule('@/components/ArrangementCarousel', () => ({ ArrangementCarousel: () => null }))
jest.unstable_mockModule('@/components/ComparePanel', () => ({ ComparePanel: () => null }))
jest.unstable_mockModule('@/components/AppFooter', () => ({ AppFooter: () => null }))
jest.unstable_mockModule('@/components/InstallButton', () => ({ InstallButton: () => null }))
jest.unstable_mockModule('@/components/OfflineBanner', () => ({ OfflineBanner: () => null }))
jest.unstable_mockModule('@/components/UpdateToast', () => ({ UpdateToast: () => null }))
jest.unstable_mockModule('@/components/ui/sonner', () => ({ Toaster: () => null }))

const { default: App } = await import('@/App')

const analysis = (photoId: string, x = 70): PhotoAnalysis => ({
  photoId,
  regions: [{ x: 0, y: 0, width: 1, height: 1, confidence: 1, type: 'face' }],
  subjectCenter: { x: x / 100, y: 0.4 },
  analyzedAt: Date.now(),
})

const photo = (dataUrl = 'data:image/jpeg;base64,first'): UploadedPhoto => ({
  id: 'photo-1',
  dataUrl,
  file: new File([], 'photo.jpg', { type: 'image/jpeg' }),
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(result => { resolve = result })
  return { promise, resolve }
}

async function enableSmartPositioning(view: { rerender: (ui: React.ReactNode) => void }) {
  fireEvent.click(await screen.findByRole('switch', { name: 'Smart positioning' }))
  view.rerender(<App />)
}

describe('smart positioning integration', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    smartPositionMode = 'basic'
    workerStatus = 'idle'
    nativeFaceDetector = false
    smartPositionEnabled = false
    collageState = {
      collageId: 'session-1',
      photos: [photo()],
      selectedLayoutId: layout.id,
      photoPositions: [{ photoId: 'photo-1', gridArea: 'a' }],
    }
    updatePositions.mockResolvedValue(undefined)
  })

  it('settles after one cached analysis pass instead of re-triggering on completion', async () => {
    analyzePhotoWithCache.mockResolvedValue(analysis('photo-1'))
    const view = render(<App />)
    await enableSmartPositioning(view)

    await waitFor(() => expect(analyzePhotoWithCache).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(updatePositions).toHaveBeenCalledTimes(1))
    await act(async () => {})
    expect(analyzePhotoWithCache).toHaveBeenCalledTimes(1)
  })

  it('bounds upload preparation and waits for the batch before Advanced analysis, including a failed file', async () => {
    smartPositionEnabled = true
    smartPositionMode = 'advanced'
    workerStatus = 'ready'
    collageState = { ...collageState, photos: [], photoPositions: [], selectedLayoutId: null }
    const first = deferred<void>()
    const last = deferred<void>()
    let activeImages = 0
    let peakImages = 0
    let analysisDuringUpload = false
    let batchFinished = false
    const analyzedIds = new Set<string>()
    correctExifOrientation.mockImplementation(async file => {
      activeImages++
      peakImages = Math.max(peakImages, activeImages)
      try {
        if (file.name === 'first.jpg') await first.promise
        if (file.name === 'broken.jpg') throw new Error('Invalid image')
        if (file.name === 'last.jpg') await last.promise
        return { dataUrl: `data:image/jpeg;base64,${file.name}`, exifOrientation: 1 }
      } finally {
        activeImages--
      }
    })
    analyzePhotoWithCache.mockImplementation(async id => {
      analysisDuringUpload ||= !batchFinished
      analyzedIds.add(id)
      return analysis(id)
    })
    const view = render(<App />)
    addPhoto.mockImplementation(async uploaded => {
      collageState = {
        ...collageState,
        photos: [...collageState.photos, { id: uploaded.id, dataUrl: uploaded.dataUrl, file: new File([], uploaded.fileName) }],
        photoPositions: [{ photoId: uploaded.id, gridArea: 'a' }],
      }
      if (uploaded.fileName === 'last.jpg') batchFinished = true
      view.rerender(<App />)
    })
    const files = ['first.jpg', 'broken.jpg', 'last.jpg'].map(name => new File(['photo'], name, { type: 'image/jpeg' }))
    fireEvent.change(view.container.querySelector('input[accept^="image/"]')!, { target: { files } })
    await waitFor(() => expect(activeImages).toBeGreaterThan(0))
    await act(async () => { first.resolve() })
    await waitFor(() => expect(collageState.photos).toHaveLength(1))
    expect(screen.queryByText('Preview', { exact: true })).not.toBeInTheDocument()
    await act(async () => { last.resolve() })
    await waitFor(() => expect(collageState.photos).toHaveLength(2))
    await waitFor(() => expect(analyzedIds).toEqual(new Set(collageState.photos.map(p => p.id))))
    expect(screen.getByText('Preview', { exact: true })).toBeInTheDocument()
    expect(collageState.photos.map(p => p.file.name)).toEqual(['first.jpg', 'last.jpg'])
    expect(peakImages).toBe(1)
    expect(analysisDuringUpload).toBe(false)
  })

  it('ignores an older analysis result when photo input changes', async () => {
    const first = deferred<PhotoAnalysis>()
    const second = deferred<PhotoAnalysis>()
    analyzePhotoWithCache.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const view = render(<App />)
    await enableSmartPositioning(view)

    await waitFor(() => expect(analyzePhotoWithCache).toHaveBeenCalledTimes(1))
    collageState = { ...collageState, photos: [photo('data:image/jpeg;base64,newer')] }
    view.rerender(<App />)
    await waitFor(() => expect(analyzePhotoWithCache).toHaveBeenCalledTimes(2))

    await act(async () => { second.resolve(analysis('photo-1', 80)) })
    await waitFor(() => expect(updatePositions).toHaveBeenCalledWith([{ photoId: 'photo-1', gridArea: 'a', objectPosition: '80% 40%' }]))
    await act(async () => { first.resolve(analysis('photo-1', 20)) })
    expect(updatePositions).toHaveBeenCalledTimes(1)
  })

  it('does not overwrite a manual crop before its save completes while analysis is pending', async () => {
    const pending = deferred<PhotoAnalysis>()
    analyzePhotoWithCache.mockReturnValue(pending.promise)
    const view = render(<App />)
    await enableSmartPositioning(view)
    await waitFor(() => expect(analyzePhotoWithCache).toHaveBeenCalledTimes(1))

    updatePositions.mockReturnValueOnce(new Promise(() => {}))
    fireEvent.click(screen.getByRole('button', { name: 'Manual crop' }))
    await act(async () => { pending.resolve(analysis('photo-1')) })

    expect(updatePositions).toHaveBeenCalledTimes(1)
    expect(updatePositions).toHaveBeenLastCalledWith([{ photoId: 'photo-1', gridArea: 'a', objectPosition: '10% 20%' }])
  })

  it('does not overwrite a manual crop when detection mode changes', async () => {
    analyzePhotoWithCache.mockResolvedValue(analysis('photo-1'))
    const view = render(<App />)
    await enableSmartPositioning(view)
    await waitFor(() => expect(updatePositions).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: 'Manual crop' }))
    collageState = { ...collageState, photoPositions: [{ photoId: 'photo-1', gridArea: 'a', objectPosition: '10% 20%' }] }
    view.rerender(<App />)
    smartPositionMode = 'standard'
    nativeFaceDetector = true
    view.rerender(<App />)

    await waitFor(() => expect(analyzePhotoWithCache).toHaveBeenCalledTimes(2))
    expect(updatePositions).toHaveBeenCalledTimes(2)
    expect(updatePositions).toHaveBeenLastCalledWith([{ photoId: 'photo-1', gridArea: 'a', objectPosition: '10% 20%' }])
  })

  it('reports manual position save failures', async () => {
    analyzePhotoWithCache.mockReturnValue(new Promise(() => {}))
    updatePositions.mockRejectedValueOnce(new Error('IndexedDB unavailable'))
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Manual crop' }))
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Failed to update photo positions'))
  })
})
