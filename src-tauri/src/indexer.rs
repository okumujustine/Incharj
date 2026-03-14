use crate::config::load_app_config;
use crate::db::{ensure_schema, open_db};
use globset::{Glob, GlobSet, GlobSetBuilder};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, State};
use walkdir::WalkDir;

const MAX_TEXT_FILE_BYTES: u64 = 5 * 1024 * 1024;
const MAX_PDF_FILE_BYTES: u64 = 20 * 1024 * 1024;
const FTS_CHUNK_SIZE: usize = 4000;
const FTS_CHUNK_OVERLAP: usize = 300;

#[derive(Default)]
pub struct IndexingState {
    pub lock: Mutex<()>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexProgressPayload {
    pub current: i64,
    pub total: i64,
    pub file: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexResultPayload {
    pub indexed: i64,
    pub skipped: i64,
    pub indexed_files: Vec<String>,
    pub document_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncCompletePayload {
    pub document_count: i64,
    pub completed_at: i64,
    pub duration_ms: i64,
    pub indexed: i64,
    pub skipped: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncErrorPayload {
    pub failed_at: i64,
    pub message: String,
}

#[derive(Debug, Clone)]
pub enum SingleFileStatus {
    Indexed,
    Skipped,
    Deleted,
    Failed,
}

#[derive(Debug, Clone)]
pub struct SingleFileResult {
    pub status: SingleFileStatus,
    pub path: String,
    pub reason: Option<String>,
}

#[derive(Clone)]
struct IndexRules {
    allowed_exts: HashSet<String>,
    ignore_set: GlobSet,
    raw_ignores: Vec<String>,
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis() as i64)
        .unwrap_or(0)
}

fn expand_home(path: &str) -> PathBuf {
    if let Some(stripped) = path.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(stripped);
        }
    }
    PathBuf::from(path)
}

fn split_into_chunks(text: &str) -> Vec<String> {
    if text.is_empty() {
        return Vec::new();
    }

    let mut chunks = Vec::new();
    let step = FTS_CHUNK_SIZE.saturating_sub(FTS_CHUNK_OVERLAP).max(1);
    let mut start = 0usize;
    while start < text.len() {
        let end = (start + FTS_CHUNK_SIZE).min(text.len());
        let chunk = text[start..end].trim();
        if !chunk.is_empty() {
            chunks.push(chunk.to_string());
        }
        if end == text.len() {
            break;
        }
        start += step;
    }
    chunks
}

fn hash_bytes(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn build_rules() -> IndexRules {
    let config = load_app_config().config;
    let mut builder = GlobSetBuilder::new();
    for pattern in &config.ignore {
        if let Ok(glob) = Glob::new(pattern) {
            builder.add(glob);
        }
    }

    IndexRules {
        allowed_exts: config
            .extensions
            .into_iter()
            .map(|ext| {
                if ext.starts_with('.') {
                    ext.to_lowercase()
                } else {
                    format!(".{}", ext.to_lowercase())
                }
            })
            .collect(),
        ignore_set: builder
            .build()
            .unwrap_or_else(|_| GlobSetBuilder::new().build().unwrap()),
        raw_ignores: config.ignore,
    }
}

fn should_skip(path: &Path, rules: &IndexRules) -> bool {
    if rules.ignore_set.is_match(path) {
        return true;
    }
    let raw = path.to_string_lossy();
    rules.raw_ignores.iter().any(|pattern| {
        let normalized = pattern.replace("**/", "").replace("/**", "");
        !normalized.is_empty() && raw.contains(&normalized)
    })
}

fn index_file_impl(path: &Path, rules: &IndexRules) -> Result<SingleFileResult, String> {
    ensure_schema().map_err(|err| err.to_string())?;
    let resolved = path.to_path_buf();
    let ext = resolved
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| format!(".{}", value.to_lowercase()))
        .unwrap_or_default();
    let path_string = resolved.to_string_lossy().to_string();

    if !rules.allowed_exts.contains(&ext) || should_skip(&resolved, rules) {
        return Ok(SingleFileResult {
            status: SingleFileStatus::Skipped,
            path: path_string,
            reason: Some("extension_not_allowed".into()),
        });
    }

    if !resolved.exists() {
        remove_indexed_file(&path_string)?;
        return Ok(SingleFileResult {
            status: SingleFileStatus::Deleted,
            path: path_string,
            reason: Some("file_missing".into()),
        });
    }

    let metadata = match fs::metadata(&resolved) {
        Ok(m) => m,
        Err(_) => {
            return Ok(SingleFileResult {
                status: SingleFileStatus::Skipped,
                path: path_string,
                reason: Some("metadata_error".into()),
            });
        }
    };
    let max_bytes = if ext == ".pdf" {
        MAX_PDF_FILE_BYTES
    } else {
        MAX_TEXT_FILE_BYTES
    };
    if metadata.len() > max_bytes {
        return Ok(SingleFileResult {
            status: SingleFileStatus::Skipped,
            path: path_string,
            reason: Some("size_limit".into()),
        });
    }

    let raw = match fs::read(&resolved) {
        Ok(bytes) => bytes,
        Err(_) => {
            return Ok(SingleFileResult {
                status: SingleFileStatus::Skipped,
                path: path_string,
                reason: Some("read_error".into()),
            });
        }
    };
    let hashed = hash_bytes(&raw);
    let modified_ms = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0);

