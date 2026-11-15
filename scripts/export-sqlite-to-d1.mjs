import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import Database from 'better-sqlite3'

const databasePath = resolve(process.env.DB_FILE ?? './data/gather.sqlite3')
const outputDirectory = resolve('./data/d1-import-assets')
const sqlPath = resolve('./data/d1-import.sql')
const commandPath = resolve('./data/import-local-data.ps1')
const db = new Database(databasePath, { readonly: true, fileMustExist: true })
const tables = ['users', 'portfolios', 'subscriptions', 'free_trials']

function sqlValue(value) {
  if (value === null) return 'NULL'
  if (typeof value === 'number' || typeof value === 'bigint') return String(value)
  return `'${String(value).replaceAll("'", "''")}'`
}

function quotePowerShell(value) { return `"${value.replaceAll('"', '`"')}"` }

try {
  mkdirSync(outputDirectory, { recursive: true })
  const statements = ['-- Generated from local SQLite. This file contains private account data; do not commit it.']
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
  const commands = [
    '$ErrorActionPreference = "Stop"',
    'npx.cmd wrangler d1 migrations apply bio-box-production --remote',
    'if ($LASTEXITCODE -ne 0) { throw "D1 migration failed" }',
  ]
  for (const asset of assets) {
    const filePath = resolve(outputDirectory, asset.id)
    writeFileSync(filePath, asset.data, { mode: 0o600 })
    commands.push(`npx.cmd wrangler r2 object put bio-box-media/${asset.id} --file=${quotePowerShell(filePath)} --content-type=${asset.mime_type} --remote`)
    commands.push('if ($LASTEXITCODE -ne 0) { throw "R2 upload failed" }')
    statements.push(`INSERT OR IGNORE INTO "assets" ("id", "user_id", "mime_type", "created_at") VALUES (${sqlValue(asset.id)}, ${sqlValue(asset.user_id)}, ${sqlValue(asset.mime_type)}, ${sqlValue(asset.created_at)});`)
  }
  commands.push(`npx.cmd wrangler d1 execute bio-box-production --remote --file=${quotePowerShell(sqlPath)}`)
  commands.push('if ($LASTEXITCODE -ne 0) { throw "D1 data import failed" }')
  mkdirSync(dirname(sqlPath), { recursive: true })
  writeFileSync(sqlPath, `${statements.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 })
  writeFileSync(commandPath, `${commands.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 })
  console.log(`Prepared private import files in data/; rows: ${Object.entries(counts).map(([table, count]) => `${table}=${count}`).join(', ')}`)
} finally {
  db.close()
}
