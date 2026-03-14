use super::{load_integrations, save_integrations, NotionConfig};
use crate::db::{ensure_schema, open_db};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use rand::RngCore;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

const API_BASE: &str = "https://api.notion.com/v1";
const NOTION_VERSION: &str = "2022-06-28";
const AUTH_URL: &str = "https://api.notion.com/v1/oauth/authorize";
const TOKEN_URL: &str = "https://api.notion.com/v1/oauth/token";

fn client_id() -> &'static str { option_env!("NOTION_CLIENT_ID").unwrap_or("") }
fn client_secret() -> &'static str { option_env!("NOTION_CLIENT_SECRET").unwrap_or("") }

fn find_free_port() -> u16 {
    use std::net::TcpListener;
    TcpListener::bind("127.0.0.1:0")
        .map(|l| l.local_addr().unwrap().port())
        .unwrap_or(19235)
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// ── Deserialization structs ────────────────────────────────────────────────

#[derive(Deserialize)]
struct OAuthTokenResponse {
    access_token: String,
    workspace_name: Option<String>,
    workspace_id: Option<String>,
    bot_id: Option<String>,
}

#[derive(Deserialize, Clone)]
struct NotionPage {
    id: String,
    url: String,
    last_edited_time: Option<String>,
    properties: serde_json::Value,
}

#[derive(Deserialize)]
struct SearchResponse {
    results: Vec<NotionPage>,
    #[serde(default)]
    next_cursor: Option<String>,
    #[serde(default)]
    has_more: bool,
}

#[derive(Deserialize)]
struct BlocksResponse {
    results: Vec<serde_json::Value>,
    #[serde(default)]
    next_cursor: Option<String>,
    #[serde(default)]
    has_more: bool,
}

// ── Public result types ────────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectResult {
    pub workspace_name: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncProgress {
    pub current: i64,
    pub total: i64,
    pub file_name: String,
}

// ── HTTP helpers ───────────────────────────────────────────────────────────

fn get(client: &Client, token: &str, url: &str) -> reqwest::blocking::RequestBuilder {
    client
        .get(url)
        .bearer_auth(token)
        .header("Notion-Version", NOTION_VERSION)
}

fn post(client: &Client, token: &str, url: &str) -> reqwest::blocking::RequestBuilder {
    client
        .post(url)
        .bearer_auth(token)
        .header("Notion-Version", NOTION_VERSION)
}

// ── Content extraction ─────────────────────────────────────────────────────

fn rich_text_to_string(arr: &serde_json::Value) -> String {
    arr.as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item["plain_text"].as_str())
                .collect::<Vec<_>>()
                .join("")
        })
        .unwrap_or_default()
}

fn block_to_text(block: &serde_json::Value) -> String {
    let block_type = match block["type"].as_str() {
        Some(t) => t,
        None => return String::new(),
    };
    if block_type == "table_row" {
        if let Some(cells) = block["table_row"]["cells"].as_array() {
            return cells
                .iter()
                .map(|c| rich_text_to_string(c))
                .filter(|s| !s.is_empty())
                .collect::<Vec<_>>()
                .join(" ");
        }
    }
    rich_text_to_string(&block[block_type]["rich_text"])
}

fn page_title(properties: &serde_json::Value) -> String {
    if let Some(props) = properties.as_object() {
        for (_, prop) in props {
            if prop["type"].as_str() == Some("title") {
                let text = rich_text_to_string(&prop["title"]);
                if !text.is_empty() {
                    return text;
                }
            }
        }
    }
    "Untitled".to_string()
}

