import Dexie, { type Table } from 'dexie'
import { MAX_PHOTOS } from '@/lib/types'
import type { CollageSettings, PhotoPosition } from '@/lib/types'
import { GRID_LAYOUTS } from '@/lib/layouts'

// ---------------------------------------------------------------------------
// Database record types (stored in IndexedDB)
// ---------------------------------------------------------------------------

export interface CollageRecord {
  id: string
  name: string
  selectedLayoutId: string | null
  settings: CollageSettings
  createdAt: string
  updatedAt: string
}

export interface PhotoRecord {
  id: string
  collageId: string
  dataUrl: string
  fileName: string
  createdAt: string
}

export interface PhotoPositionRecord {
  collageId: string
  photoId: string
  gridArea: string
  objectPosition?: string
  rotation?: number
  scale?: number
}

// Assembled state returned to the UI (mirrors the old API response)
export interface CollageState {
  id: string
  name?: string
  photos: Array<{ id: string; fileName: string; dataUrl: string }>
  selectedLayoutId: string | null
  photoPositions: PhotoPosition[]
  settings: CollageSettings
}

// ---------------------------------------------------------------------------
// Dexie database
// ---------------------------------------------------------------------------

class CollageDatabase extends Dexie {
  collages!: Table<CollageRecord, string>
  photos!: Table<PhotoRecord, string>
  photoPositions!: Table<PhotoPositionRecord, [string, string]>

  constructor() {
    super('collage-maker')
    this.version(1).stores({
      collages: 'id',
      photos: 'id, collageId',
      photoPositions: '[collageId+photoId], collageId',
    })
    // v2: Add objectPosition, rotation, scale to photoPositions (non-indexed)
    this.version(2).stores({
      collages: 'id',
      photos: 'id, collageId',
      photoPositions: '[collageId+photoId], collageId',
    })
    this.version(3).stores({
      collages: 'id, updatedAt',
      photos: 'id, collageId',
      photoPositions: '[collageId+photoId], collageId',
    }).upgrade(async tx => {
      await tx.table('collages').toCollection().modify((collage: CollageRecord) => {
        collage.name ||= 'Untitled collage'
      })
    })
  }
}

export const db = new CollageDatabase()

// ---------------------------------------------------------------------------
// Default settings
// ---------------------------------------------------------------------------

const DEFAULT_SETTINGS: CollageSettings = {
  gap: 8,
  backgroundColor: 'transparent',
  borderRadius: 0,
}

// ---------------------------------------------------------------------------
// Query functions (adapter interface — could be swapped for cloud backend)
// ---------------------------------------------------------------------------

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback for non-secure contexts (HTTP)
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export async function createCollage(name = 'Untitled collage'): Promise<{ id: string }> {
  const id = generateId()
  const now = new Date().toISOString()
  await db.collages.add({
    id,
    name: name.trim().slice(0, 200) || 'Untitled collage',
    selectedLayoutId: null,
    settings: { ...DEFAULT_SETTINGS },
    createdAt: now,
    updatedAt: now,
  })
  return { id }
}

export async function getCollageState(id: string): Promise<CollageState | null> {
  return db.transaction('r', [db.collages, db.photos, db.photoPositions], async () => {
    const collage = await db.collages.get(id)
    if (!collage) return null
    const photos = await db.photos.where('collageId').equals(id).toArray()
    const positions = await db.photoPositions.where('collageId').equals(id).toArray()
    return {
      id: collage.id,
      name: collage.name || 'Untitled collage',
      photos: photos.map((p) => ({ id: p.id, fileName: p.fileName, dataUrl: p.dataUrl })),
      selectedLayoutId: collage.selectedLayoutId,
      photoPositions: positions.map((p) => ({
        photoId: p.photoId,
        gridArea: p.gridArea,
        ...(p.objectPosition !== undefined && { objectPosition: p.objectPosition }),
        ...(p.rotation !== undefined && { rotation: p.rotation }),
        ...(p.scale !== undefined && { scale: p.scale }),
      })),
      settings: collage.settings,
    }
  })
}

