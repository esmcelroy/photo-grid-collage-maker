/**
 * useCollageApi — unit tests
 *
 * Tests confirm the correct Dexie database operations are invoked for each action.
 * The hook is backed by IndexedDB (via Dexie) instead of a REST API.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { renderHook, waitFor, act } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Mock the Dexie database module before importing the hook
jest.unstable_mockModule('@/lib/db', () => ({
  createCollage: jest.fn(),
  getCollageState: jest.fn(),
  updateCollage: jest.fn(),
  addPhoto: jest.fn(),
  removePhoto: jest.fn(),
  deleteCollage: jest.fn(),
  replaceCollage: jest.fn(),
  listProjects: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
  db: {},
}))

// Dynamic imports after mock registration (ESM requirement)
const collageDb = await import('@/lib/db')
const { useCollageApi } = await import('@/hooks/useCollageApi')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SESSION_KEY = 'collage-session-id'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  })
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { wrapper: Wrapper, queryClient }
}

const mockCollageState = {
  id: 'test-session-id',
  photos: [{ id: 'photo-1', fileName: 'test.jpg', dataUrl: 'data:image/jpeg;base64,abc' }],
  selectedLayoutId: 'layout-1',
  photoPositions: [{ photoId: 'photo-1', gridArea: 'photo1' }],
  settings: { gap: 8, backgroundColor: '#ffffff', borderRadius: 0 },
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useCollageApi', () => {
  beforeEach(() => {
    localStorage.clear()
    jest.clearAllMocks()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('keeps an old multi-step operation bound to its project after switching', async () => {
    const states = new Map<string, import('@/lib/db').CollageState>(['a', 'b'].map(id => [id, { ...mockCollageState, id }]))
    localStorage.setItem(SESSION_KEY, 'a')
    jest.mocked(collageDb.getCollageState).mockImplementation(async id => states.get(id)!)
    jest.mocked(collageDb.updateCollage).mockImplementation(async (id, patch) => {
      const state = { ...states.get(id)!, ...patch }
      states.set(id, state)
      return state
    })
    const { wrapper } = createWrapper()
    const { result } = renderHook(() => useCollageApi(), { wrapper })
    await waitFor(() => expect(result.current.photos).toHaveLength(1))
    const originalOperation = result.current.updateSettings
    await act(async () => { await result.current.openProject('b') })
    await waitFor(() => expect(result.current.collageId).toBe('b'))
    await act(async () => { await originalOperation({ gap: 24, borderRadius: 12, backgroundColor: '#abcdef' }) })
    expect(states.get('a')!.settings.gap).toBe(24)
    expect(states.get('b')!.settings.gap).toBe(8)
    expect(result.current.settings.gap).toBe(8)
  })

  it('does not reactivate a late-created project after an explicit switch', async () => {
    localStorage.setItem(SESSION_KEY, 'a')
    jest.mocked(collageDb.getCollageState).mockImplementation(async id => ({ ...mockCollageState, id }))
    let finish!: (value: { id: string }) => void
    jest.mocked(collageDb.createCollage).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const { wrapper } = createWrapper()
    const { result } = renderHook(() => useCollageApi(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    let creation!: Promise<void>
    act(() => { creation = result.current.createProject('Slow creation') })
    await act(async () => { await result.current.openProject('b') })
    await act(async () => { finish({ id: 'late' }); await creation })
    expect(result.current.collageId).toBe('b')
    expect(localStorage.getItem(SESSION_KEY)).toBe('b')
    expect(result.current.settings.gap).toBe(8)
  })

  describe('when no session exists', () => {
    it('returns empty default values before any session is initialized', () => {
      const { wrapper } = createWrapper()
      const { result } = renderHook(() => useCollageApi(), { wrapper })

      expect(result.current.collageId).toBeNull()
      expect(result.current.photos).toEqual([])
      expect(result.current.selectedLayoutId).toBeNull()
      expect(result.current.photoPositions).toEqual([])
      expect(result.current.settings).toEqual({
        gap: 8,
        backgroundColor: 'transparent',
        borderRadius: 0,
      })
    })

    it('does not call getCollageState when no session ID is present', () => {
      const { wrapper } = createWrapper()
      renderHook(() => useCollageApi(), { wrapper })

      expect(collageDb.getCollageState).not.toHaveBeenCalled()
    })
  })

  describe('initCollage', () => {
    it('calls createCollage and stores the returned id in localStorage', async () => {
      ;(collageDb.createCollage as jest.MockedFunction<typeof collageDb.createCollage>)
        .mockResolvedValueOnce({ id: 'new-session-id' })
      ;(collageDb.getCollageState as jest.MockedFunction<typeof collageDb.getCollageState>)
        .mockResolvedValue({ ...mockCollageState, id: 'new-session-id' })

      const { wrapper } = createWrapper()
      const { result } = renderHook(() => useCollageApi(), { wrapper })

      await act(async () => {
        result.current.initCollage()
      })

      await waitFor(() => {
        expect(localStorage.getItem(SESSION_KEY)).toBe('new-session-id')
      })

      expect(collageDb.createCollage).toHaveBeenCalled()
    })
  })

  describe('addPhoto', () => {
    it('calls addPhoto with the correct collageId and photo payload', async () => {
      localStorage.setItem(SESSION_KEY, 'test-session-id')

      ;(collageDb.getCollageState as jest.MockedFunction<typeof collageDb.getCollageState>)
        .mockResolvedValue(mockCollageState)
      ;(collageDb.addPhoto as jest.MockedFunction<typeof collageDb.addPhoto>)
        .mockResolvedValueOnce({ id: 'photo-2', fileName: 'new.jpg', dataUrl: 'data:image/jpeg;base64,xyz' })

      const { wrapper } = createWrapper()
      const { result } = renderHook(() => useCollageApi(), { wrapper })

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      await act(async () => {
        await result.current.addPhoto({
          id: 'photo-2',
          dataUrl: 'data:image/jpeg;base64,xyz',
          fileName: 'new.jpg',
        })
      })

      expect(collageDb.addPhoto).toHaveBeenCalledWith('test-session-id', {
        id: 'photo-2',
        dataUrl: 'data:image/jpeg;base64,xyz',
        fileName: 'new.jpg',
      })
    })
  })

  describe('removePhoto', () => {
    it('calls removePhoto with the correct collageId and photoId', async () => {
      localStorage.setItem(SESSION_KEY, 'test-session-id')

      ;(collageDb.getCollageState as jest.MockedFunction<typeof collageDb.getCollageState>)
        .mockResolvedValue(mockCollageState)
      ;(collageDb.removePhoto as jest.MockedFunction<typeof collageDb.removePhoto>)
        .mockResolvedValueOnce(undefined)

      const { wrapper } = createWrapper()
      const { result } = renderHook(() => useCollageApi(), { wrapper })

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      await act(async () => {
        await result.current.removePhoto('photo-1')
      })

      expect(collageDb.removePhoto).toHaveBeenCalledWith('test-session-id', 'photo-1')
    })
  })

  describe('updateLayout', () => {
    it('calls updateCollage with selectedLayoutId and photoPositions', async () => {
      localStorage.setItem(SESSION_KEY, 'test-session-id')

      const positions = [{ photoId: 'photo-1', gridArea: 'a' }]

      ;(collageDb.getCollageState as jest.MockedFunction<typeof collageDb.getCollageState>)
        .mockResolvedValue(mockCollageState)
      ;(collageDb.updateCollage as jest.MockedFunction<typeof collageDb.updateCollage>)
        .mockResolvedValueOnce({ ...mockCollageState, selectedLayoutId: 'layout-2', photoPositions: positions })

      const { wrapper } = createWrapper()
      const { result } = renderHook(() => useCollageApi(), { wrapper })

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      await act(async () => {
        await result.current.updateLayout('layout-2', positions)
      })

      expect(collageDb.updateCollage).toHaveBeenCalledWith('test-session-id', {
        selectedLayoutId: 'layout-2',
        photoPositions: positions,
      })
    })
  })

  describe('updatePositions', () => {
    it('calls updateCollage with photoPositions only', async () => {
      localStorage.setItem(SESSION_KEY, 'test-session-id')

      const positions = [{ photoId: 'photo-1', gridArea: 'b' }]

      ;(collageDb.getCollageState as jest.MockedFunction<typeof collageDb.getCollageState>)
        .mockResolvedValue(mockCollageState)
      ;(collageDb.updateCollage as jest.MockedFunction<typeof collageDb.updateCollage>)
        .mockResolvedValueOnce({ ...mockCollageState, photoPositions: positions })

      const { wrapper } = createWrapper()
      const { result } = renderHook(() => useCollageApi(), { wrapper })

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      await act(async () => {
        await result.current.updatePositions(positions)
      })

      expect(collageDb.updateCollage).toHaveBeenCalledWith('test-session-id', {
        photoPositions: positions,
      })
    })
  })

  describe('updateSettings', () => {
    it('calls updateCollage with settings', async () => {
      localStorage.setItem(SESSION_KEY, 'test-session-id')

      const updatedSettings = { gap: 16, backgroundColor: '#000000', borderRadius: 4 }

      ;(collageDb.getCollageState as jest.MockedFunction<typeof collageDb.getCollageState>)
        .mockResolvedValue(mockCollageState)
      ;(collageDb.updateCollage as jest.MockedFunction<typeof collageDb.updateCollage>)
        .mockResolvedValueOnce({ ...mockCollageState, settings: updatedSettings })

      const { wrapper } = createWrapper()
      const { result } = renderHook(() => useCollageApi(), { wrapper })

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      await act(async () => {
        await result.current.updateSettings(updatedSettings)
      })

      expect(collageDb.updateCollage).toHaveBeenCalledWith('test-session-id', {
        settings: updatedSettings,
      })
    })
  })

  describe('clearAll', () => {
    it('replaces the previous collage and updates the session id', async () => {
      localStorage.setItem(SESSION_KEY, 'test-session-id')

      ;(collageDb.getCollageState as jest.MockedFunction<typeof collageDb.getCollageState>)
        .mockResolvedValue(mockCollageState)
      ;(collageDb.replaceCollage as jest.MockedFunction<typeof collageDb.replaceCollage>)
        .mockResolvedValueOnce({ id: 'new-cleared-id' })

      const { wrapper } = createWrapper()
      const { result } = renderHook(() => useCollageApi(), { wrapper })

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      await act(async () => {
        await result.current.clearAll()
      })

      expect(collageDb.replaceCollage).toHaveBeenCalledWith('test-session-id')
      expect(localStorage.getItem(SESSION_KEY)).toBe('new-cleared-id')
    })
  })

  describe('error handling', () => {
    it('exposes an error when getCollageState throws', async () => {
      localStorage.setItem(SESSION_KEY, 'test-session-id')

      ;(collageDb.getCollageState as jest.MockedFunction<typeof collageDb.getCollageState>)
        .mockRejectedValue(new Error('Collage not found'))

      const { wrapper } = createWrapper()
      const { result } = renderHook(() => useCollageApi(), { wrapper })

      await waitFor(() => expect(result.current.error).not.toBeNull())

      expect(result.current.error).toBeInstanceOf(Error)
    })
  })

  describe('existing session', () => {
    it('loads collage state from localStorage session id on mount', async () => {
      localStorage.setItem(SESSION_KEY, 'test-session-id')

      ;(collageDb.getCollageState as jest.MockedFunction<typeof collageDb.getCollageState>)
        .mockResolvedValue(mockCollageState)

      const { wrapper } = createWrapper()
      const { result } = renderHook(() => useCollageApi(), { wrapper })

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      expect(result.current.collageId).toBe('test-session-id')
      expect(result.current.photos).toHaveLength(1)
      expect(result.current.selectedLayoutId).toBe('layout-1')
      expect(collageDb.getCollageState).toHaveBeenCalledWith('test-session-id')
    })

    it('keeps a stale session ID until the user explicitly recovers', async () => {
      localStorage.setItem(SESSION_KEY, 'missing-session-id')
      ;(collageDb.getCollageState as jest.MockedFunction<typeof collageDb.getCollageState>)
        .mockResolvedValue(null)

      const { wrapper } = createWrapper()
      const { result } = renderHook(() => useCollageApi(), { wrapper })

      await waitFor(() => expect(result.current.sessionError?.kind).toBe('missing'))
      expect(localStorage.getItem(SESSION_KEY)).toBe('missing-session-id')

      ;(collageDb.createCollage as jest.MockedFunction<typeof collageDb.createCollage>)
        .mockResolvedValueOnce({ id: 'recovered-session-id' })
      ;(collageDb.getCollageState as jest.MockedFunction<typeof collageDb.getCollageState>)
        .mockResolvedValue({ ...mockCollageState, id: 'recovered-session-id' })

      await act(async () => {
        await result.current.recoverSession()
      })

      expect(localStorage.getItem(SESSION_KEY)).toBe('recovered-session-id')
    })
  })
})
