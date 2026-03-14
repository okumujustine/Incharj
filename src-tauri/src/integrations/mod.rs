pub mod google_drive;
pub mod notion;

use serde::{Deserialize, Serialize};
use dirs::home_dir;
use std::path::PathBuf;
use std::fs;
use crate::db::{ensure_schema, open_db};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct IntegrationsConfig {
    pub google_drive: Option<GoogleDriveConfig>,
    pub notion: Option<NotionConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotionConfig {
    pub token: String,
    pub workspace_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoogleDriveConfig {
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
    pub token_expiry_ms: Option<i64>,
    pub email: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IntegrationStatus {
    pub id: String,
    pub name: String,
    pub connected: bool,
    pub email: Option<String>,
    pub file_count: i64,
    pub last_synced_at: Option<i64>,
}

pub fn integrations_config_path() -> PathBuf {
    let mut path = home_dir().unwrap_or_else(|| PathBuf::from("."));
    path.push(".incharj");
    path.push("integrations.json");
    path
}

pub fn load_integrations() -> IntegrationsConfig {
    let path = integrations_config_path();
    if !path.exists() {
        return IntegrationsConfig::default();
    }
    fs::read_to_string(&path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

pub fn save_integrations(config: &IntegrationsConfig) -> Result<(), String> {
    let path = integrations_config_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let raw = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(path, raw).map_err(|e| e.to_string())
}

pub fn get_integration_file_count(source: &str) -> i64 {
    let _ = ensure_schema();
    let conn = match open_db() {
        Ok(c) => c,
        Err(_) => return 0,
    };
    conn.query_row(
        "SELECT COUNT(*) FROM files WHERE source = ?1",
        [source],
        |row| row.get(0),
    ).unwrap_or(0)
}

pub fn get_integration_last_synced(source: &str) -> Option<i64> {
    let _ = ensure_schema();
    let conn = open_db().ok()?;
    conn.query_row(
        "SELECT MAX(indexed_at) FROM files WHERE source = ?1",
        [source],
        |row| row.get(0),
    ).ok()?
}
