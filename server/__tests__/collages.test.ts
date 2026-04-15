/**
 * Collage API Route Tests
 * Tests live in server/__tests__/ per server/jest.config.js (roots: ['<rootDir>/__tests__'])
 * Uses supertest to exercise the full Express request/response cycle.
 * Injects an in-memory SQLite database via _overrideDb() before each test
 * so tests are fully isolated and never touch the on-disk collage.db.
 */
import request from 'supertest'
import { app } from '../index'
import { createTestDb, _overrideDb } from '../db'

beforeEach(() => {
  // Fresh in-memory db for every test — zero state leak between cases
  _overrideDb(createTestDb())
})

// ---------------------------------------------------------------------------
// POST /api/collages
// ---------------------------------------------------------------------------
describe('POST /api/collages', () => {
  it('returns 201 with an id when a new collage is created', async () => {
    const res = await request(app).post('/api/collages')
    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty('id')
    expect(typeof res.body.id).toBe('string')
    expect(res.body.id.length).toBeGreaterThan(0)
  })

  it('creates unique ids on successive calls', async () => {
    const res1 = await request(app).post('/api/collages')
    const res2 = await request(app).post('/api/collages')
    expect(res1.body.id).not.toBe(res2.body.id)
  })
})

// ---------------------------------------------------------------------------
// GET /api/collages/:id
// ---------------------------------------------------------------------------
describe('GET /api/collages/:id', () => {
  it('returns 404 with an error message for an unknown id', async () => {
    const res = await request(app).get('/api/collages/does-not-exist')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Not found' })
  })

  it('returns the full CollageState with defaults for a freshly created collage', async () => {
    const { body: { id } } = await request(app).post('/api/collages')
    const res = await request(app).get(`/api/collages/${id}`)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      id,
      photos: [],
      selectedLayoutId: null,
      photoPositions: [],
      settings: {
        gap: 8,
        backgroundColor: 'transparent',
        borderRadius: 0,
      },
    })
  })
})

// ---------------------------------------------------------------------------
// PATCH /api/collages/:id
// ---------------------------------------------------------------------------
describe('PATCH /api/collages/:id', () => {
  it('returns 404 for an unknown collage id', async () => {
    const res = await request(app)
      .patch('/api/collages/does-not-exist')
      .send({ selectedLayoutId: 'grid-2' })
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Not found' })
  })

  it('updates selectedLayoutId and returns updated CollageState', async () => {
    const { body: { id } } = await request(app).post('/api/collages')
    const res = await request(app)
      .patch(`/api/collages/${id}`)
      .send({ selectedLayoutId: 'grid-2' })

    expect(res.status).toBe(200)
    expect(res.body.selectedLayoutId).toBe('grid-2')
  })

  it('can set selectedLayoutId back to null (clears the layout)', async () => {
    const { body: { id } } = await request(app).post('/api/collages')
    await request(app).patch(`/api/collages/${id}`).send({ selectedLayoutId: 'grid-2' })

    const res = await request(app)
      .patch(`/api/collages/${id}`)
      .send({ selectedLayoutId: null })

    expect(res.status).toBe(200)
    expect(res.body.selectedLayoutId).toBeNull()
  })

  it('updates settings and returns the new values', async () => {
    const { body: { id } } = await request(app).post('/api/collages')
    const settings = { gap: 16, backgroundColor: '#ffffff', borderRadius: 8 }

    const res = await request(app)
      .patch(`/api/collages/${id}`)
      .send({ settings })

    expect(res.status).toBe(200)
    expect(res.body.settings).toEqual(settings)
  })

  it('replaces photoPositions and returns them in the response', async () => {
    const { body: { id } } = await request(app).post('/api/collages')
    const photoPositions = [
      { photoId: 'photo-1', gridArea: 'area1' },
      { photoId: 'photo-2', gridArea: 'area2' },
    ]

    const res = await request(app)
      .patch(`/api/collages/${id}`)
      .send({ photoPositions })

    expect(res.status).toBe(200)
    expect(res.body.photoPositions).toEqual(photoPositions)
  })

  it('only updates provided fields — omitted fields are preserved', async () => {
    const { body: { id } } = await request(app).post('/api/collages')
    // Set layout first
    await request(app).patch(`/api/collages/${id}`).send({ selectedLayoutId: 'grid-3' })

    // Now only update settings — layout should be preserved
    const res = await request(app)
      .patch(`/api/collages/${id}`)
      .send({ settings: { gap: 16, backgroundColor: '#000', borderRadius: 4 } })

    expect(res.status).toBe(200)
    expect(res.body.selectedLayoutId).toBe('grid-3')
  })
})