fn parse_iso8601_ms(s: &str) -> Option<i64> {
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

// ── API calls ──────────────────────────────────────────────────────────────

fn list_pages(token: &str) -> Result<Vec<NotionPage>, String> {
    let client = Client::new();
    let mut all_pages: Vec<NotionPage> = Vec::new();
    let mut cursor: Option<String> = None;

    loop {
        let mut body = serde_json::json!({
            "filter": { "value": "page", "property": "object" },
            "page_size": 100
        });
        if let Some(ref c) = cursor {
            body["start_cursor"] = serde_json::Value::String(c.clone());
        }
        let resp: SearchResponse = post(&client, token, &format!("{API_BASE}/search"))
            .json(&body)
            .send()
            .map_err(|e| format!("Notion search failed: {e}"))?
            .json()
            .map_err(|e| format!("Notion search parse failed: {e}"))?;

        all_pages.extend(resp.results);
        if resp.has_more {
            cursor = resp.next_cursor;
        } else {
            break;
        }
    }

    // Sort by last_edited_time descending — most recently edited first
    all_pages.sort_by(|a, b| {
        let ta = a.last_edited_time.as_deref().unwrap_or("");
        let tb = b.last_edited_time.as_deref().unwrap_or("");
        tb.cmp(ta)
    });

    Ok(all_pages)
}

fn fetch_page_content(token: &str, page_id: &str) -> Option<String> {
    let client = Client::new();
    let mut text_parts: Vec<String> = Vec::new();
    let mut cursor: Option<String> = None;

    loop {
        let url = format!("{API_BASE}/blocks/{page_id}/children");
        let mut req = get(&client, token, &url).query(&[("page_size", "100")]);
        if let Some(ref c) = cursor {
            req = req.query(&[("start_cursor", c.as_str())]);
        }
        let resp: BlocksResponse = req.send().ok()?.json().ok()?;

        for block in &resp.results {
            let text = block_to_text(block);
            if !text.is_empty() {
                text_parts.push(text);
            }
        }

        if resp.has_more {
            cursor = resp.next_cursor;
        } else {
            break;
        }
    }

    let content = text_parts.join("\n");
    if content.trim().is_empty() { None } else { Some(content) }
}

// ── Public API ─────────────────────────────────────────────────────────────

pub fn connect(_app: &tauri::AppHandle) -> Result<ConnectResult, String> {
    let cid = client_id();
    if cid.is_empty() {
        return Err("Notion OAuth credentials not configured. Set NOTION_CLIENT_ID and NOTION_CLIENT_SECRET at build time.".into());
    }

    // GitHub Pages bounce page (HTTPS — Notion requires it); page JS-redirects to localhost server
    let redirect_uri = "https://okumujustine.github.io/Incharj/callback";
    let port: u16 = 12346;

    // Random state for CSRF protection
    let mut state_bytes = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut state_bytes);
    let state = URL_SAFE_NO_PAD.encode(state_bytes);

    let auth_url = format!(
        "{}?client_id={}&redirect_uri={}&response_type=code&owner=user&state={}",
        AUTH_URL,
        urlencoding(cid),
        urlencoding(redirect_uri),
        state,
    );

    // Start local server before opening browser so it's ready when the bounce page redirects
    let server = tiny_http::Server::http(format!("127.0.0.1:{port}"))
        .map_err(|_| format!("Port {port} is already in use. Close any app using that port and try again."))?;

    open::that(&auth_url).map_err(|e| format!("Failed to open browser: {e}"))?;

    // Wait up to 120s for the bounce page to redirect here
    let request = server
        .recv_timeout(std::time::Duration::from_secs(120))
        .map_err(|e| format!("Callback server error: {e}"))?
        .ok_or("Authorization timed out. Please try again.")?;

    let url = request.url().to_string();
    let code = parse_query_param(&url, "code").ok_or("No code in callback URL")?;
    let returned_state = parse_query_param(&url, "state").unwrap_or_default();

    if returned_state != state {
        let _ = request.respond(tiny_http::Response::from_string("State mismatch."));
        return Err("State mismatch in OAuth callback".into());
    }

    let _ = request.respond(tiny_http::Response::from_string(
        "<html><body style='font-family:sans-serif;text-align:center;padding:60px;background:#18160f;color:#f2ede3'><h2>Connected to Notion!</h2><p style='opacity:0.5'>You can close this tab and return to Incharj.</p></body></html>",
    ));
    drop(server);

    // Exchange code for token — Notion uses HTTP Basic auth with client credentials
    let client = Client::new();
    let credentials = BASE64.encode(format!("{}:{}", cid, client_secret()));
    let body = serde_json::json!({
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_uri,
    });

    let token_resp: OAuthTokenResponse = client
        .post(TOKEN_URL)
        .header("Authorization", format!("Basic {}", credentials))
        .json(&body)
        .send()
        .map_err(|e| format!("Token request failed: {e}"))?
        .json()
        .map_err(|e| format!("Token parse failed: {e}"))?;

    let workspace_name = token_resp.workspace_name
        .unwrap_or_else(|| "Notion".to_string());

    let mut integrations = load_integrations();
    integrations.notion = Some(NotionConfig {
        token: token_resp.access_token,
        workspace_name: Some(workspace_name.clone()),
    });
    save_integrations(&integrations)?;

    Ok(ConnectResult { workspace_name })
}

