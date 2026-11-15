CREATE TABLE IF NOT EXISTS asset_chunks (
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  data BLOB NOT NULL,
  PRIMARY KEY (asset_id, chunk_index)
);
