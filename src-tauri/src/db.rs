use dirs::home_dir;
use rusqlite::Connection;
use std::fs;
use std::path::PathBuf;

pub fn db_path() -> PathBuf {
    let mut path = home_dir().unwrap_or_else(|| PathBuf::from("."));
    path.push(".incharj");
    path.push("index.db");
    path
}

pub fn open_db() -> rusqlite::Result<Connection> {
    let path = db_path();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    Ok(conn)
}

pub fn ensure_schema() -> rusqlite::Result<()> {
    let conn = open_db()?;
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS files (
          id INTEGER PRIMARY KEY,
          path TEXT NOT NULL UNIQUE,
          mtime_ms INTEGER NOT NULL,
          size_bytes INTEGER NOT NULL,
          ext TEXT NOT NULL,
          content_hash TEXT NOT NULL,
          indexed_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS files_fts_chunks USING fts5(
          path,
          chunk_index UNINDEXED,
          content,
          tokenize = 'unicode61'
        );

        CREATE INDEX IF NOT EXISTS idx_files_mtime ON files(mtime_ms);
        CREATE INDEX IF NOT EXISTS idx_files_ext ON files(ext);
        CREATE INDEX IF NOT EXISTS idx_files_indexed_at ON files(indexed_at);
        "#,
    )?;
    let _ = conn.execute("ALTER TABLE files ADD COLUMN source TEXT NOT NULL DEFAULT 'local'", []);
    let _ = conn.execute("ALTER TABLE files ADD COLUMN external_id TEXT", []);
    let _ = conn.execute("ALTER TABLE files ADD COLUMN web_url TEXT", []);
    let _ = conn.execute("ALTER TABLE files ADD COLUMN display_name TEXT NOT NULL DEFAULT ''", []);
    Ok(())
}

pub fn get_document_count() -> rusqlite::Result<i64> {
    ensure_schema()?;
    let conn = open_db()?;
    let count = conn.query_row("SELECT COUNT(*) FROM files", [], |row| row.get(0))?;
    Ok(count)
}

pub fn get_last_indexed_at() -> rusqlite::Result<Option<i64>> {
    ensure_schema()?;
    let conn = open_db()?;
    let result: Option<i64> =
        conn.query_row("SELECT MAX(indexed_at) FROM files", [], |row| row.get(0))?;
    Ok(result)
}

pub fn reset_db() -> Result<(), String> {
    let db = db_path();
    let wal = PathBuf::from(format!("{}-wal", db.to_string_lossy()));
    let shm = PathBuf::from(format!("{}-shm", db.to_string_lossy()));

    for path in [db, wal, shm] {
        if path.exists() {
            fs::remove_file(path).map_err(|err| err.to_string())?;
        }
    }
    Ok(())
}
