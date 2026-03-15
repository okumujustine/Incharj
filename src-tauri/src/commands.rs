use crate::config::{load_app_config, save_app_config, ALLOWED_EXTENSIONS};
use crate::db::{ensure_schema, get_document_count, get_last_indexed_at, open_db, reset_db};
use crate::indexer::{start_index, IndexResultPayload, IndexingState};
use crate::watcher::{restart_watcher, watcher_status, WatcherState};
use serde::Serialize;
use std::path::Path;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, State};
use tokio::task;
use walkdir::WalkDir;

const MAX_ESTIMATE_SCAN_FILES: i64 = 250_000;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppStatePayload {
    pub config_path: String,
    pub folders: Vec<String>,
    pub extensions: Vec<String>,
    pub ignore: Vec<String>,
    pub document_count: i64,
    pub last_indexed_at: Option<i64>,
    pub onboarding_complete: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexScopeEstimatePayload {
    pub file_count: i64,
    pub total_bytes: i64,
    pub estimated_seconds: i64,
    pub folder_count: i64,
    pub extension_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgressPayload {
    pub scanned_files: i64,
    pub matched_files: i64,
    pub total_bytes: i64,
    pub current_folder: String,
    pub phase: String,
}

fn expand_tilde(path: &str) -> String {
    if let Some(stripped) = path.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(stripped).to_string_lossy().to_string();
        }
    }
    path.to_string()
}

