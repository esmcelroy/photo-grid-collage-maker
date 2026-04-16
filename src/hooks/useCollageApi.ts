import { useCallback, useMemo, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { UploadedPhoto, PhotoPosition, CollageSettings } from '@/lib/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ApiPhoto {
  id: string
  fileName: string
  dataUrl: string
}

interface CollageApiState {
  id: string
  photos: UploadedPhoto[]
  selectedLayoutId: string | null
  photoPositions: PhotoPosition[]
  settings: CollageSettings
}

// ---------------------------------------------------------------------------
// Session ID helpers
// ---------------------------------------------------------------------------

const SESSION_KEY = 'collage-session-id'

function getSessionId(): string | null {
  return localStorage.getItem(SESSION_KEY)
}

function setSessionId(id: string): void {
  localStorage.setItem(SESSION_KEY, id)
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

const API_BASE = '/api'

async function createCollage(): Promise<{ id: string }> {
  const res = await fetch(`${API_BASE}/collages`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to create collage')
  return res.json()
}

async function fetchCollage(id: string): Promise<CollageApiState> {
  const res = await fetch(`${API_BASE}/collages/${id}`)
  if (res.status === 404) throw new Error('Collage not found')
  if (!res.ok) throw new Error('Failed to fetch collage')
  const data = await res.json()
  return {
    ...data,
    photos: data.photos.map(apiPhotoToUploadedPhoto),
  }
}

async function patchCollage(
  id: string,
  body: {
    selectedLayoutId?: string | null
    photoPositions?: PhotoPosition[]
    settings?: CollageSettings
  }
): Promise<CollageApiState> {
  const res = await fetch(`${API_BASE}/collages/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error('Failed to update collage')
  const data = await res.json()
  return { ...data, photos: data.photos.map(apiPhotoToUploadedPhoto) }
}

async function addPhotoRequest(
  collageId: string,
  photo: { id: string; dataUrl: string; fileName: string }
): Promise<ApiPhoto> {
  const res = await fetch(`${API_BASE}/collages/${collageId}/photos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(photo),
  })
  if (!res.ok) throw new Error('Failed to add photo')
  return res.json()
}

async function removePhotoRequest(collageId: string, photoId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/collages/${collageId}/photos/${photoId}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to remove photo')
}

function getMimeTypeFromDataUrl(dataUrl: string): string {
  const match = dataUrl.match(/^data:(image\/[^;]+);/i)
  return match?.[1] ?? 'image/jpeg'
}

function apiPhotoToUploadedPhoto(apiPhoto: ApiPhoto): UploadedPhoto {
  const mimeType = getMimeTypeFromDataUrl(apiPhoto.dataUrl)
  const blob = new Blob([], { type: mimeType })
  const file = new File([blob], apiPhoto.fileName, { type: mimeType })
  return { id: apiPhoto.id, file, dataUrl: apiPhoto.dataUrl }
}

// Stable default values — never create new references on every render
const EMPTY_PHOTOS: UploadedPhoto[] = []
const EMPTY_POSITIONS: PhotoPosition[] = []
const DEFAULT_SETTINGS: CollageSettings = { gap: 8, backgroundColor: 'transparent', borderRadius: 0 }

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCollageApi() {
  const queryClient = useQueryClient()

  const sessionId = getSessionId()
  const queryKey = useMemo(() => ['collage', sessionId], [sessionId])

  const {
    data: collageState,
    isLoading,
    error,
  } = useQuery({
    queryKey,
    queryFn: () => fetchCollage(sessionId!),
    enabled: !!sessionId,
    staleTime: 0,
  })

  // Stable refs so mutation callbacks always read current values without
  // needing to be listed as dependencies (avoids render-cycle cascades).
  const sessionIdRef = useRef(sessionId)
  sessionIdRef.current = sessionId

  const queryKeyRef = useRef(queryKey)
  queryKeyRef.current = queryKey

  const queryClientRef = useRef(queryClient)
  queryClientRef.current = queryClient

  const initMutation = useMutation({
    mutationFn: createCollage,
    onSuccess: (data) => {
      setSessionId(data.id)
      queryClientRef.current.invalidateQueries({ queryKey: ['collage'] })
    },
  })

  const addPhotoMutation = useMutation({
    mutationFn: (photo: { id: string; dataUrl: string; fileName: string }) =>
      addPhotoRequest(sessionIdRef.current!, photo),
    onSuccess: (apiPhoto) => {
      queryClientRef.current.setQueryData<CollageApiState | undefined>(queryKeyRef.current, (current) => {
        if (!current) return current
        return {
          ...current,
          photos: [...current.photos, apiPhotoToUploadedPhoto(apiPhoto)],
        }
      })
    },
  })

  const removePhotoMutation = useMutation({
    mutationFn: (photoId: string) => removePhotoRequest(sessionIdRef.current!, photoId),
    onSuccess: () => queryClientRef.current.invalidateQueries({ queryKey: queryKeyRef.current }),
  })

  const updateLayoutMutation = useMutation({
    mutationFn: (params: { selectedLayoutId: string | null; photoPositions: PhotoPosition[] }) =>
      patchCollage(sessionIdRef.current!, params),
    onSuccess: (data) => queryClientRef.current.setQueryData(queryKeyRef.current, data),
  })

  const updatePositionsMutation = useMutation({
    mutationFn: (photoPositions: PhotoPosition[]) =>
      patchCollage(sessionIdRef.current!, { photoPositions }),
    onSuccess: (data) => queryClientRef.current.setQueryData(queryKeyRef.current, data),
  })

  const updateSettingsMutation = useMutation({
    mutationFn: (settings: CollageSettings) =>
      patchCollage(sessionIdRef.current!, { settings }),
    onSuccess: (data) => queryClientRef.current.setQueryData(queryKeyRef.current, data),
  })

  const clearAllMutation = useMutation({
    mutationFn: async () => {
      const { id } = await createCollage()
      setSessionId(id)
      return { id }
    },
    onSuccess: () => queryClientRef.current.invalidateQueries({ queryKey: ['collage'] }),
  })

  // All action callbacks use empty deps — they read current values via refs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initCollage = useCallback(() => initMutation.mutate(), [])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const addPhoto = useCallback(
    (photo: { id: string; dataUrl: string; fileName: string }) =>
      addPhotoMutation.mutateAsync(photo),
    []
  )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const removePhoto = useCallback(
    (photoId: string) => removePhotoMutation.mutateAsync(photoId),
    []
  )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const updateLayout = useCallback(
    (selectedLayoutId: string | null, photoPositions: PhotoPosition[]) =>
      updateLayoutMutation.mutateAsync({ selectedLayoutId, photoPositions }),
    []
  )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const updatePositions = useCallback(
    (photoPositions: PhotoPosition[]) =>
      updatePositionsMutation.mutateAsync(photoPositions),
    []
  )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const updateSettings = useCallback(
    (settings: CollageSettings) => updateSettingsMutation.mutateAsync(settings),
    []
  )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const clearAll = useCallback(() => clearAllMutation.mutateAsync(), [])

  return {
    // State — stable references for defaults to avoid triggering effects
    collageId: sessionId,
    photos: collageState?.photos ?? EMPTY_PHOTOS,
    selectedLayoutId: collageState?.selectedLayoutId ?? null,
    photoPositions: collageState?.photoPositions ?? EMPTY_POSITIONS,
    settings: collageState?.settings ?? DEFAULT_SETTINGS,
    isLoading,
    error,

    // Actions — all stable references
    initCollage,
    addPhoto,
    removePhoto,
    updateLayout,
    updatePositions,
    updateSettings,
    clearAll,
  }
}
