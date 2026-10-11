import { useCallback, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { UploadedPhoto, PhotoPosition, CollageSettings } from '@/lib/types'
import * as collageDb from '@/lib/db'

// ---------------------------------------------------------------------------
// Session ID helpers
// ---------------------------------------------------------------------------

const SESSION_KEY = 'collage-session-id'

function readSessionId(): string | null {
  return localStorage.getItem(SESSION_KEY)
}

function writeSessionId(id: string): void {
  localStorage.setItem(SESSION_KEY, id)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getMimeTypeFromDataUrl(dataUrl: string): string {
  const match = dataUrl.match(/^data:(image\/[^;]+);/i)
  return match?.[1] ?? 'image/jpeg'
}

function dbPhotoToUploadedPhoto(photo: { id: string; fileName: string; dataUrl: string }): UploadedPhoto {
  const mimeType = getMimeTypeFromDataUrl(photo.dataUrl)
  const blob = new Blob([], { type: mimeType })
  const file = new File([blob], photo.fileName, { type: mimeType })
  return { id: photo.id, file, dataUrl: photo.dataUrl }
}

interface CollageApiState {
  id: string
  photos: UploadedPhoto[]
  selectedLayoutId: string | null
  photoPositions: PhotoPosition[]
  settings: CollageSettings
}

class MissingCollageError extends Error {
  constructor() {
    super('The saved collage could not be found')
    this.name = 'MissingCollageError'
  }
}

async function fetchCollageFromDb(id: string): Promise<CollageApiState> {
  const state = await collageDb.getCollageState(id)
  if (!state) throw new MissingCollageError()
  return {
    ...state,
    photos: state.photos.map(dbPhotoToUploadedPhoto),
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCollageApi() {
  const queryClient = useQueryClient()

  // React state for session ID so changes trigger re-renders
  const [sessionId, setSessionIdState] = useState<string | null>(() => readSessionId())
  // Ref always holds latest sessionId for use inside mutation closures
  const sessionIdRef = useRef(sessionId)
  sessionIdRef.current = sessionId

  const setSessionId = useCallback((id: string) => {
    writeSessionId(id)
    setSessionIdState(id)
  }, [])

  const queryKey = ['collage', sessionId]

  const {
    data: collageState,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: () => fetchCollageFromDb(sessionId!),
    enabled: !!sessionId,
    staleTime: 0,
  })

  const initMutation = useMutation({
    mutationFn: collageDb.createCollage,
    onSuccess: (data) => {
      setSessionId(data.id)
    },
  })

  const addPhotoMutation = useMutation({
    mutationFn: ({ collageId, photo }: { collageId: string; photo: { id: string; dataUrl: string; fileName: string } }) =>
      collageDb.addPhoto(collageId, photo),
    onSuccess: (dbPhoto, { collageId }) => {
      const key = ['collage', collageId]
      queryClient.setQueryData<CollageApiState | undefined>(key, (current) => {
        if (!current) return current
        return {
          ...current,
          photos: [...current.photos, dbPhotoToUploadedPhoto(dbPhoto)],
        }
      })
    },
  })

  const removePhotoMutation = useMutation({
    mutationFn: (photoId: string) => collageDb.removePhoto(sessionIdRef.current!, photoId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['collage', sessionIdRef.current] }),
  })

  const updateLayoutMutation = useMutation({
    mutationFn: (params: { selectedLayoutId: string | null; photoPositions: PhotoPosition[] }) =>
      collageDb.updateCollage(sessionIdRef.current!, params),
    onSuccess: (data) => {
      const key = ['collage', sessionIdRef.current]
      queryClient.setQueryData(key, { ...data, photos: data.photos.map(dbPhotoToUploadedPhoto) })
    },
  })

  const updatePositionsMutation = useMutation({
    mutationFn: (photoPositions: PhotoPosition[]) =>
      collageDb.updateCollage(sessionIdRef.current!, { photoPositions }),
    onSuccess: (data) => {
      const key = ['collage', sessionIdRef.current]
      queryClient.setQueryData(key, { ...data, photos: data.photos.map(dbPhotoToUploadedPhoto) })
    },
  })

  const updateSettingsMutation = useMutation({
    mutationFn: (settings: CollageSettings) =>
      collageDb.updateCollage(sessionIdRef.current!, { settings }),
    onSuccess: (data) => {
      const key = ['collage', sessionIdRef.current]
      queryClient.setQueryData(key, { ...data, photos: data.photos.map(dbPhotoToUploadedPhoto) })
    },
  })

  const clearAllMutation = useMutation({
    mutationFn: async () => {
      const currentId = sessionIdRef.current
      const { id } = currentId
        ? await collageDb.replaceCollage(currentId)
        : await collageDb.createCollage()
      setSessionId(id)
      return { id }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['collage'] }),
  })

  // Use refs for mutation objects to stabilize callbacks
  const initMutationRef = useRef(initMutation)
  initMutationRef.current = initMutation
  const addPhotoMutationRef = useRef(addPhotoMutation)
  addPhotoMutationRef.current = addPhotoMutation
  const removePhotoMutationRef = useRef(removePhotoMutation)
  removePhotoMutationRef.current = removePhotoMutation
  const updateLayoutMutationRef = useRef(updateLayoutMutation)
  updateLayoutMutationRef.current = updateLayoutMutation
  const updatePositionsMutationRef = useRef(updatePositionsMutation)
  updatePositionsMutationRef.current = updatePositionsMutation
  const updateSettingsMutationRef = useRef(updateSettingsMutation)
  updateSettingsMutationRef.current = updateSettingsMutation
  const clearAllMutationRef = useRef(clearAllMutation)
  clearAllMutationRef.current = clearAllMutation

  const initCollage = useCallback(() => initMutationRef.current.mutateAsync(), [])
  const updateLayout = useCallback(
    (selectedLayoutId: string | null, photoPositions: PhotoPosition[]) =>
      updateLayoutMutationRef.current.mutateAsync({ selectedLayoutId, photoPositions }),
    []
  )
  const updatePositions = useCallback(
    (photoPositions: PhotoPosition[]) =>
      updatePositionsMutationRef.current.mutateAsync(photoPositions),
    []
  )
  const updateSettings = useCallback(
    (settings: CollageSettings) => updateSettingsMutationRef.current.mutateAsync(settings),
    []
  )
  const recoverSession = useCallback(() => initMutationRef.current.mutateAsync(), [])
  const retry = useCallback(() => refetch(), [refetch])
  const sessionError = error
    ? { kind: error instanceof MissingCollageError ? 'missing' as const : 'read' as const, error }
    : null

  return {
    // State
    collageId: sessionId,
    photos: collageState?.photos ?? [],
    selectedLayoutId: collageState?.selectedLayoutId ?? null,
    photoPositions: collageState?.photoPositions ?? [],
    settings: collageState?.settings ?? { gap: 8, backgroundColor: 'transparent', borderRadius: 0 },
    isLoading,
    error,
    initError: initMutation.error,
    isInitializing: initMutation.isPending,
    sessionError,

    // Actions
    initCollage,
    addPhoto: (photo: { id: string; dataUrl: string; fileName: string }) => {
      const currentId = sessionIdRef.current
      if (!currentId) return Promise.reject(new Error('No active collage'))
      return addPhotoMutationRef.current.mutateAsync({ collageId: currentId, photo })
    },
    removePhoto: (photoId: string) => removePhotoMutationRef.current.mutateAsync(photoId),
    updateLayout,
    updatePositions,
    updateSettings,
    clearAll: () => clearAllMutationRef.current.mutateAsync(),
    recoverSession,
    retryInitialization: initCollage,
    retry,
  }
}