// ---------------------------------------------------------------------------
// POST /api/collages/:id/photos
// ---------------------------------------------------------------------------
describe('POST /api/collages/:id/photos', () => {
  it('returns 404 when the collage does not exist', async () => {
    const res = await request(app)
      .post('/api/collages/does-not-exist/photos')
      .send({ id: 'p1', dataUrl: 'data:image/jpeg;base64,/9j/', fileName: 'test.jpg' })
    expect(res.status).toBe(404)
  })

  it('adds a photo and returns the ApiPhoto with 201', async () => {
    const { body: { id } } = await request(app).post('/api/collages')
    const photo = { id: 'photo-1', dataUrl: 'data:image/jpeg;base64,/9j/', fileName: 'test.jpg' }

    const res = await request(app)
      .post(`/api/collages/${id}/photos`)
      .send(photo)

    expect(res.status).toBe(201)
    expect(res.body).toEqual(photo)
  })

  it('the added photo is visible in the subsequent GET collage response', async () => {
    const { body: { id } } = await request(app).post('/api/collages')
    const photo = { id: 'photo-1', dataUrl: 'data:image/jpeg;base64,/9j/', fileName: 'test.jpg' }
    await request(app).post(`/api/collages/${id}/photos`).send(photo)

    const getRes = await request(app).get(`/api/collages/${id}`)
    expect(getRes.body.photos).toHaveLength(1)
    expect(getRes.body.photos[0]).toEqual(photo)
  })

  it('returns 400 when the collage already has 9 photos', async () => {
    const { body: { id } } = await request(app).post('/api/collages')

    for (let i = 0; i < 9; i++) {
      await request(app).post(`/api/collages/${id}/photos`).send({
        id: `photo-${i}`,
        dataUrl: 'data:image/jpeg;base64,/9j/',
        fileName: `photo-${i}.jpg`,
      })
    }

    const res = await request(app).post(`/api/collages/${id}/photos`).send({
      id: 'photo-overflow',
      dataUrl: 'data:image/jpeg;base64,/9j/',
      fileName: 'overflow.jpg',
    })

    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })

  it('returns 400 when required fields are missing from the request body', async () => {
    const { body: { id } } = await request(app).post('/api/collages')

    const res = await request(app)
      .post(`/api/collages/${id}/photos`)
      .send({ id: 'p1' }) // missing dataUrl and fileName

    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })
})

// ---------------------------------------------------------------------------
// DELETE /api/collages/:id/photos/:photoId
// ---------------------------------------------------------------------------
describe('DELETE /api/collages/:id/photos/:photoId', () => {
  it('returns 404 when the collage does not exist', async () => {
    const res = await request(app).delete('/api/collages/does-not-exist/photos/photo-1')
    expect(res.status).toBe(404)
  })

  it('removes the photo and returns { success: true }', async () => {
    const { body: { id } } = await request(app).post('/api/collages')
    const photo = { id: 'photo-1', dataUrl: 'data:image/jpeg;base64,/9j/', fileName: 'test.jpg' }
    await request(app).post(`/api/collages/${id}/photos`).send(photo)

    const res = await request(app).delete(`/api/collages/${id}/photos/photo-1`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true })
  })

  it('the deleted photo no longer appears in the GET collage response', async () => {
    const { body: { id } } = await request(app).post('/api/collages')
    const photo = { id: 'photo-1', dataUrl: 'data:image/jpeg;base64,/9j/', fileName: 'test.jpg' }
    await request(app).post(`/api/collages/${id}/photos`).send(photo)
    await request(app).delete(`/api/collages/${id}/photos/photo-1`)

    const getRes = await request(app).get(`/api/collages/${id}`)
    expect(getRes.body.photos).toHaveLength(0)
  })

  it('also removes associated photo_positions on deletion', async () => {
    const { body: { id } } = await request(app).post('/api/collages')
    const photo = { id: 'photo-1', dataUrl: 'data:image/jpeg;base64,/9j/', fileName: 'test.jpg' }
    await request(app).post(`/api/collages/${id}/photos`).send(photo)
    await request(app).patch(`/api/collages/${id}`).send({
      photoPositions: [{ photoId: 'photo-1', gridArea: 'area1' }],
    })

    await request(app).delete(`/api/collages/${id}/photos/photo-1`)

    const getRes = await request(app).get(`/api/collages/${id}`)
    expect(getRes.body.photoPositions).toHaveLength(0)
  })

  it('returns 404 when the photo does not exist in the collage', async () => {
    const { body: { id } } = await request(app).post('/api/collages')

    const res = await request(app).delete(`/api/collages/${id}/photos/no-such-photo`)
    expect(res.status).toBe(404)
  })
})