fn normalize_allowed_extension(ext: &str) -> Option<String> {
    let normalized = if ext.starts_with('.') {
        ext.to_lowercase()
    } else {
        format!(".{}", ext.to_lowercase())
    };
    if ALLOWED_EXTENSIONS.contains(&normalized.as_str()) {
        Some(normalized)
    } else {
        None
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResultPayload {
    pub path: String,
    pub snippet: String,
    pub rank: f64,
    pub occurrences: i64,
    pub ext: String,
    pub modified_at: i64,
    pub display_name: String,
    pub source: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexedFilePayload {
    pub path: String,
    pub ext: String,
    pub modified_at: i64,
    pub display_name: String,
    pub source: String,
}

#[derive(Debug, Serialize)]
pub struct WatcherStatusPayload {
    pub running: bool,
}

#[tauri::command]
pub fn get_app_state() -> Result<AppStatePayload, String> {
    let config_state = load_app_config();
    let document_count = get_document_count().unwrap_or(0);
    let last_indexed_at = get_last_indexed_at().unwrap_or(None);

    Ok(AppStatePayload {
        config_path: config_state.config_path,
        folders: config_state.config.folders,
        extensions: config_state.config.extensions,
        ignore: config_state.config.ignore,
        document_count,
        last_indexed_at,
        onboarding_complete: config_state.config.onboarding_complete,
    })
}

fn emit_scan_progress(
    app: Option<&AppHandle>,
    scanned_files: i64,
    matched_files: i64,
    total_bytes: i64,
    current_folder: &str,
    phase: &str,
) {
    if let Some(app) = app {
        let _ = app.emit(
            "scan:progress",
            ScanProgressPayload {
                scanned_files,
                matched_files,
                total_bytes,
                current_folder: current_folder.to_string(),
                phase: phase.to_string(),
            },
        );
    }
}

fn compute_index_scope_estimate(
    config_state: crate::config::AppConfigState,
    app: Option<AppHandle>,
) -> IndexScopeEstimatePayload {
    let folder_count = config_state.config.folders.len() as i64;
    let folders = config_state.config.folders;
    let allowed: std::collections::HashSet<String> = config_state
        .config
        .extensions
        .into_iter()
        .filter_map(|ext| normalize_allowed_extension(&ext))
        .collect();

    if folders.is_empty() || allowed.is_empty() {
        emit_scan_progress(app.as_ref(), 0, 0, 0, "", "done");
        return IndexScopeEstimatePayload {
            file_count: 0,
            total_bytes: 0,
            estimated_seconds: 0,
            folder_count,
            extension_count: allowed.len() as i64,
        };
    }

    emit_scan_progress(app.as_ref(), 0, 0, 0, "", "start");

    let mut file_count: i64 = 0;
    let mut scanned_files: i64 = 0;
    let mut total_bytes: i64 = 0;
    for folder in folders {
        let folder = expand_tilde(&folder);
        emit_scan_progress(
            app.as_ref(),
            scanned_files,
            file_count,
            total_bytes,
            &folder,
            "folder",
        );
        for entry in WalkDir::new(folder)
            .follow_links(false)
            .into_iter()
            .filter_map(Result::ok)
        {
            if !entry.file_type().is_file() {
                continue;
            }
            scanned_files += 1;
            let path = entry.path();
            let ext = path
                .extension()
                .and_then(|v| v.to_str())
                .map(|v| format!(".{}", v.to_lowercase()));
            let Some(ext) = ext else {
                continue;
            };
            if !allowed.contains(&ext) {
                if scanned_files % 600 == 0 {
                    let current_folder = path
                        .parent()
                        .map(|value| value.to_string_lossy().to_string())
                        .unwrap_or_default();
                    emit_scan_progress(
                        app.as_ref(),
                        scanned_files,
                        file_count,
                        total_bytes,
                        &current_folder,
                        "scanning",
                    );
                }
                continue;
            }
            file_count += 1;
            if file_count >= MAX_ESTIMATE_SCAN_FILES {
                break;
            }
            if let Ok(meta) = entry.metadata() {
                total_bytes += i64::try_from(meta.len()).unwrap_or(0);
            }
            if scanned_files % 150 == 0 || file_count % 50 == 0 {
                let current_folder = path
                    .parent()
                    .map(|value| value.to_string_lossy().to_string())
                    .unwrap_or_default();
                emit_scan_progress(
                    app.as_ref(),
                    scanned_files,
                    file_count,
                    total_bytes,
                    &current_folder,
                    "scanning",
                );
            }
        }
        if file_count >= MAX_ESTIMATE_SCAN_FILES {
            break;
        }
    }

    // Rough estimate: ~18 files/s baseline plus an I/O size factor.
    let file_based = (file_count as f64 / 18.0).ceil() as i64;
    let size_based = (total_bytes as f64 / (35.0 * 1024.0 * 1024.0)).ceil() as i64;
    let estimated_seconds = std::cmp::max(0, std::cmp::max(file_based, size_based));

    emit_scan_progress(
        app.as_ref(),
        scanned_files,
        file_count,
        total_bytes,
        "",
        "done",
    );

    IndexScopeEstimatePayload {
        file_count,
        total_bytes,
        estimated_seconds,
        folder_count,
        extension_count: allowed.len() as i64,
    }
}

#[tauri::command]
pub async fn scan_index_scope(app: AppHandle) -> Result<IndexScopeEstimatePayload, String> {
    let config_state = load_app_config();
    let app_for_scan = app.clone();
    task::spawn_blocking(move || compute_index_scope_estimate(config_state, Some(app_for_scan)))
        .await
        .map_err(|err| format!("Failed to scan index scope: {err}"))
}

#[tauri::command]
pub fn complete_onboarding() -> Result<AppStatePayload, String> {
    mutate_config(|config| {
        config.onboarding_complete = true;
    })
}

fn normalize_term(term: &str) -> String {
    term.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn tokenize(term: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();

    for ch in term.chars() {
        if ch.is_ascii_alphanumeric() || ch == '_' {
            current.push(ch.to_ascii_lowercase());
        } else if !current.is_empty() {
            tokens.push(current.clone());
            current.clear();
        }
    }

    if !current.is_empty() {
        tokens.push(current);
    }

    tokens
}

fn build_match_queries(term: &str) -> Vec<String> {
    let normalized = normalize_term(term);
    if normalized.is_empty() {
        return Vec::new();
    }

    let mut queries = vec![format!("\"{}\"", normalized.replace('"', "\"\""))];
    let tokens = tokenize(&normalized);
    if !tokens.is_empty() {
        queries.push(
            tokens
                .iter()
                .map(|token| format!("{token}*"))
                .collect::<Vec<_>>()
                .join(" AND "),
        );
        queries.push(
            tokens
                .iter()
                .map(|token| format!("{token}*"))
                .collect::<Vec<_>>()
                .join(" OR "),
        );
    }
    queries.dedup();
    queries
}

fn score_path_boost(file_path: &str, normalized_term: &str, tokens: &[String]) -> f64 {
    let full_path = file_path.to_lowercase();
    let file_name = Path::new(file_path)
        .file_name()
        .and_then(|v| v.to_str())
        .unwrap_or(file_path)
        .to_lowercase();

    let mut boost = 0.0;
    if !normalized_term.is_empty() && file_name.contains(normalized_term) {
        boost -= 2.0;
    }

    for token in tokens {
        if file_name.contains(token) {
            boost -= 0.7;
        } else if full_path.contains(token) {
            boost -= 0.2;
        }
    }

    boost
}

fn score_recency_boost(mtime_ms: Option<i64>) -> f64 {
    let Some(mtime_ms) = mtime_ms else {
        return 0.0;
    };
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0);
    let age_days = (now_ms - mtime_ms) as f64 / 86_400_000.0;
    if age_days <= 1.0 {
        1.5
    } else if age_days <= 7.0 {
        1.0
    } else if age_days <= 30.0 {
        0.4
    } else {
        0.0
    }
}

fn score_occurrences_boost(occurrences: i64) -> f64 {
    ((occurrences as f64 + 1.0).log2() * 0.5).min(2.0)
}

#[tauri::command]
pub fn search_query(query: String, limit: Option<i64>) -> Result<Vec<SearchResultPayload>, String> {
    let query = query.trim().to_string();
    if query.len() < 2 {
        return Ok(Vec::new());
    }

    ensure_schema().map_err(|err| err.to_string())?;
    let conn = open_db().map_err(|err| err.to_string())?;
    let stmt_sql = r#"
        WITH matched AS (
          SELECT
            path,
            snippet(files_fts_chunks, 2, '<<MATCH>>', '<<END>>', ' … ', 64) AS snippet,
            bm25(files_fts_chunks) AS rank
          FROM files_fts_chunks
          WHERE files_fts_chunks MATCH ?1
        ),
        ranked AS (
          SELECT
            path,
            snippet,
            rank,
            COUNT(*) OVER (PARTITION BY path) AS occurrences,
            ROW_NUMBER() OVER (PARTITION BY path ORDER BY rank ASC) AS row_num
          FROM matched
        )
        SELECT ranked.path, ranked.snippet, ranked.rank, ranked.occurrences, files.ext, files.mtime_ms, files.display_name, files.source
        FROM ranked
        LEFT JOIN files ON files.path = ranked.path
        WHERE row_num = 1
        ORDER BY ranked.rank
        LIMIT ?2
    "#;
    let mut stmt = conn.prepare(stmt_sql).map_err(|err| err.to_string())?;

    let normalized_term = normalize_term(&query).to_lowercase();
    let tokens = tokenize(&normalized_term);
    let queries = build_match_queries(&query);
    let max_limit = limit.unwrap_or(20).clamp(1, 200);
    let mut rows_out = Vec::new();
    let mut match_tier = 0usize;

    for (index, candidate) in queries.iter().enumerate() {
        let mut rows = stmt
            .query_map((candidate, max_limit), |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1).unwrap_or_default(),
                    row.get::<_, f64>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, Option<f64>>(5)?.map(|v| v as i64),
                    row.get::<_, Option<String>>(6)?.unwrap_or_default(),
                    row.get::<_, Option<String>>(7)?.unwrap_or_else(|| "local".to_string()),
                ))
            })
            .map_err(|err| err.to_string())?;

        let mut candidate_rows = Vec::new();
        while let Some(row) = rows.next().transpose().map_err(|err| err.to_string())? {
            candidate_rows.push(row);
        }
        if !candidate_rows.is_empty() {
            rows_out = candidate_rows;
            match_tier = index;
            break;
        }
    }

    let loose_penalty = if match_tier == 2 { 1.5 } else { 0.0 };
    let mut results = rows_out
        .into_iter()
        .map(
            |(path, snippet, rank, occurrences, ext, modified_at, display_name, source)| SearchResultPayload {
                path: path.clone(),
                snippet,
                rank: rank + score_path_boost(&path, &normalized_term, &tokens)
                    - score_recency_boost(modified_at)
                    - score_occurrences_boost(occurrences)
                    + loose_penalty,
                occurrences,
                ext: ext.unwrap_or_default().trim_start_matches('.').to_string(),
                modified_at: modified_at.unwrap_or(0),
                display_name,
                source,
            },
        )
        .collect::<Vec<_>>();

    results.sort_by(|a, b| {
        a.rank
            .partial_cmp(&b.rank)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    Ok(results)
}

#[tauri::command]
pub fn get_indexed_files() -> Result<Vec<IndexedFilePayload>, String> {
    ensure_schema().map_err(|err| err.to_string())?;
    let conn = open_db().map_err(|err| err.to_string())?;
    let mut stmt = conn
        .prepare("SELECT path, ext, indexed_at, display_name, source FROM files ORDER BY indexed_at DESC")
        .map_err(|err| err.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(IndexedFilePayload {
                path: row.get(0)?,
                ext: row.get::<_, String>(1)?.trim_start_matches('.').to_string(),
                modified_at: row.get(2)?,
                display_name: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
                source: row.get::<_, Option<String>>(4)?.unwrap_or_else(|| "local".to_string()),
            })
        })
        .map_err(|err| err.to_string())?;

    let mut files = Vec::new();
    for row in rows {
        files.push(row.map_err(|err| err.to_string())?);
    }
    Ok(files)
}

