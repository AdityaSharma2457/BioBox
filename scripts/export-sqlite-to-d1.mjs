import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import Database from 'better-sqlite3'

const databasePath = resolve(process.env.DB_FILE ?? './data/gather.sqlite3')
const sqlPath = resolve('./data/d1-import.sql')
const commandPath = resolve('./data/import-local-data.ps1')
const db = new Database(databasePath, { readonly: true, fileMustExist: true })
const tables = ['users', 'portfolios', 'subscriptions', 'free_trials']
const importChunkBytes = 32_000

function sqlValue(value) {
  if (value === null) return 'NULL'
  if (typeof value === 'number' || typeof value === 'bigint') return String(value)
  return `'${String(value).replaceAll("'", "''")}'`
}

try {
  const statements = ['-- Private export from local SQLite. Do not commit this file.']
  const counts = {}
  for (const table of tables) {
    const rows = db.prepare(`SELECT * FROM "${table}"`).all()
    counts[table] = rows.length
    for (const row of rows) {
      const columns = Object.keys(row)
      statements.push(`INSERT OR IGNORE INTO "${table}" (${columns.map(column => `"${column}"`).join(', ')}) VALUES (${columns.map(column => sqlValue(row[column])).join(', ')});`)
    }
  }

  const assets = db.prepare('SELECT id, user_id, mime_type, data, created_at FROM assets').all()
  counts.assets = assets.length
  let chunkCount = 0
  for (const asset of assets) {
    statements.push(`INSERT OR IGNORE INTO "assets" ("id", "user_id", "mime_type", "created_at") VALUES (${sqlValue(asset.id)}, ${sqlValue(asset.user_id)}, ${sqlValue(asset.mime_type)}, ${sqlValue(asset.created_at)});`)
    const bytes = Buffer.from(asset.data)
    for (let offset = 0, index = 0; offset < bytes.length; offset += importChunkBytes, index += 1) {
      const hex = bytes.subarray(offset, offset + importChunkBytes).toString('hex')
      statements.push(`INSERT OR IGNORE INTO "asset_chunks" ("asset_id", "chunk_index", "data") VALUES (${sqlValue(asset.id)}, ${index}, X'${hex}');`)
      chunkCount += 1
    }
  }
  counts.asset_chunks = chunkCount

  mkdirSync(dirname(sqlPath), { recursive: true })
  writeFileSync(sqlPath, `${statements.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 })
  writeFileSync(commandPath, [
    '$ErrorActionPreference = "Stop"',
    'npx.cmd wrangler d1 migrations apply bio-box-production --remote',
    'if ($LASTEXITCODE -ne 0) { throw "D1 migration failed" }',
    `npx.cmd wrangler d1 execute bio-box-production --remote --file="${sqlPath.replaceAll('"', '`"')}"`,
    'if ($LASTEXITCODE -ne 0) { throw "D1 data import failed" }',
    '',
  ].join('\n'), { encoding: 'utf8', mode: 0o600 })
  console.log(`Prepared private D1 import; rows: ${Object.entries(counts).map(([table, count]) => `${table}=${count}`).join(', ')}`)
} finally {
  db.close()
}
