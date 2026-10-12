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
  const sessionGenerationRef = useRef(0)

  const setSessionId = useCallback((id: string) => {
    sessionGenerationRef.current += 1
    sessionIdRef.current = id
    writeSessionId(id)
    setSessionIdState(id)
  }, [])
  const refreshProjects = useCallback(() => queryClient.invalidateQueries({ queryKey: ['projects'] }), [queryClient])

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
    mutationFn: (_generation: number) => collageDb.createCollage(),
    onSuccess: (data, generation) => {
      if (generation === sessionGenerationRef.current) setSessionId(data.id)
      return refreshProjects()
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
      return refreshProjects()
    },
  })

  const removePhotoMutation = useMutation({
    mutationFn: ({ collageId, photoId }: { collageId: string; photoId: string }) => collageDb.removePhoto(collageId, photoId),
    onSuccess: (_, { collageId }) => Promise.all([
      queryClient.invalidateQueries({ queryKey: ['collage', collageId] }), refreshProjects(),
    ]),
  })

  const updateLayoutMutation = useMutation({
    mutationFn: ({ collageId, ...params }: { collageId: string; selectedLayoutId: string | null; photoPositions: PhotoPosition[] }) => collageDb.updateCollage(collageId, params),
    onSuccess: (data, { collageId }) => {
      const key = ['collage', collageId]
      queryClient.setQueryData(key, { ...data, photos: data.photos.map(dbPhotoToUploadedPhoto) })
      return refreshProjects()
    },
  })

  const updatePositionsMutation = useMutation({
    mutationFn: ({ collageId, photoPositions }: { collageId: string; photoPositions: PhotoPosition[] }) => collageDb.updateCollage(collageId, { photoPositions }),
    onSuccess: (data, { collageId }) => {
      const key = ['collage', collageId]
      queryClient.setQueryData(key, { ...data, photos: data.photos.map(dbPhotoToUploadedPhoto) })
      return refreshProjects()
    },
  })

  const updateSettingsMutation = useMutation({
    mutationFn: ({ collageId, settings }: { collageId: string; settings: CollageSettings }) => collageDb.updateCollage(collageId, { settings }),
    onSuccess: (data, { collageId }) => {
      const key = ['collage', collageId]
      queryClient.setQueryData(key, { ...data, photos: data.photos.map(dbPhotoToUploadedPhoto) })
      return refreshProjects()
    },
  })

  const clearAllMutation = useMutation({
    mutationFn: async ({ collageId, generation }: { collageId: string | null; generation: number }) => {
      const { id } = collageId
        ? await collageDb.replaceCollage(collageId)
        : await collageDb.createCollage()
      return { id, generation }
    },
    onSuccess: ({ id, generation }) => {
      if (generation === sessionGenerationRef.current) setSessionId(id)
      return Promise.all([queryClient.invalidateQueries({ queryKey: ['collage'] }), refreshProjects()])
    },
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

  const initCollage = useCallback(() => initMutationRef.current.mutateAsync(sessionGenerationRef.current), [])
  const updateLayout = useCallback(
    (selectedLayoutId: string | null, photoPositions: PhotoPosition[]) =>
      updateLayoutMutationRef.current.mutateAsync({ collageId: sessionId!, selectedLayoutId, photoPositions }),
    [sessionId]
  )
  const updatePositions = useCallback(
    (photoPositions: PhotoPosition[]) =>
      updatePositionsMutationRef.current.mutateAsync({ collageId: sessionId!, photoPositions }),
    [sessionId]
  )
  const updateSettings = useCallback(
    (settings: CollageSettings) => updateSettingsMutationRef.current.mutateAsync({ collageId: sessionId!, settings }),
    [sessionId]
  )
  const recoverSession = initCollage
  const retry = useCallback(() => refetch(), [refetch])
  const sessionError = error
    ? { kind: error instanceof MissingCollageError ? 'missing' as const : 'read' as const, error }
    : null

  const selectCreatedProject = async (creation: Promise<{ id: string }>) => {
    const generation = sessionGenerationRef.current
    const { id } = await creation
    const state = await fetchCollageFromDb(id)
    queryClient.setQueryData(['collage', id], state)
    if (generation === sessionGenerationRef.current) setSessionId(id)
    await refreshProjects()
  }

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
      const currentId = sessionId
      if (!currentId) return Promise.reject(new Error('No active collage'))
      return addPhotoMutationRef.current.mutateAsync({ collageId: currentId, photo })
    },
    removePhoto: (photoId: string) => removePhotoMutationRef.current.mutateAsync({ collageId: sessionId!, photoId }),
    updateLayout,
    updatePositions,
    updateSettings,
    clearAll: () => clearAllMutationRef.current.mutateAsync({ collageId: sessionId, generation: sessionGenerationRef.current }),
    recoverSession,
    retryInitialization: initCollage,
    retry,
    projectName: collageState?.name ?? 'Untitled collage',
    projects: projectsQuery.data ?? [],
    projectsLoading: projectsQuery.isLoading,
    projectsError: projectsQuery.error,
    retryProjects: projectsQuery.refetch,
    createProject: (name: string) => selectCreatedProject(collageDb.createCollage(name)),
    openProject: async (id: string) => {
      const generation = ++sessionGenerationRef.current
      const state = await fetchCollageFromDb(id)
      queryClient.setQueryData(['collage', id], state)
      if (generation === sessionGenerationRef.current) setSessionId(id)
    },
    renameProject: async (id: string, name: string) => { await collageDb.updateCollage(id, { name }); await queryClient.invalidateQueries({ queryKey: ['projects'] }); await queryClient.invalidateQueries({ queryKey: ['collage', id] }) },
    duplicateProject: (id: string) => selectCreatedProject(collageDb.duplicateCollage(id)),
    deleteProject: async (id: string) => {
      if (sessionIdRef.current === id) {
        await selectCreatedProject(collageDb.replaceCollage(id))
      } else {
        await collageDb.deleteCollage(id)
        await refreshProjects()
      }
    },
    exportProject: () => collageDb.exportProject(sessionId!),
    importProject: (backup: unknown) => selectCreatedProject(collageDb.importProject(backup)),
  }
}
