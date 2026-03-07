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
      content_hash TEXT NOT NULL
    );

    -- Full-text index for content
    CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
      path,
      content,
      tokenize = 'unicode61'
    );

    CREATE INDEX IF NOT EXISTS idx_files_mtime ON files(mtime_ms);
    CREATE INDEX IF NOT EXISTS idx_files_ext ON files(ext);
  `);
  db.close();
}