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
})
