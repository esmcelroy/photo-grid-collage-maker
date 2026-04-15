import Database from 'better-sqlite3'
import path from 'path'

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../collage.db')

let db: Database.Database | undefined

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    runMigrations(db)
  }
  return db
}

/**
 * Test-only: replace the module-level singleton with a custom instance.
 * Call this in beforeEach with createTestDb() to get a fresh in-memory db
 * for each test, ensuring complete isolation with no on-disk side effects.
 *
 *   beforeEach(() => { _overrideDb(createTestDb()) })
 */
export function _overrideDb(testDb: Database.Database): void {
  db = testDb
}

export function createTestDb(): Database.Database {
  const testDb = new Database(':memory:')
  testDb.pragma('journal_mode = WAL')
  runMigrations(testDb)
  return testDb
}

function runMigrations(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS collages (
      id TEXT PRIMARY KEY,
      selected_layout_id TEXT,
      settings_json TEXT NOT NULL DEFAULT '{"gap":8,"backgroundColor":"transparent","borderRadius":0}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY,
      collage_id TEXT NOT NULL REFERENCES collages(id) ON DELETE CASCADE,
      data_url TEXT NOT NULL,
      file_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS photo_positions (
      collage_id TEXT NOT NULL REFERENCES collages(id) ON DELETE CASCADE,
      photo_id TEXT NOT NULL,
      grid_area TEXT NOT NULL,
      PRIMARY KEY (collage_id, photo_id)
    );
  `)
}
