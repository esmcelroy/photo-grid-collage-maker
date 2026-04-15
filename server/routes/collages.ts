import { Router, Request, Response } from 'express'
import { randomUUID } from 'crypto'
import { getDb } from '../db'
import type { CollageState, ApiPhoto } from '../types'

export const collagesRouter = Router()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fetch a full CollageState from the db for a given collage id, or null. */
function fetchCollageState(id: string): CollageState | null {
  const db = getDb()
  const collage = db.prepare(`SELECT * FROM collages WHERE id = ?`).get(id) as
    | { id: string; selected_layout_id: string | null; settings_json: string }
    | undefined

  if (!collage) return null

  const photos = db
    .prepare(
      `SELECT id, file_name AS fileName, data_url AS dataUrl
       FROM photos WHERE collage_id = ? ORDER BY created_at ASC`
    )
    .all(id) as ApiPhoto[]

  const photoPositions = db
    .prepare(
      `SELECT photo_id AS photoId, grid_area AS gridArea
       FROM photo_positions WHERE collage_id = ?`
    )
    .all(id) as Array<{ photoId: string; gridArea: string }>

  return {
    id: collage.id,
    photos,
    selectedLayoutId: collage.selected_layout_id,
    photoPositions,
    settings: JSON.parse(collage.settings_json),
  }
}

/** Extract a route param as a plain string regardless of the @types/express version. */
function p(req: Request, name: string): string {
  return req.params[name] as string
}

// ---------------------------------------------------------------------------
// POST /api/collages — create a new collage session
// ---------------------------------------------------------------------------
collagesRouter.post('/collages', (_req: Request, res: Response) => {
  const db = getDb()
  const id = randomUUID()
  db.prepare(`INSERT INTO collages (id) VALUES (?)`).run(id)
  res.status(201).json({ id })
})

// ---------------------------------------------------------------------------
// GET /api/collages/:id — return full collage state
// ---------------------------------------------------------------------------
collagesRouter.get('/collages/:id', (req: Request, res: Response) => {
  const state = fetchCollageState(p(req, 'id'))
  if (!state) return res.status(404).json({ error: 'Not found' })
  res.json(state)
})

// ---------------------------------------------------------------------------
// PATCH /api/collages/:id — partial update (layout, positions, settings)
// ---------------------------------------------------------------------------
collagesRouter.patch('/collages/:id', (req: Request, res: Response) => {
  const db = getDb()
  const collageId = p(req, 'id')
  const existing = db.prepare(`SELECT id FROM collages WHERE id = ?`).get(collageId)
  if (!existing) return res.status(404).json({ error: 'Not found' })

  const { selectedLayoutId, photoPositions, settings } = req.body

  // Build a dynamic UPDATE only for the columns that were actually provided.
  // Using COALESCE would silently swallow explicit nulls (e.g. clearing a layout),
  // so we build the SET clause conditionally instead.
  if (selectedLayoutId !== undefined || settings !== undefined) {
    const setClauses: string[] = [`updated_at = datetime('now')`]
    const params: unknown[] = []

    if (selectedLayoutId !== undefined) {
      setClauses.push('selected_layout_id = ?')
      params.push(selectedLayoutId) // null is a valid value — clears the layout
    }
    if (settings !== undefined) {
      setClauses.push('settings_json = ?')
      params.push(JSON.stringify(settings))
    }
    params.push(collageId)

    db.prepare(`UPDATE collages SET ${setClauses.join(', ')} WHERE id = ?`).run(...params)
  }

  if (photoPositions !== undefined) {
    db.prepare(`DELETE FROM photo_positions WHERE collage_id = ?`).run(collageId)
    const insertPos = db.prepare(
      `INSERT INTO photo_positions (collage_id, photo_id, grid_area) VALUES (?, ?, ?)`
    )
    for (const pos of photoPositions as Array<{ photoId: string; gridArea: string }>) {
      insertPos.run(collageId, pos.photoId, pos.gridArea)
    }
  }

  res.json(fetchCollageState(collageId))
})

// ---------------------------------------------------------------------------
// POST /api/collages/:id/photos — add a photo (JSON body, dataUrl is base64)
// ---------------------------------------------------------------------------
collagesRouter.post('/collages/:id/photos', (req: Request, res: Response) => {
  const db = getDb()
  const collageId = p(req, 'id')
  const existing = db.prepare(`SELECT id FROM collages WHERE id = ?`).get(collageId)
  if (!existing) return res.status(404).json({ error: 'Not found' })

  const photoCount = (
    db
      .prepare(`SELECT COUNT(*) AS count FROM photos WHERE collage_id = ?`)
      .get(collageId) as { count: number }
  ).count
  if (photoCount >= 9) {
    return res.status(400).json({ error: 'Maximum 9 photos per collage' })
  }

  const { id, dataUrl, fileName } = req.body as Partial<ApiPhoto>
  if (!id || !dataUrl || !fileName) {
    return res.status(400).json({ error: 'id, dataUrl, and fileName are required' })
  }

  db.prepare(
    `INSERT INTO photos (id, collage_id, data_url, file_name) VALUES (?, ?, ?, ?)`
  ).run(id, collageId, dataUrl, fileName)

  res.status(201).json({ id, dataUrl, fileName } satisfies ApiPhoto)
})

// ---------------------------------------------------------------------------
// DELETE /api/collages/:id/photos/:photoId — remove a photo
// ---------------------------------------------------------------------------
collagesRouter.delete('/collages/:id/photos/:photoId', (req: Request, res: Response) => {
  const db = getDb()
  const collageId = p(req, 'id')
  const photoId = p(req, 'photoId')

  const existing = db.prepare(`SELECT id FROM collages WHERE id = ?`).get(collageId)
  if (!existing) return res.status(404).json({ error: 'Not found' })

  const result = db
    .prepare(`DELETE FROM photos WHERE id = ? AND collage_id = ?`)
    .run(photoId, collageId)

  if (result.changes === 0) return res.status(404).json({ error: 'Photo not found' })

  // Cascade: remove any positions that referenced this photo
  db.prepare(`DELETE FROM photo_positions WHERE collage_id = ? AND photo_id = ?`).run(
    collageId,
    photoId
  )

  res.json({ success: true })
})