    let conn = open_db().map_err(|err| err.to_string())?;
    let existing = conn
        .query_row(
            "SELECT mtime_ms, size_bytes, content_hash FROM files WHERE path = ?1",
            [path_string.as_str()],
            |row| {
                Ok((
                    row.get::<_, f64>(0)? as i64,
                    row.get::<_, i64>(1)?,
                    row.get::<_, String>(2)?,
                ))
            },
        )
        .ok();

    if let Some((mtime_ms, size_bytes, content_hash)) = existing {
        if mtime_ms == modified_ms && size_bytes == metadata.len() as i64 {
            return Ok(SingleFileResult {
                status: SingleFileStatus::Skipped,
                path: path_string,
                reason: Some("unchanged_metadata".into()),
            });
        }
        if content_hash == hashed {
            conn.execute(
                r#"
                INSERT INTO files(path, mtime_ms, size_bytes, ext, content_hash, indexed_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                ON CONFLICT(path) DO UPDATE SET
                  mtime_ms=excluded.mtime_ms,
                  size_bytes=excluded.size_bytes,
                  ext=excluded.ext,
                  content_hash=excluded.content_hash,
                  indexed_at=excluded.indexed_at
                "#,
                (
                    path_string.as_str(),
                    modified_ms,
                    metadata.len() as i64,
                    ext.as_str(),
                    hashed.as_str(),
                    now_ms(),
                ),
            )
            .map_err(|err| err.to_string())?;
            return Ok(SingleFileResult {
                status: SingleFileStatus::Skipped,
                path: path_string,
                reason: Some("unchanged_hash".into()),
            });
        }
    }

    let text = if ext == ".pdf" {
        match pdf_extract::extract_text_from_mem(&raw) {
            Ok(value) => value.split_whitespace().collect::<Vec<_>>().join(" "),
            Err(_) => {
                return Ok(SingleFileResult {
                    status: SingleFileStatus::Failed,
                    path: path_string,
                    reason: Some("pdf_extract_failed".into()),
                });
            }
        }
    } else {
        match String::from_utf8(raw) {
            Ok(value) => value.split_whitespace().collect::<Vec<_>>().join(" "),
            Err(_) => {
                return Ok(SingleFileResult {
                    status: SingleFileStatus::Failed,
                    path: path_string,
                    reason: Some("utf8_decode_failed".into()),
                });
            }
        }
    };

    let chunks = split_into_chunks(&text);
    if chunks.is_empty() {
        return Ok(SingleFileResult {
            status: SingleFileStatus::Skipped,
            path: path_string,
            reason: Some("empty_chunks".into()),
        });
    }

    conn.execute(
        r#"
        INSERT INTO files(path, mtime_ms, size_bytes, ext, content_hash, indexed_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        ON CONFLICT(path) DO UPDATE SET
          mtime_ms=excluded.mtime_ms,
          size_bytes=excluded.size_bytes,
          ext=excluded.ext,
          content_hash=excluded.content_hash,
          indexed_at=excluded.indexed_at
        "#,
        (
            path_string.as_str(),
            modified_ms,
            metadata.len() as i64,
            ext.as_str(),
            hashed.as_str(),
            now_ms(),
        ),
    )
    .map_err(|err| err.to_string())?;
    conn.execute(
        "DELETE FROM files_fts_chunks WHERE path = ?1",
        [path_string.as_str()],
    )
    .map_err(|err| err.to_string())?;
    for (index, chunk) in chunks.iter().enumerate() {
        conn.execute(
            "INSERT INTO files_fts_chunks(path, chunk_index, content) VALUES (?1, ?2, ?3)",
            (path_string.as_str(), index as i64, chunk.as_str()),
        )
        .map_err(|err| err.to_string())?;
    }

    Ok(SingleFileResult {
        status: SingleFileStatus::Indexed,
        path: path_string,
        reason: None,
    })
}

pub fn index_single_file(
    path: &Path,
    state: State<'_, IndexingState>,
) -> Result<SingleFileResult, String> {
    let _guard = state
        .lock
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    let rules = build_rules();
    index_file_impl(path, &rules)
}

pub fn remove_indexed_file(path: &str) -> Result<(), String> {
    ensure_schema().map_err(|err| err.to_string())?;
    let conn = open_db().map_err(|err| err.to_string())?;
    conn.execute("DELETE FROM files_fts_chunks WHERE path = ?1", [path])
        .map_err(|err| err.to_string())?;
    conn.execute("DELETE FROM files WHERE path = ?1", [path])
        .map_err(|err| err.to_string())?;
    Ok(())
}

pub fn prune_deleted_files() -> Result<i64, String> {
    ensure_schema().map_err(|err| err.to_string())?;
    let conn = open_db().map_err(|err| err.to_string())?;
    let mut stmt = conn
        .prepare("SELECT path FROM files")
        .map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|err| err.to_string())?;
    let mut pruned = 0i64;
    for row in rows {
        let path = row.map_err(|err| err.to_string())?;
        if !Path::new(&path).exists() {
            remove_indexed_file(&path)?;
            pruned += 1;
        }
    }
    Ok(pruned)
}

pub fn prune_unconfigured_folders() -> Result<i64, String> {
    ensure_schema().map_err(|err| err.to_string())?;
    let config = load_app_config().config;
    let folder_prefixes: Vec<String> = config
        .folders
        .iter()
        .map(|f| {
            let expanded = expand_home(f);
            format!("{}/", expanded.to_string_lossy().trim_end_matches('/'))
        })
        .collect();

    let conn = open_db().map_err(|err| err.to_string())?;
    let mut stmt = conn
        .prepare("SELECT path FROM files")
        .map_err(|err| err.to_string())?;
    let paths: Vec<String> = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|err| err.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut pruned = 0i64;
    for path in paths {
        let in_configured_folder = folder_prefixes.iter().any(|prefix| path.starts_with(prefix.as_str()));
        if !in_configured_folder {
            remove_indexed_file(&path)?;
            pruned += 1;
        }
    }
    Ok(pruned)
}

fn collect_files() -> Vec<PathBuf> {
    let config = load_app_config().config;
    let rules = build_rules();
    let mut files = Vec::new();
    for root in config.folders {
        let root = expand_home(&root);
        if !root.exists() {
            continue;
        }
        for entry in WalkDir::new(root).follow_links(false) {
            let entry = match entry {
                Ok(value) => value,
                Err(_) => continue,
            };
            let path = entry.path();
            if !entry.file_type().is_file() || should_skip(path, &rules) {
                continue;
            }
            let ext = path
                .extension()
                .and_then(|value| value.to_str())
                .map(|value| format!(".{}", value.to_lowercase()))
                .unwrap_or_default();
            if rules.allowed_exts.contains(&ext) {
                files.push(path.to_path_buf());
            }
        }
    }
    files
}

pub fn start_index(
    app: Option<&AppHandle>,
    emit_progress: bool,
    state: State<'_, IndexingState>,
) -> Result<IndexResultPayload, String> {
    let _guard = state
        .lock
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    ensure_schema().map_err(|err| err.to_string())?;
    let _ = prune_deleted_files()?;
    let _ = prune_unconfigured_folders()?;
    let rules = build_rules();
    let files = collect_files();
    let total = files.len() as i64;
    let mut indexed = 0i64;
    let mut skipped = 0i64;
    let mut indexed_files = Vec::new();

    for (offset, path) in files.iter().enumerate() {
        if emit_progress {
            if let Some(app) = app {
                let _ = app.emit(
                    "index:progress",
                    IndexProgressPayload {
                        current: offset as i64 + 1,
                        total,
                        file: path.to_string_lossy().to_string(),
                    },
                );
            }
        }

        match index_file_impl(path, &rules)? {
            SingleFileResult {
                status: SingleFileStatus::Indexed,
                path,
                ..
            } => {
                indexed += 1;
                indexed_files.push(path);
            }
            SingleFileResult {
                status: SingleFileStatus::Skipped,
                ..
            } => skipped += 1,
            SingleFileResult {
                status: SingleFileStatus::Deleted,
                ..
            } => skipped += 1,
            SingleFileResult {
                status: SingleFileStatus::Failed,
                ..
            } => skipped += 1,
        }
    }

    let conn = open_db().map_err(|err| err.to_string())?;
    let document_count = conn
        .query_row("SELECT COUNT(*) FROM files", [], |row| row.get(0))
        .map_err(|err| err.to_string())?;

    Ok(IndexResultPayload {
        indexed,
        skipped,
        indexed_files,
        document_count,
    })
}

pub fn run_background_sync(
    app: &AppHandle,
    state: State<'_, IndexingState>,
) -> Result<IndexResultPayload, String> {
    let started_at = now_ms();
    let _ = app.emit("sync:start", serde_json::json!({ "startedAt": started_at }));
    let result = match start_index(Some(app), false, state) {
        Ok(result) => result,
        Err(err) => {
            let _ = app.emit(
                "sync:error",
                SyncErrorPayload {
                    failed_at: now_ms(),
                    message: err.clone(),
                },
            );
            return Err(err);
        }
    };
    let completed_at = now_ms();
    let _ = app.emit(
        "sync:complete",
        SyncCompletePayload {
            document_count: result.document_count,
            completed_at,
            duration_ms: completed_at - started_at,
            indexed: result.indexed,
            skipped: result.skipped,
        },
    );
    let _ = app.emit(
        "index:background-complete",
        serde_json::json!({ "documentCount": result.document_count }),
    );
    Ok(result)
}