fn mutate_config<F>(mutator: F) -> Result<AppStatePayload, String>
where
    F: FnOnce(&mut crate::config::AppConfig),
{
    let mut state = load_app_config();
    mutator(&mut state.config);
    save_app_config(&state.config)?;
    get_app_state()
}

#[tauri::command]
pub fn add_folder(
    app: AppHandle,
    state: State<'_, WatcherState>,
    folder_path: String,
) -> Result<AppStatePayload, String> {
    let payload = mutate_config(|config| {
        let value = folder_path.trim().to_string();
        if !value.is_empty() && !config.folders.contains(&value) {
            config.folders.push(value);
        }
    })?;
    let _ = restart_watcher(&app, state);
    Ok(payload)
}

#[tauri::command]
pub fn remove_folder(
    app: AppHandle,
    state: State<'_, WatcherState>,
    folder_path: String,
) -> Result<AppStatePayload, String> {
    let payload = mutate_config(|config| {
        config.folders.retain(|value| value != &folder_path);
    })?;
    let _ = restart_watcher(&app, state);
    Ok(payload)
}

#[tauri::command]
pub fn add_extension(
    app: AppHandle,
    state: State<'_, WatcherState>,
    ext: String,
) -> Result<AppStatePayload, String> {
    let payload = mutate_config(|config| {
        let Some(normalized) = normalize_allowed_extension(&ext) else {
            return;
        };
        if !config.extensions.contains(&normalized) {
            config.extensions.push(normalized);
        }
    })?;
    let _ = restart_watcher(&app, state);
    Ok(payload)
}

