CREATE TABLE assets_new (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mime_type TEXT NOT NULL,
  created_at TEXT NOT NULL
);

INSERT INTO assets_new (id, user_id, mime_type, created_at)
SELECT id, user_id, mime_type, created_at FROM assets;

DROP TABLE assets;
ALTER TABLE assets_new RENAME TO assets;
CREATE INDEX IF NOT EXISTS assets_user_id_idx ON assets(user_id);
