import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import Database from 'better-sqlite3'

export type AppDatabase = Database.Database

export function createDatabase(filename = process.env.DB_FILE ?? './data/gather.sqlite3'): AppDatabase {
  const resolved = filename === ':memory:' ? filename : resolve(filename)
  if (resolved !== ':memory:') mkdirSync(dirname(resolved), { recursive: true })

  const db = new Database(resolved)
  db.pragma('foreign_keys = ON')
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 5000')
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS portfolios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      slug TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      bio TEXT NOT NULL DEFAULT '',
      instagram_url TEXT NOT NULL,
      instagram_username TEXT NOT NULL DEFAULT '',
      instagram_photo_url TEXT NOT NULL DEFAULT '',
      instagram_refreshed_at TEXT,
      template TEXT NOT NULL DEFAULT 'paper',
      theme TEXT NOT NULL DEFAULT '#d7e8df',
      font_family TEXT NOT NULL DEFAULT 'sans',
      socials_json TEXT NOT NULL DEFAULT '{}',
      blocks_json TEXT NOT NULL DEFAULT '[]',
      products_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      plan TEXT NOT NULL CHECK (plan IN ('free', 'monthly', 'yearly')),
      starts_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS free_trials (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      claimed_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      mime_type TEXT NOT NULL,
      data BLOB NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS assets_user_id_idx ON assets(user_id);
  `)
  const portfolioColumns = new Set(
    (db.pragma('table_info(portfolios)') as Array<{ name: string }>).map((column) => column.name),
  )
  const migrations: Array<[string, string]> = [
    ['font_family', "TEXT NOT NULL DEFAULT 'sans'"],
    ['socials_json', "TEXT NOT NULL DEFAULT '{}'"],
    ['products_json', "TEXT NOT NULL DEFAULT '[]'"],
  ]
  for (const [name, definition] of migrations) {
    if (!portfolioColumns.has(name)) {
      db.exec(`ALTER TABLE portfolios ADD COLUMN ${name} ${definition}`)
    }
  }
  return db
}