#[tauri::command]
pub fn remove_extension(
    app: AppHandle,
    state: State<'_, WatcherState>,
    ext: String,
) -> Result<AppStatePayload, String> {
    let Some(normalized) = normalize_allowed_extension(&ext) else {
        return get_app_state();
    };
    let payload = mutate_config(|config| {
        config.extensions.retain(|value| value != &normalized);
    })?;
    let _ = restart_watcher(&app, state);
    Ok(payload)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderStatPayload {
    pub folder: String,
    pub file_count: i64,
}

#[tauri::command]
pub fn get_folder_stats() -> Result<Vec<FolderStatPayload>, String> {
    ensure_schema().map_err(|e| e.to_string())?;
    let config = load_app_config();
    let conn = open_db().map_err(|e| e.to_string())?;
    let mut stats = Vec::new();
    for folder in &config.config.folders {
        let expanded = expand_tilde(folder);
        let prefix = format!("{}/", expanded.trim_end_matches('/'));
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM files WHERE path LIKE ?1",
                [format!("{}%", prefix).as_str()],
                |row| row.get(0),
            )
            .unwrap_or(0);
        stats.push(FolderStatPayload {
            folder: folder.clone(),
            file_count: count,
        });
    }
    Ok(stats)
}

#[tauri::command]
pub fn reset_index() -> Result<(), String> {
    reset_db()
}

#[tauri::command]
pub fn start_indexing(
    app: AppHandle,
    state: State<'_, IndexingState>,
) -> Result<IndexResultPayload, String> {
    start_index(Some(&app), true, state)
}