export async function updateCollage(
  id: string,
  updates: {
    selectedLayoutId?: string | null
    photoPositions?: PhotoPosition[]
    settings?: CollageSettings
    name?: string
  }
): Promise<CollageState> {
  await db.transaction('rw', [db.collages, db.photoPositions], async () => {
    const collage = await db.collages.get(id)
    if (!collage) throw new Error('Collage not found')

    const patch: Partial<CollageRecord> = { updatedAt: new Date().toISOString() }

    if (updates.selectedLayoutId !== undefined) {
      patch.selectedLayoutId = updates.selectedLayoutId
    }
    if (updates.settings !== undefined) {
      patch.settings = updates.settings
    }
    if (updates.name !== undefined) patch.name = updates.name.trim().slice(0, 200) || 'Untitled collage'

    await db.collages.update(id, patch)

    // Replace positions wholesale (same semantics as the old PATCH route)
    if (updates.photoPositions !== undefined) {
      await db.photoPositions.where('collageId').equals(id).delete()
      if (updates.photoPositions.length > 0) {
        await db.photoPositions.bulkAdd(
          updates.photoPositions.map((p) => ({
            collageId: id,
            photoId: p.photoId,
            gridArea: p.gridArea,
            ...(p.objectPosition !== undefined && { objectPosition: p.objectPosition }),
            ...(p.rotation !== undefined && { rotation: p.rotation }),
            ...(p.scale !== undefined && { scale: p.scale }),
          }))
        )
      }
    }
  })

  const state = await getCollageState(id)
  if (!state) throw new Error('Collage not found after update')
  return state
}

export interface ProjectSummary {
  id: string
  name: string
  updatedAt: string
  photoCount: number
  preview?: string
}
export async function listProjects(): Promise<ProjectSummary[]> {
  return db.transaction('r', [db.collages, db.photos], async () => {
    const collages = await db.collages.orderBy('updatedAt').reverse().toArray()
    return Promise.all(collages.map(async collage => {
      const photos = db.photos.where('collageId').equals(collage.id)
      const [photoCount, first] = await Promise.all([photos.count(), photos.clone().first()])
      return { id: collage.id, name: collage.name, updatedAt: collage.updatedAt, photoCount, preview: first?.dataUrl }
    }))
  })
}

export async function duplicateCollage(id: string, name?: string): Promise<{ id: string }> {
  const source = await getCollageState(id)
  if (!source) throw new Error('Collage not found')
  return importProject({ version: 1, project: { ...source, name: name || `${source.name?.slice(0, 195)} copy` } })
}

export interface ProjectBackup { version: 1; project: CollageState }
export const MAX_BACKUP_BYTES = 50 * 1024 * 1024
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function isSettings(value: unknown): value is CollageSettings {
  return isRecord(value) && typeof value.gap === 'number' && Number.isFinite(value.gap) && value.gap >= 0 && value.gap <= 100
    && typeof value.backgroundColor === 'string' && /^(transparent|#[\da-f]{3}|#[\da-f]{6}|#[\da-f]{8})$/i.test(value.backgroundColor)
    && typeof value.borderRadius === 'number' && Number.isFinite(value.borderRadius) && value.borderRadius >= 0 && value.borderRadius <= 100
}
export function validateProjectBackup(value: unknown): asserts value is ProjectBackup {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.project)) throw new Error('Unsupported backup format version')
  if (new Blob([JSON.stringify(value)]).size > MAX_BACKUP_BYTES) throw new Error('Backup file is too large (maximum 50 MiB)')
  const project = value.project
  if (typeof project.id !== 'string' || !project.id
    || typeof project.name !== 'string' || project.name.length > 200
    || !Array.isArray(project.photos) || project.photos.length > MAX_PHOTOS
    || !Array.isArray(project.photoPositions) || !isSettings(project.settings)
    || !(typeof project.selectedLayoutId === 'string' || project.selectedLayoutId === null)) {
    throw new Error('Backup has invalid project data')
  }
  const ids = new Set<string>()
  for (const photo of project.photos) {
    if (!isRecord(photo) || typeof photo.id !== 'string' || !photo.id || ids.has(photo.id)
      || typeof photo.fileName !== 'string' || !photo.fileName || typeof photo.dataUrl !== 'string'
      || !/^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/i.test(photo.dataUrl)
      || photo.dataUrl.split(',')[1].length % 4 !== 0) throw new Error('Backup contains an invalid photo')
    ids.add(photo.id)
  }
  const layout = project.selectedLayoutId === null ? null : GRID_LAYOUTS.find(candidate => candidate.id === project.selectedLayoutId)
  if (project.selectedLayoutId !== null && (!layout || layout.photoCount !== project.photos.length)) throw new Error('Backup layout is incompatible with its photos')
  const areas = new Set(layout?.areas.flatMap(row => row.split(/\s+/)) ?? [])
  const seenAreas = new Set<string>()
  const seenPhotos = new Set<string>()
  for (const position of project.photoPositions) {
    if (!isRecord(position)
      || typeof position.photoId !== 'string' || !ids.has(position.photoId) || seenPhotos.has(position.photoId)
      || typeof position.gridArea !== 'string' || !areas.has(position.gridArea) || seenAreas.has(position.gridArea)
      || (position.objectPosition !== undefined && (typeof position.objectPosition !== 'string'
        || !/^(100|\d{1,2})(\.\d+)?% (100|\d{1,2})(\.\d+)?%$/.test(position.objectPosition)
        || position.objectPosition.split(' ').some(value => parseFloat(value) > 100)))
      || (position.rotation !== undefined && (typeof position.rotation !== 'number'
        || !Number.isFinite(position.rotation) || position.rotation < -360 || position.rotation > 360))
      || (position.scale !== undefined && (typeof position.scale !== 'number'
        || !Number.isFinite(position.scale) || position.scale < 0.1 || position.scale > 10))) {
      throw new Error('Backup contains invalid photo transforms')
    }
    seenAreas.add(position.gridArea)
    seenPhotos.add(position.photoId)
  }
  if (seenAreas.size !== areas.size) throw new Error('Backup is missing photo slots')
}
export async function exportProject(id: string): Promise<ProjectBackup> {
  const project = await getCollageState(id)
  if (!project) throw new Error('Collage not found')
  const backup: ProjectBackup = { version: 1, project }
  validateProjectBackup(backup)
  return backup
}
export async function importProject(backup: unknown): Promise<{ id: string }> {
  validateProjectBackup(backup)
  const { project } = backup
  const id = generateId()
  const photoIds = new Map(project.photos.map(photo => [photo.id, generateId()]))
  const now = new Date().toISOString()
  await db.transaction('rw', [db.collages, db.photos, db.photoPositions], async () => {
    await db.collages.add({ id, name: project.name?.trim() || 'Imported collage', selectedLayoutId: project.selectedLayoutId, settings: project.settings, createdAt: now, updatedAt: now })
    await db.photos.bulkAdd(project.photos.map(photo => ({ id: photoIds.get(photo.id)!, fileName: photo.fileName, dataUrl: photo.dataUrl, collageId: id, createdAt: now })))
    await db.photoPositions.bulkAdd(project.photoPositions.map(position => ({
      photoId: photoIds.get(position.photoId)!, collageId: id, gridArea: position.gridArea,
      ...(position.objectPosition !== undefined && { objectPosition: position.objectPosition }),
      ...(position.rotation !== undefined && { rotation: position.rotation }),
      ...(position.scale !== undefined && { scale: position.scale }),
    })))
  })
  return { id }
}

