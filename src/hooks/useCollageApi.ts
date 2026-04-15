import { useCallback } from 'react'
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

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCollageApi() {
  const queryClient = useQueryClient()

  const sessionId = getSessionId()
  const queryKey = ['collage', sessionId]

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

  // Initialize a new collage session if no ID exists
  const initMutation = useMutation({
    mutationFn: createCollage,
    onSuccess: (data) => {
      setSessionId(data.id)
      queryClient.invalidateQueries({ queryKey: ['collage'] })
    },
  })

  const addPhotoMutation = useMutation({
    mutationFn: (photo: { id: string; dataUrl: string; fileName: string }) =>
      addPhotoRequest(sessionId!, photo),
    onSuccess: (apiPhoto) => {
      queryClient.setQueryData<CollageApiState | undefined>(queryKey, (current) => {
        if (!current) return current
        return {
          ...current,
          photos: [...current.photos, apiPhotoToUploadedPhoto(apiPhoto)],
        }
      })
    },
  })

  const removePhotoMutation = useMutation({
    mutationFn: (photoId: string) => removePhotoRequest(sessionId!, photoId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  const updateLayoutMutation = useMutation({
    mutationFn: (params: { selectedLayoutId: string | null; photoPositions: PhotoPosition[] }) =>
      patchCollage(sessionId!, params),
    onSuccess: (data) => queryClient.setQueryData(queryKey, data),
  })

  const updatePositionsMutation = useMutation({
    mutationFn: (photoPositions: PhotoPosition[]) =>
      patchCollage(sessionId!, { photoPositions }),
    onSuccess: (data) => queryClient.setQueryData(queryKey, data),
  })

  const updateSettingsMutation = useMutation({
    mutationFn: (settings: CollageSettings) =>
      patchCollage(sessionId!, { settings }),
    onSuccess: (data) => queryClient.setQueryData(queryKey, data),
  })

  const clearAllMutation = useMutation({
    mutationFn: async () => {
      const { id } = await createCollage()
      setSessionId(id)
      return { id }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['collage'] }),
  })

  const initCollage = useCallback(() => initMutation.mutate(), [initMutation])
  const updateLayout = useCallback(
    (selectedLayoutId: string | null, photoPositions: PhotoPosition[]) =>
      updateLayoutMutation.mutateAsync({ selectedLayoutId, photoPositions }),
    [updateLayoutMutation]
  )
  const updatePositions = useCallback(
    (photoPositions: PhotoPosition[]) =>
      updatePositionsMutation.mutateAsync(photoPositions),
    [updatePositionsMutation]
  )
  const updateSettings = useCallback(
    (settings: CollageSettings) => updateSettingsMutation.mutateAsync(settings),
    [updateSettingsMutation]
  )

  return {
    // State
    collageId: sessionId,
    photos: collageState?.photos ?? [],
    selectedLayoutId: collageState?.selectedLayoutId ?? null,
    photoPositions: collageState?.photoPositions ?? [],
    settings: collageState?.settings ?? { gap: 8, backgroundColor: 'transparent', borderRadius: 0 },
    isLoading,
    error,

    // Actions
    initCollage,
    addPhoto: (photo: { id: string; dataUrl: string; fileName: string }) =>
      addPhotoMutation.mutateAsync(photo),
    removePhoto: (photoId: string) => removePhotoMutation.mutateAsync(photoId),
    updateLayout,
    updatePositions,
    updateSettings,
    clearAll: () => clearAllMutation.mutateAsync(),
  }
}