#[tauri::command]
pub fn open_file(file_path: String) -> Result<(), String> {
    if file_path.starts_with("gdrive://") || file_path.starts_with("notion://") {
        let url = (|| -> Option<String> {
            let conn = crate::db::open_db().ok()?;
            let web_url: String = conn.query_row(
                "SELECT web_url FROM files WHERE path = ?1",
                [file_path.as_str()],
                |row| row.get(0),
            ).ok()?;
            if web_url.is_empty() { return None; }
            // For Drive, append authuser= for correct account selection
            if file_path.starts_with("gdrive://") {
                let email = crate::integrations::load_integrations()
                    .google_drive
                    .and_then(|g| g.email);
                return Some(match email {
                    Some(e) => format!("{}&authuser={}", web_url, e),
                    None => web_url,
                });
            }
            Some(web_url)
        })();
        let url = url.ok_or("Could not resolve URL")?;
        return open::that(url).map_err(|e| e.to_string());
    }
    open::that(file_path).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn reveal_file(file_path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg("-R")
            .arg(file_path)
            .status()
            .map_err(|err| err.to_string())?;
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg("/select,")
            .arg(file_path)
            .status()
            .map_err(|err| err.to_string())?;
        return Ok(());
    }

    #[cfg(target_os = "linux")]
    {
        let path = Path::new(&file_path);
        let parent = path.parent().unwrap_or(path);
        open::that(parent).map_err(|err| err.to_string())?;
        return Ok(());
    }

    #[allow(unreachable_code)]
    Ok(())
}

#[tauri::command]
pub fn select_folder() -> Option<String> {
    rfd::FileDialog::new()
        .pick_folder()
        .map(|path| path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn watcher_status_command(state: State<'_, WatcherState>) -> WatcherStatusPayload {
    watcher_status(state)
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}

use crate::integrations::{self, get_integration_file_count, get_integration_last_synced, IntegrationStatus};
use crate::integrations::google_drive;
use crate::integrations::notion;

#[tauri::command]
pub fn get_integrations() -> Vec<IntegrationStatus> {
    let config = integrations::load_integrations();
    let mut result = Vec::new();

    let gd = &config.google_drive;
    result.push(IntegrationStatus {
        id: "google_drive".into(),
        name: "Google Drive".into(),
        connected: gd.as_ref().map(|g| g.access_token.is_some()).unwrap_or(false),
        email: gd.as_ref().and_then(|g| g.email.clone()),
        file_count: get_integration_file_count("google_drive"),
        last_synced_at: get_integration_last_synced("google_drive"),
    });

    let nt = &config.notion;
    result.push(IntegrationStatus {
        id: "notion".into(),
        name: "Notion".into(),
        connected: nt.is_some(),
        email: nt.as_ref().and_then(|n| n.workspace_name.clone()),
        file_count: get_integration_file_count("notion"),
        last_synced_at: get_integration_last_synced("notion"),
    });

    result
}

#[tauri::command]
pub async fn connect_google_drive() -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        google_drive::connect()
            .map(|r| r.email)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn sync_google_drive(app: AppHandle) -> Result<serde_json::Value, String> {
    tokio::task::spawn_blocking(move || {
        let _ = app.emit("integration:sync-start", serde_json::json!({"id": "google_drive"}));
        match google_drive::sync(Some(&app)) {
            Ok((indexed, skipped)) => {
                let _ = app.emit("integration:sync-complete", serde_json::json!({
                    "id": "google_drive",
                    "indexed": indexed,
                    "skipped": skipped
                }));
                Ok(serde_json::json!({"indexed": indexed, "skipped": skipped}))
            }
            Err(e) => {
                let _ = app.emit("integration:sync-error", serde_json::json!({"id": "google_drive", "message": e}));
                Err(e)
            }
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn connect_notion(app: AppHandle) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        notion::connect(&app).map(|r| r.workspace_name)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn sync_notion(app: AppHandle) -> Result<serde_json::Value, String> {
    tokio::task::spawn_blocking(move || {
        let _ = app.emit("integration:sync-start", serde_json::json!({"id": "notion"}));
        match notion::sync(Some(&app)) {
            Ok((indexed, skipped)) => {
                let _ = app.emit("integration:sync-complete", serde_json::json!({
                    "id": "notion",
                    "indexed": indexed,
                    "skipped": skipped
                }));
                Ok(serde_json::json!({"indexed": indexed, "skipped": skipped}))
            }
            Err(e) => {
                let _ = app.emit("integration:sync-error", serde_json::json!({"id": "notion", "message": e}));
                Err(e)
            }
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn disconnect_integration(id: String) -> Result<(), String> {
    match id.as_str() {
        "google_drive" => google_drive::disconnect(),
        "notion" => notion::disconnect(),
        _ => Err(format!("Unknown integration: {id}")),
    }
}

#[tauri::command]
pub fn reset_integration_sync(id: String) -> Result<(), String> {
    match id.as_str() {
        "google_drive" => google_drive::reset_sync(),
        "notion" => notion::reset_sync(),
        _ => Err(format!("Unknown integration: {id}")),
    }
}
