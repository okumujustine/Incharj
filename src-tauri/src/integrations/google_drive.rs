use super::{load_integrations, save_integrations, GoogleDriveConfig};
use crate::config::load_app_config;
use crate::db::{ensure_schema, open_db};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use rand::RngCore;
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::Read;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

// Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET as environment variables at build time.
// Create credentials at: console.cloud.google.com → APIs & Services → Credentials → OAuth client ID → Desktop app
fn client_id() -> &'static str { option_env!("GOOGLE_CLIENT_ID").unwrap_or("") }
fn client_secret() -> &'static str { option_env!("GOOGLE_CLIENT_SECRET").unwrap_or("") }

const SCOPES: &str = "openid email https://www.googleapis.com/auth/drive.readonly";
const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const USERINFO_URL: &str = "https://www.googleapis.com/oauth2/v2/userinfo";
const FILES_URL: &str = "https://www.googleapis.com/drive/v3/files";

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn generate_code_verifier() -> String {
    let mut bytes = [0u8; 64];
    rand::thread_rng().fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

fn generate_code_challenge(verifier: &str) -> String {
    let hash = Sha256::digest(verifier.as_bytes());
    URL_SAFE_NO_PAD.encode(hash)
}

fn find_free_port() -> u16 {
    use std::net::TcpListener;
    TcpListener::bind("127.0.0.1:0")
        .map(|l| l.local_addr().unwrap().port())
        .unwrap_or(19234)
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: Option<i64>,
}

#[derive(Deserialize)]
struct UserInfo {
    email: Option<String>,
}

#[derive(Deserialize)]
struct DriveFile {
    id: String,
    name: String,
    #[serde(rename = "mimeType")]
    mime_type: String,
    #[serde(rename = "modifiedTime")]
    modified_time: Option<String>,
    #[serde(rename = "webViewLink")]
    web_view_link: Option<String>,
}

#[derive(Deserialize)]
struct FileListResponse {
    files: Vec<DriveFile>,
    #[serde(rename = "nextPageToken")]
    next_page_token: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectResult {
    pub email: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncProgress {
    pub current: i64,
    pub total: i64,
    pub file_name: String,
}

/// Start OAuth 2.0 PKCE flow. Opens browser, waits for callback, returns email.
pub fn connect() -> Result<ConnectResult, String> {
    let cid = client_id();
    let csecret = client_secret();
    if cid.is_empty() {
        return Err("Google OAuth credentials not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET at build time.".into());
    }

    let port = find_free_port();
    let redirect_uri = format!("http://127.0.0.1:{}/callback", port);
    let code_verifier = generate_code_verifier();
    let code_challenge = generate_code_challenge(&code_verifier);

    let mut state_bytes = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut state_bytes);
    let state = URL_SAFE_NO_PAD.encode(state_bytes);

    let auth_url = format!(
        "{}?client_id={}&redirect_uri={}&response_type=code&scope={}&code_challenge={}&code_challenge_method=S256&state={}&access_type=offline&prompt=consent",
        AUTH_URL,
        urlencoding(cid),
        urlencoding(&redirect_uri),
        urlencoding(SCOPES),
        code_challenge,
        state,
    );

    // Open browser
    open::that(&auth_url).map_err(|e| format!("Failed to open browser: {e}"))?;

    // Start local HTTP server to catch callback
    let server = tiny_http::Server::http(format!("127.0.0.1:{}", port))
        .map_err(|e| format!("Failed to start callback server: {e}"))?;

    let code = {
        let request = server
            .recv_timeout(std::time::Duration::from_secs(120))
            .map_err(|e| format!("Callback server error: {e}"))?
            .ok_or("Authorization timed out. Please try again.")?;

        let url = request.url().to_string();
        let code = parse_query_param(&url, "code")
            .ok_or("No code in callback URL")?;
        let returned_state = parse_query_param(&url, "state")
            .unwrap_or_default();

        if returned_state != state {
            let _ = request.respond(tiny_http::Response::from_string(
                "<html><body>Authorization failed: state mismatch.</body></html>",
            ));
            return Err("State mismatch in OAuth callback".into());
        }

        let _ = request.respond(tiny_http::Response::from_string(
            "<html><body style='font-family:sans-serif;text-align:center;padding:60px'><h2>Connected!</h2><p>You can close this tab and return to Incharj.</p></body></html>",
        ));
        code
    };
    drop(server);

    // Exchange code for tokens
    let client = Client::new();
    let params = [
        ("code", code.as_str()),
        ("client_id", cid),
        ("client_secret", csecret),
        ("redirect_uri", redirect_uri.as_str()),
        ("grant_type", "authorization_code"),
        ("code_verifier", code_verifier.as_str()),
    ];

    let token_resp: TokenResponse = client
        .post(TOKEN_URL)
        .form(&params)
        .send()
        .map_err(|e| format!("Token request failed: {e}"))?
        .json()
        .map_err(|e| format!("Token parse failed: {e}"))?;

    // Get user info
    let userinfo: UserInfo = client
        .get(USERINFO_URL)
        .bearer_auth(&token_resp.access_token)
        .send()
        .map_err(|e| format!("Userinfo request failed: {e}"))?
        .json()
        .map_err(|e| format!("Userinfo parse failed: {e}"))?;

    let email = userinfo.email.unwrap_or_else(|| "Unknown".into());
    let expiry_ms = token_resp.expires_in
        .map(|s| now_ms() + s * 1000);

    // Save config (credentials stay in the binary, only tokens persist)
    let mut integrations = load_integrations();
    integrations.google_drive = Some(GoogleDriveConfig {
        access_token: Some(token_resp.access_token),
        refresh_token: token_resp.refresh_token,
        token_expiry_ms: expiry_ms,
        email: Some(email.clone()),
    });
    save_integrations(&integrations)?;

    Ok(ConnectResult { email })
}

/// Refresh the access token using the refresh token.
fn refresh_access_token(config: &GoogleDriveConfig) -> Result<String, String> {
    let refresh_token = config.refresh_token.as_deref()
        .ok_or("No refresh token stored")?;
    let client = Client::new();
    let params = [
        ("client_id", client_id()),
        ("client_secret", client_secret()),
        ("refresh_token", refresh_token),
        ("grant_type", "refresh_token"),
    ];
    let resp: TokenResponse = client
        .post(TOKEN_URL)
        .form(&params)
        .send()
        .map_err(|e| format!("Refresh request failed: {e}"))?
        .json()
        .map_err(|e| format!("Refresh parse failed: {e}"))?;

    // Update stored token
    let mut integrations = load_integrations();
    if let Some(ref mut gd) = integrations.google_drive {
        gd.access_token = Some(resp.access_token.clone());
        gd.token_expiry_ms = resp.expires_in.map(|s| now_ms() + s * 1000);
    }
    let _ = save_integrations(&integrations);
    Ok(resp.access_token)
}

/// Get a valid access token, refreshing if needed.
fn get_valid_token(config: &GoogleDriveConfig) -> Result<String, String> {
    let needs_refresh = match (&config.token_expiry_ms, &config.access_token) {
        (Some(expiry), Some(_)) => now_ms() > expiry - 60_000,
        (None, Some(_)) => false,
        _ => true,
    };

    if needs_refresh {
        refresh_access_token(config)
    } else {
        config.access_token.clone().ok_or("No access token".into())
    }
}

/// Map a file extension (with leading dot) to the Drive MIME types that represent it.
fn ext_to_mimes(ext: &str) -> &'static [&'static str] {
    match ext {
        ".pdf"   => &["application/pdf"],
        ".docx" | ".doc" => &[
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.google-apps.document",
        ],
        ".xlsx" | ".xls" => &[
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.google-apps.spreadsheet",
        ],
        ".csv"   => &["text/csv", "application/vnd.google-apps.spreadsheet"],
        ".txt"   => &["text/plain"],
        ".pptx" | ".ppt" => &[
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "application/vnd.google-apps.presentation",
        ],
        _        => &[],
    }
}

/// Build the set of MIME types to query based on user-configured extensions.
fn mimes_for_extensions(extensions: &[String]) -> Vec<String> {
    let mut mimes: Vec<String> = Vec::new();
    for ext in extensions {
        for &mime in ext_to_mimes(ext) {
            let owned = mime.to_string();
            if !mimes.contains(&owned) {
                mimes.push(owned);
            }
        }
    }
    mimes
}

/// List Drive files matching the given MIME types, ordered by most recently modified.
fn list_drive_files(token: &str, mimes: &[String]) -> Result<Vec<DriveFile>, String> {
    if mimes.is_empty() {
        return Ok(Vec::new());
    }

    let client = Client::new();
    let mut all_files = Vec::new();
    let mut page_token: Option<String> = None;

    let q = mimes
        .iter()
        .map(|m| format!("mimeType='{m}'"))
        .collect::<Vec<_>>()
        .join(" or ");
    let query = format!("({q}) and trashed=false");

    loop {
        let mut req = client
            .get(FILES_URL)
            .bearer_auth(token)
            .query(&[
                ("q", query.as_str()),
                ("fields", "nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink)"),
                ("orderBy", "modifiedTime desc"),
                ("pageSize", "200"),
            ]);
        if let Some(ref pt) = page_token {
            req = req.query(&[("pageToken", pt.as_str())]);
        }

        let resp: FileListResponse = req
            .send()
            .map_err(|e| format!("Files list request failed: {e}"))?
            .json()
            .map_err(|e| format!("Files list parse failed: {e}"))?;

        all_files.extend(resp.files);
        match resp.next_page_token {
            Some(pt) => page_token = Some(pt),
            None => break,
        }
    }

    Ok(all_files)
}

/// Export or download file content as text.
fn fetch_file_content(token: &str, file: &DriveFile) -> Option<String> {
    let client = Client::new();

    let url = match file.mime_type.as_str() {
        "application/vnd.google-apps.document" | "application/vnd.google-apps.presentation" => {
            format!("https://www.googleapis.com/drive/v3/files/{}/export?mimeType=text/plain", file.id)
        }
        "application/vnd.google-apps.spreadsheet" => {
            format!("https://www.googleapis.com/drive/v3/files/{}/export?mimeType=text/csv", file.id)
        }
        _ => {
            format!("https://www.googleapis.com/drive/v3/files/{}?alt=media", file.id)
        }
    };

    let mut resp = client
        .get(&url)
        .bearer_auth(token)
        .send()
        .ok()?;

    if !resp.status().is_success() {
        return None;
    }

    let mut content = String::new();
    resp.read_to_string(&mut content).ok()?;
    if content.trim().is_empty() { None } else { Some(content) }
}

/// Parse RFC3339 ("2024-01-15T10:30:00.000Z") to Unix milliseconds.
fn parse_rfc3339_ms(s: &str) -> Option<i64> {
    if s.len() < 19 { return None; }
    let year: i64  = s[0..4].parse().ok()?;
    let month: i64 = s[5..7].parse().ok()?;
    let day: i64   = s[8..10].parse().ok()?;
    let hour: i64  = s[11..13].parse().ok()?;
    let min: i64   = s[14..16].parse().ok()?;
    let sec: i64   = s[17..19].parse().ok()?;
    let is_leap = |y: i64| (y % 4 == 0 && y % 100 != 0) || y % 400 == 0;
    let dim = [0i64, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let mut days = (year - 1970) * 365 + (year - 1969) / 4 - (year - 1901) / 100 + (year - 1601) / 400;
    for m in 1..month { days += dim[m as usize]; if m == 2 && is_leap(year) { days += 1; } }
    days += day - 1;
    Some((days * 86_400 + hour * 3_600 + min * 60 + sec) * 1_000)
}

fn mime_to_ext(mime: &str) -> &str {
    match mime {
        "application/vnd.google-apps.document" => ".gdoc",
        "application/vnd.google-apps.spreadsheet" => ".gsheet",
        "application/vnd.google-apps.presentation" => ".gslides",
        "application/pdf" => ".pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" => ".docx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" => ".xlsx",
        "text/plain" => ".txt",
        "text/csv" => ".csv",
        _ => ".bin",
    }
}

/// Sync Google Drive files into the index.
pub fn sync(app: Option<&AppHandle>) -> Result<(i64, i64), String> {
    ensure_schema().map_err(|e| e.to_string())?;
    let integrations = load_integrations();
    let gd_config = integrations.google_drive.as_ref()
        .ok_or("Google Drive not connected")?;

    let token = get_valid_token(gd_config)?;
    let configured_extensions = load_app_config().config.extensions;
    let mimes = mimes_for_extensions(&configured_extensions);
    // Temporary cap for testing — remove when Drive integration is validated
    const SYNC_LIMIT: usize = 20;
    let files: Vec<DriveFile> = list_drive_files(&token, &mimes)?.into_iter().take(SYNC_LIMIT).collect();
    let total = files.len() as i64;
    let mut indexed = 0i64;
    let mut skipped = 0i64;

    let conn = open_db().map_err(|e| e.to_string())?;

    // Remove stale Drive files that are no longer in Drive
    let drive_paths: std::collections::HashSet<String> = files.iter()
        .map(|f| format!("gdrive://{}", f.id))
        .collect();
    let mut stmt = conn.prepare("SELECT path FROM files WHERE source = 'google_drive'")
        .map_err(|e| e.to_string())?;
    let existing_paths: Vec<String> = stmt
        .query_map([], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    for path in existing_paths {
        if !drive_paths.contains(&path) {
            let _ = conn.execute("DELETE FROM files_fts_chunks WHERE path = ?1", [path.as_str()]);
            let _ = conn.execute("DELETE FROM files WHERE path = ?1", [path.as_str()]);
        }
    }

    for (i, file) in files.iter().enumerate() {
        if let Some(app) = app {
            let _ = app.emit("integration:sync-progress", SyncProgress {
                current: i as i64 + 1,
                total,
                file_name: file.name.clone(),
            });
        }

        let path = format!("gdrive://{}", file.id);
        let ext = mime_to_ext(&file.mime_type).to_string();
        let web_url = file.web_view_link.clone().unwrap_or_default();
        let mtime = parse_rfc3339_ms(file.modified_time.as_deref().unwrap_or(""))
            .unwrap_or_else(now_ms);

        // Check if unchanged via content hash
        let existing: Option<String> = conn.query_row(
            "SELECT content_hash FROM files WHERE path = ?1",
            [path.as_str()],
            |row| row.get(0),
        ).ok();

        let content = match fetch_file_content(&token, file) {
            Some(c) => c,
            None => {
                skipped += 1;
                continue;
            }
        };

        let hash = format!("{:x}", Sha256::digest(content.as_bytes()));

        if existing.as_deref() == Some(&hash) {
            skipped += 1;
            continue;
        }

        // Upsert file record
        let _ = conn.execute(
            r#"INSERT INTO files(path, mtime_ms, size_bytes, ext, content_hash, indexed_at, source, external_id, web_url, display_name)
               VALUES(?1,?2,?3,?4,?5,?6,'google_drive',?7,?8,?9)
               ON CONFLICT(path) DO UPDATE SET
                 mtime_ms=excluded.mtime_ms, size_bytes=excluded.size_bytes,
                 ext=excluded.ext, content_hash=excluded.content_hash,
                 indexed_at=excluded.indexed_at, web_url=excluded.web_url,
                 display_name=excluded.display_name"#,
            rusqlite::params![
                path, mtime, content.len() as i64, ext, hash, now_ms(),
                file.id, web_url, file.name
            ],
        );

        // Upsert FTS chunks
        let _ = conn.execute("DELETE FROM files_fts_chunks WHERE path = ?1", [path.as_str()]);
        let words: String = content.split_whitespace().collect::<Vec<_>>().join(" ");
        for (ci, chunk) in words.as_bytes().chunks(4000).enumerate() {
            let chunk_str = String::from_utf8_lossy(chunk).to_string();
            let _ = conn.execute(
                "INSERT INTO files_fts_chunks(path, chunk_index, content) VALUES(?1,?2,?3)",
                rusqlite::params![path, ci as i64, chunk_str],
            );
        }

        indexed += 1;
    }

    Ok((indexed, skipped))
}

/// Disconnect Google Drive: remove tokens and all Drive files from index.
pub fn reset_sync() -> Result<(), String> {
    ensure_schema().map_err(|e| e.to_string())?;
    let conn = open_db().map_err(|e| e.to_string())?;
    let paths: Vec<String> = {
        let mut stmt = conn.prepare("SELECT path FROM files WHERE source = 'google_drive'")
            .map_err(|e| e.to_string())?;
        let collected: Vec<String> = stmt.query_map([], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        collected
    };
    for path in paths {
        let _ = conn.execute("DELETE FROM files_fts_chunks WHERE path = ?1", [path.as_str()]);
        let _ = conn.execute("DELETE FROM files WHERE path = ?1", [path.as_str()]);
    }
    Ok(())
}

pub fn disconnect() -> Result<(), String> {
    ensure_schema().map_err(|e| e.to_string())?;
    let conn = open_db().map_err(|e| e.to_string())?;

    // Remove all Drive-sourced files from FTS and files tables
    let paths: Vec<String> = {
        let mut stmt = conn.prepare("SELECT path FROM files WHERE source = 'google_drive'")
            .map_err(|e| e.to_string())?;
        let collected: Vec<String> = stmt.query_map([], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        collected
    };
    for path in paths {
        let _ = conn.execute("DELETE FROM files_fts_chunks WHERE path = ?1", [path.as_str()]);
        let _ = conn.execute("DELETE FROM files WHERE path = ?1", [path.as_str()]);
    }

    // Remove config
    let mut integrations = load_integrations();
    integrations.google_drive = None;
    save_integrations(&integrations)
}

fn urlencoding(s: &str) -> String {
    s.chars().map(|c| match c {
        'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '_' | '.' | '~' => c.to_string(),
        ' ' => "%20".to_string(),
        _ => format!("%{:02X}", c as u32),
    }).collect()
}

fn parse_query_param(url: &str, param: &str) -> Option<String> {
    let query_start = url.find('?')?;
    let query = &url[query_start + 1..];
    for pair in query.split('&') {
        let mut parts = pair.splitn(2, '=');
        if parts.next()? == param {
            return Some(parts.next().unwrap_or("").replace("%2F", "/").replace("%3D", "=").replace('+', " "));
        }
    }
    None
}