pub fn sync(app: Option<&AppHandle>) -> Result<(i64, i64), String> {
    ensure_schema().map_err(|e| e.to_string())?;
    let integrations = load_integrations();
    let config = integrations.notion.as_ref().ok_or("Notion not connected")?;
    let token = config.token.clone();

    // Temporary cap for testing — remove when validated
    const SYNC_LIMIT: usize = 20;
    let pages: Vec<NotionPage> = list_pages(&token)?.into_iter().take(SYNC_LIMIT).collect();
    let total = pages.len() as i64;
    let mut indexed = 0i64;
    let mut skipped = 0i64;

    let conn = open_db().map_err(|e| e.to_string())?;

    // Remove stale pages no longer accessible
    let notion_paths: std::collections::HashSet<String> =
        pages.iter().map(|p| format!("notion://{}", p.id)).collect();
    let mut stmt = conn
        .prepare("SELECT path FROM files WHERE source = 'notion'")
        .map_err(|e| e.to_string())?;
    let existing: Vec<String> = stmt
        .query_map([], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    for path in existing {
        if !notion_paths.contains(&path) {
            let _ = conn.execute("DELETE FROM files_fts_chunks WHERE path = ?1", [path.as_str()]);
            let _ = conn.execute("DELETE FROM files WHERE path = ?1", [path.as_str()]);
        }
    }

    for (i, page) in pages.iter().enumerate() {
        let title = page_title(&page.properties);

        if let Some(app) = app {
            let _ = app.emit("integration:sync-progress", SyncProgress {
                current: i as i64 + 1,
                total,
                file_name: title.clone(),
            });
        }

        let path = format!("notion://{}", page.id);
        let mtime = page.last_edited_time.as_deref()
            .and_then(parse_iso8601_ms)
            .unwrap_or_else(now_ms);

        let existing_hash: Option<String> = conn.query_row(
            "SELECT content_hash FROM files WHERE path = ?1",
            [path.as_str()],
            |row| row.get(0),
        ).ok();

        let content = match fetch_page_content(&token, &page.id) {
            Some(c) => c,
            None => { skipped += 1; continue; }
        };

        let hash = format!("{:x}", Sha256::digest(content.as_bytes()));
        if existing_hash.as_deref() == Some(&hash) {
            skipped += 1;
            continue;
        }

        let _ = conn.execute(
            r#"INSERT INTO files(path, mtime_ms, size_bytes, ext, content_hash, indexed_at, source, external_id, web_url, display_name)
               VALUES(?1,?2,?3,'.notion',?4,?5,'notion',?6,?7,?8)
               ON CONFLICT(path) DO UPDATE SET
                 mtime_ms=excluded.mtime_ms, size_bytes=excluded.size_bytes,
                 content_hash=excluded.content_hash, indexed_at=excluded.indexed_at,
                 web_url=excluded.web_url, display_name=excluded.display_name"#,
            rusqlite::params![
                path, mtime, content.len() as i64, hash, now_ms(),
                page.id, page.url, title
            ],
        );

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

pub fn disconnect() -> Result<(), String> {
    ensure_schema().map_err(|e| e.to_string())?;
    let conn = open_db().map_err(|e| e.to_string())?;
    let paths: Vec<String> = {
        let mut stmt = conn
            .prepare("SELECT path FROM files WHERE source = 'notion'")
            .map_err(|e| e.to_string())?;
        let collected: Vec<String> = stmt
            .query_map([], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        collected
    };
    for path in paths {
        let _ = conn.execute("DELETE FROM files_fts_chunks WHERE path = ?1", [path.as_str()]);
        let _ = conn.execute("DELETE FROM files WHERE path = ?1", [path.as_str()]);
    }
    let mut integrations = load_integrations();
    integrations.notion = None;
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
