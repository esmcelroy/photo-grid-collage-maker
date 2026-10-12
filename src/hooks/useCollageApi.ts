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
  name: string
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
    name: state.name ?? 'Untitled collage',
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

  const projectsQuery = useQuery({ queryKey: ['projects'], queryFn: collageDb.listProjects, staleTime: 0 })

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
    mutationFn: ({ collageId, photoId }: { collageId: string; photoId: string }) => collageDb.removePhoto(collageId, photoId),
    onSuccess: (_, { collageId }) => queryClient.invalidateQueries({ queryKey: ['collage', collageId] }),
  })

  const updateLayoutMutation = useMutation({
    mutationFn: ({ collageId, ...params }: { collageId: string; selectedLayoutId: string | null; photoPositions: PhotoPosition[] }) => collageDb.updateCollage(collageId, params),
    onSuccess: (data, { collageId }) => {
      const key = ['collage', collageId]
      queryClient.setQueryData(key, { ...data, photos: data.photos.map(dbPhotoToUploadedPhoto) })
    },
  })

  const updatePositionsMutation = useMutation({
    mutationFn: ({ collageId, photoPositions }: { collageId: string; photoPositions: PhotoPosition[] }) => collageDb.updateCollage(collageId, { photoPositions }),
    onSuccess: (data, { collageId }) => {
      const key = ['collage', collageId]
      queryClient.setQueryData(key, { ...data, photos: data.photos.map(dbPhotoToUploadedPhoto) })
    },
  })

  const updateSettingsMutation = useMutation({
    mutationFn: ({ collageId, settings }: { collageId: string; settings: CollageSettings }) => collageDb.updateCollage(collageId, { settings }),
    onSuccess: (data, { collageId }) => {
      const key = ['collage', collageId]
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

  const initCollage = useCallback(() => initMutationRef.current.mutateAsync(undefined), [])
  const updateLayout = useCallback(
    (selectedLayoutId: string | null, photoPositions: PhotoPosition[]) =>
      updateLayoutMutationRef.current.mutateAsync({ collageId: sessionIdRef.current!, selectedLayoutId, photoPositions }),
    []
  )
  const updatePositions = useCallback(
    (photoPositions: PhotoPosition[]) =>
      updatePositionsMutationRef.current.mutateAsync({ collageId: sessionIdRef.current!, photoPositions }),
    []
  )
  const updateSettings = useCallback(
    (settings: CollageSettings) => updateSettingsMutationRef.current.mutateAsync({ collageId: sessionIdRef.current!, settings }),
    []
  )
  const recoverSession = useCallback(() => initMutationRef.current.mutateAsync(undefined), [])
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
    removePhoto: (photoId: string) => removePhotoMutationRef.current.mutateAsync({ collageId: sessionIdRef.current!, photoId }),
    updateLayout,
    updatePositions,
    updateSettings,
    clearAll: () => clearAllMutationRef.current.mutateAsync(),
    recoverSession,
    retryInitialization: initCollage,
    retry,
    projects: projectsQuery.data ?? [],
    createProject: async (name: string) => { const project = await collageDb.createCollage(name); setSessionId(project.id); await queryClient.invalidateQueries({ queryKey: ['projects'] }) },
    openProject: (id: string) => setSessionId(id),
    renameProject: async (id: string, name: string) => { await collageDb.updateCollage(id, { name }); await queryClient.invalidateQueries({ queryKey: ['projects'] }); await queryClient.invalidateQueries({ queryKey: ['collage', id] }) },
    duplicateProject: async (id: string) => { const project = await collageDb.duplicateCollage(id); setSessionId(project.id); await queryClient.invalidateQueries({ queryKey: ['projects'] }) },
    deleteProject: async (id: string) => { await collageDb.deleteCollage(id); await queryClient.invalidateQueries({ queryKey: ['projects'] }); if (sessionIdRef.current === id) { const next = await collageDb.createCollage(); setSessionId(next.id) } },
    exportProject: () => collageDb.exportProject(sessionIdRef.current!),
    importProject: async (backup: unknown) => { const project = await collageDb.importProject(backup); setSessionId(project.id); await queryClient.invalidateQueries({ queryKey: ['projects'] }) },
  }
}
