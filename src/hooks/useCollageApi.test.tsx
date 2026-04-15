/**
 * useCollageApi — unit tests
 *
 * Tests confirm the correct fetch calls are made for each action.
 * Server-level behavior is tested at the API layer; here we verify
 * the hook wires the right HTTP verbs, URLs, and request bodies.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { renderHook, waitFor, act } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useCollageApi } from '@/hooks/useCollageApi'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SESSION_KEY = 'collage-session-id'

/** Create a fresh QueryClient per test — prevents cross-test cache pollution. */
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

/** Minimal API response that satisfies the CollageState shape. */
const mockServerState = {
  id: 'test-session-id',
  photos: [{ id: 'photo-1', fileName: 'test.jpg', dataUrl: 'data:image/jpeg;base64,abc' }],
  selectedLayoutId: 'layout-1',
  photoPositions: [{ photoId: 'photo-1', gridArea: 'photo1' }],
  settings: { gap: 8, backgroundColor: '#ffffff', borderRadius: 0 },
}

/** Build a minimal fetch mock response. */
function mockResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  } as unknown as Response
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useCollageApi', () => {
  beforeEach(() => {
    localStorage.clear()
    // Replace the global fetch with a jest mock before every test.
    // Cast through unknown so TypeScript accepts the assignment; tests use
    // jest.MockedFunction<typeof fetch> to get the correctly-typed mock API.
    global.fetch = jest.fn() as unknown as typeof fetch
  })

  afterEach(() => {
    localStorage.clear()
  })

  // -------------------------------------------------------------------------
  // Default state — no session in localStorage
  // -------------------------------------------------------------------------

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

    it('does not call fetch when no session ID is present', () => {
      const { wrapper } = createWrapper()
      renderHook(() => useCollageApi(), { wrapper })

      expect(global.fetch).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // initCollage
  // -------------------------------------------------------------------------

  describe('initCollage', () => {
    it('calls POST /api/collages and stores the returned id in localStorage', async () => {
      const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>
      mockFetch.mockResolvedValueOnce(mockResponse({ id: 'new-session-id' }))
      // After setSessionId the query key changes and a GET fires — stub it
      mockFetch.mockResolvedValueOnce(mockResponse({ ...mockServerState, id: 'new-session-id' }))

      const { wrapper } = createWrapper()
      const { result } = renderHook(() => useCollageApi(), { wrapper })

      await act(async () => {
        result.current.initCollage()
      })

      await waitFor(() => {
        expect(localStorage.getItem(SESSION_KEY)).toBe('new-session-id')
      })

      expect(mockFetch).toHaveBeenCalledWith('/api/collages', { method: 'POST' })
    })
  })

  // -------------------------------------------------------------------------
  // addPhoto
  // -------------------------------------------------------------------------

  describe('addPhoto', () => {
    it('calls POST /api/collages/:id/photos with the photo payload', async () => {
      localStorage.setItem(SESSION_KEY, 'test-session-id')

      const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>
      // Initial GET on mount
      mockFetch.mockResolvedValueOnce(mockResponse(mockServerState))
      // POST new photo
      mockFetch.mockResolvedValueOnce(
        mockResponse({ id: 'photo-2', fileName: 'new.jpg', dataUrl: 'data:image/jpeg;base64,xyz' })
      )
      // Refetch after invalidation
      mockFetch.mockResolvedValueOnce(mockResponse(mockServerState))

      const { wrapper } = createWrapper()
      const { result } = renderHook(() => useCollageApi(), { wrapper })

      // Wait for initial load to settle
      await waitFor(() => expect(result.current.isLoading).toBe(false))

      await act(async () => {
        await result.current.addPhoto({
          id: 'photo-2',
          dataUrl: 'data:image/jpeg;base64,xyz',
          fileName: 'new.jpg',
        })
      })

      expect(mockFetch).toHaveBeenCalledWith('/api/collages/test-session-id/photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'photo-2',
          dataUrl: 'data:image/jpeg;base64,xyz',
          fileName: 'new.jpg',
        }),
      })
    })
  })

  // -------------------------------------------------------------------------
  // updateSettings
  // -------------------------------------------------------------------------

  describe('updateSettings', () => {
    it('calls PATCH /api/collages/:id with settings in the request body', async () => {
      localStorage.setItem(SESSION_KEY, 'test-session-id')

      const updatedSettings = { gap: 16, backgroundColor: '#000000', borderRadius: 4 }

      const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>
      // Initial GET on mount
      mockFetch.mockResolvedValueOnce(mockResponse(mockServerState))
      // PATCH settings
      mockFetch.mockResolvedValueOnce(
        mockResponse({ ...mockServerState, settings: updatedSettings })
      )

      const { wrapper } = createWrapper()
      const { result } = renderHook(() => useCollageApi(), { wrapper })

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      await act(async () => {
        await result.current.updateSettings(updatedSettings)
      })

      expect(mockFetch).toHaveBeenCalledWith('/api/collages/test-session-id', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: updatedSettings }),
      })
    })
  })

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('exposes an error when the collage fetch returns a non-ok response', async () => {
      localStorage.setItem(SESSION_KEY, 'test-session-id')

      const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>
      mockFetch.mockResolvedValueOnce(mockResponse({}, false /* ok = false */))

      const { wrapper } = createWrapper()
      const { result } = renderHook(() => useCollageApi(), { wrapper })

      await waitFor(() => expect(result.current.error).not.toBeNull())

      expect(result.current.error).toBeInstanceOf(Error)
    })
  })
})