export async function addPhoto(
  collageId: string,
  photo: { id: string; dataUrl: string; fileName: string }
): Promise<{ id: string; fileName: string; dataUrl: string }> {
  await db.transaction('rw', [db.collages, db.photos], async () => {
    const collage = await db.collages.get(collageId)
    if (!collage) throw new Error('Collage not found')

    const existingCount = await db.photos.where('collageId').equals(collageId).count()
    if (existingCount >= MAX_PHOTOS) {
      throw new Error(`Maximum of ${MAX_PHOTOS} photos per collage`)
    }

    await db.photos.add({
      id: photo.id,
      collageId,
      dataUrl: photo.dataUrl,
      fileName: photo.fileName,
      createdAt: new Date().toISOString(),
    })
    await db.collages.update(collageId, { updatedAt: new Date().toISOString() })
  })

  return { id: photo.id, fileName: photo.fileName, dataUrl: photo.dataUrl }
}

export async function removePhoto(collageId: string, photoId: string): Promise<void> {
  await db.transaction('rw', [db.collages, db.photos, db.photoPositions], async () => {
    await db.photos.delete(photoId)
    await db.photoPositions.where('[collageId+photoId]').equals([collageId, photoId]).delete()
    await db.collages.update(collageId, { updatedAt: new Date().toISOString() })
  })
}

export async function deleteCollage(id: string): Promise<void> {
  await db.transaction('rw', [db.collages, db.photos, db.photoPositions], async () => {
    await db.photoPositions.where('collageId').equals(id).delete()
    await db.photos.where('collageId').equals(id).delete()
    await db.collages.delete(id)
  })
}

/**
 * Atomically remove a session and all of its dependent records while creating
 * the replacement session. This prevents a failed clear operation from either
 * losing the active session or leaving its photos inaccessible.
 */
export async function replaceCollage(id: string): Promise<{ id: string }> {
  const newId = generateId()
  const now = new Date().toISOString()

  await db.transaction('rw', [db.collages, db.photos, db.photoPositions], async () => {
    await db.photoPositions.where('collageId').equals(id).delete()
    await db.photos.where('collageId').equals(id).delete()
    await db.collages.delete(id)
    await db.collages.add({
      id: newId,
      name: 'Untitled collage',
      selectedLayoutId: null,
      settings: { ...DEFAULT_SETTINGS },
      createdAt: now,
      updatedAt: now,
    })
  })

  return { id: newId }
}
