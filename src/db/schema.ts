import { openDb } from "./db.js";

export function ensureSchema(): void {
  const db = openDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY,
      path TEXT NOT NULL UNIQUE,
      mtime_ms INTEGER NOT NULL,
      size_bytes INTEGER NOT NULL,
      ext TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      indexed_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
    );

    -- Legacy full-text index for content (kept for backward compatibility)
    CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
      path,
      content,
      tokenize = 'unicode61'
    );

    -- Chunk-based full-text index (primary search table)
    CREATE VIRTUAL TABLE IF NOT EXISTS files_fts_chunks USING fts5(
      path,
      chunk_index UNINDEXED,
      content,
      tokenize = 'unicode61'
    );

    CREATE INDEX IF NOT EXISTS idx_files_mtime ON files(mtime_ms);
    CREATE INDEX IF NOT EXISTS idx_files_ext ON files(ext);
    CREATE INDEX IF NOT EXISTS idx_files_indexed_at ON files(indexed_at);
  `);
  
  // Migration: Add indexed_at column if it doesn't exist (for existing databases)
  try {
    db.exec(`ALTER TABLE files ADD COLUMN indexed_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)`);
  } catch {
    // Column already exists, ignore
  }
  
  db.close();
}
