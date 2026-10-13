/** @jest-environment node */
import { indexedDB, IDBKeyRange } from 'fake-indexeddb'
import Dexie from 'dexie'
import { describe, it, expect, beforeEach, afterAll } from '@jest/globals'

Dexie.dependencies.indexedDB = indexedDB
Dexie.dependencies.IDBKeyRange = IDBKeyRange
const { db, getCollageState, importProject, exportProject, duplicateCollage, deleteCollage, validateProjectBackup, listProjects } = await import('@/lib/db')

const backup = () => ({
  version: 1,
  project: {
    id: 'original', name: 'Asymmetric collage', selectedLayoutId: '2-horizontal',
    settings: { gap: 14, borderRadius: 6, backgroundColor: '#123456' },
    photos: [
      { id: 'left', fileName: 'left.png', dataUrl: 'data:image/png;base64,YWJj' },
      { id: 'right', fileName: 'right.jpg', dataUrl: 'data:image/jpeg;base64,ZGVm' },
    ],
    photoPositions: [
      { photoId: 'right', gridArea: 'a', objectPosition: '23% 71%', rotation: 90, scale: 1.35 },
      { photoId: 'left', gridArea: 'b', objectPosition: '80% 20%', rotation: 270, scale: 2 },
    ],
  },
})

beforeEach(async () => {
  await db.delete()
  await db.open()
})
afterAll(() => db.close())

describe('local projects', () => {
  it('migrates v2 work without losing IDs, photos, transforms, or settings', async () => {
    await db.delete()
    const legacy = new Dexie('collage-maker')
    legacy.version(2).stores({ collages: 'id', photos: 'id, collageId', photoPositions: '[collageId+photoId], collageId' })
    const original = backup().project
    await legacy.table('collages').add({ id: original.id, settings: original.settings, selectedLayoutId: original.selectedLayoutId, createdAt: '2020-01-01', updatedAt: '2020-01-02' })
    await legacy.table('photos').bulkAdd(original.photos.map(photo => ({ ...photo, collageId: original.id })))
    await legacy.table('photoPositions').bulkAdd(original.photoPositions.map(position => ({ ...position, collageId: original.id })))
    legacy.close()
    await db.open()
    expect(await getCollageState(original.id)).toEqual({ ...original, name: 'Untitled collage', photoPositions: expect.arrayContaining(original.photoPositions) })
    expect(await listProjects()).toEqual([expect.objectContaining({ id: original.id, name: 'Untitled collage', photoCount: 2 })])
  })

  it('round-trips backups beside their originals and duplicates independently', async () => {
    const first = await importProject(backup())
    const exported = await exportProject(first.id)
    const second = await importProject(JSON.parse(JSON.stringify(exported)))
    const copy = await duplicateCollage(first.id)
    const states = await Promise.all([first, second, copy].map(project => getCollageState(project.id)))
    const ids = states.flatMap(state => state!.photos.map(photo => photo.id))
    expect(new Set(ids).size).toBe(6)
    for (const state of states) {
      expect(state!.settings).toEqual(backup().project.settings)
      const photoNames = new Map(state!.photos.map(photo => [photo.id, photo.fileName]))
      expect(state!.photoPositions.map(position => ({ ...position, photoId: photoNames.get(position.photoId) })))
        .toEqual(expect.arrayContaining(backup().project.photoPositions.map(position => ({ ...position, photoId: position.photoId === 'right' ? 'right.jpg' : 'left.png' }))))
      expect(state!.photos.map(photo => photo.dataUrl).sort()).toEqual(backup().project.photos.map(photo => photo.dataUrl).sort())
    }
    await deleteCollage(copy.id)
    expect(await getCollageState(copy.id)).toBeNull()
    expect(await getCollageState(first.id)).toEqual(states[0])
    expect(await db.photos.where('collageId').equals(copy.id).count()).toBe(0)
    expect(await db.photoPositions.where('collageId').equals(copy.id).count()).toBe(0)
  })

  it.each([
    ['unsupported version', (value: ReturnType<typeof backup>) => { value.version = 2 }],
    ['too many photos', (value: ReturnType<typeof backup>) => { value.project.photos = Array.from({ length: 17 }, (_, index) => ({ ...value.project.photos[0], id: `photo-${index}` })) }],
    ['missing settings', (value: ReturnType<typeof backup>) => { value.project.settings = null as never }],
    ['duplicate photo reference', (value: ReturnType<typeof backup>) => { value.project.photoPositions[1].photoId = 'right' }],
    ['missing slot', (value: ReturnType<typeof backup>) => { value.project.photoPositions.pop() }],
    ['invalid crop', (value: ReturnType<typeof backup>) => { value.project.photoPositions[0].objectPosition = '900% bad' }],
    ['invalid color', (value: ReturnType<typeof backup>) => { value.project.settings.backgroundColor = 'url(https://example.com/image)' }],
    ['missing photo', (value: ReturnType<typeof backup>) => { value.project.photoPositions[0].photoId = 'absent' }],
    ['invalid encoding', (value: ReturnType<typeof backup>) => { value.project.photos[0].dataUrl = 'data:image/png;base64,A===' }],
  ])('rejects %s without creating partial records', async (_, invalidate) => {
    const value = backup()
    invalidate(value)
    await expect(importProject(value)).rejects.toThrow()
    expect(await db.collages.count()).toBe(0)
    expect(await db.photos.count()).toBe(0)
    expect(await db.photoPositions.count()).toBe(0)
  })

  it('rolls back an import write failure without changing existing work', async () => {
    const original = await importProject(backup())
    const before = await getCollageState(original.id)
    const failWrite = () => { throw new DOMException('Storage full', 'QuotaExceededError') }
    db.photos.hook('creating', failWrite)
    try {
      await expect(importProject(backup())).rejects.toThrow('Storage full')
    } finally {
      db.photos.hook('creating').unsubscribe(failWrite)
    }
    expect(await getCollageState(original.id)).toEqual(before)
    expect(await db.collages.count()).toBe(1)
    expect(await db.photos.count()).toBe(2)
    expect(await db.photoPositions.count()).toBe(2)
  })

  it('checks serialized UTF-8 bytes, not character count', () => {
    const value = { ...backup(), padding: 'é'.repeat(26 * 1024 * 1024) }
    expect(() => validateProjectBackup(value)).toThrow(/large/i)
  })
})
