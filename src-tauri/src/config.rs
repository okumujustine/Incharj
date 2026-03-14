use dirs::home_dir;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

pub const ALLOWED_EXTENSIONS: [&str; 6] = [".pdf", ".csv", ".docx", ".doc", ".xlsx", ".xls"];

fn default_onboarding_complete() -> bool {
    false
}

fn sanitize_extensions(mut extensions: Vec<String>) -> Vec<String> {
    extensions.retain(|ext| {
        let normalized = if ext.starts_with('.') {
            ext.to_lowercase()
        } else {
            format!(".{}", ext.to_lowercase())
        };
        ALLOWED_EXTENSIONS.contains(&normalized.as_str())
    });
    extensions
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub folders: Vec<String>,
    pub extensions: Vec<String>,
    pub ignore: Vec<String>,
    pub theme: String,
    #[serde(default = "default_onboarding_complete")]
    pub onboarding_complete: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct AppConfigState {
    pub config: AppConfig,
    pub config_path: String,
    pub from_file: bool,
    pub warnings: Vec<String>,
}

pub fn default_config() -> AppConfig {
    AppConfig {
        folders: vec![
            "~/Documents".into(),
            "~/Projects".into(),
            "~/Desktop".into(),
        ],
        extensions: vec![".pdf".into(), ".docx".into(), ".csv".into()],
        ignore: vec![
            "**/node_modules/**".into(),
            "**/.git/**".into(),
            "**/dist/**".into(),
            "**/build/**".into(),
            "**/.next/**".into(),
        ],
        theme: "cyan".into(),
        onboarding_complete: false,
    }
}

pub fn config_path() -> PathBuf {
    let mut path = home_dir().unwrap_or_else(|| PathBuf::from("."));
    path.push(".incharj");
    path.push("config.json");
    path
}

pub fn load_app_config() -> AppConfigState {
    let path = config_path();
    let config = default_config();
    let config_path = path.to_string_lossy().to_string();

    if !path.exists() {
        return AppConfigState {
            config,
            config_path,
            from_file: false,
            warnings: vec![],
        };
    }

    match fs::read_to_string(&path) {
        Ok(raw) => match serde_json::from_str::<AppConfig>(&raw) {
            Ok(mut parsed) => {
                parsed.extensions = sanitize_extensions(parsed.extensions);
                AppConfigState {
                    config: parsed,
                    config_path,
                    from_file: true,
                    warnings: vec![],
                }
            }
            Err(err) => AppConfigState {
                config,
                config_path,
                from_file: true,
                warnings: vec![format!("Invalid config: {err}")],
            },
        },
        Err(err) => AppConfigState {
            config,
            config_path,
            from_file: true,
            warnings: vec![format!("Failed to read config: {err}")],
        },
    }
}

pub fn save_app_config(config: &AppConfig) -> Result<(), String> {
    let path = config_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let raw = serde_json::to_string_pretty(config).map_err(|err| err.to_string())?;
    fs::write(path, raw).map_err(|err| err.to_string())
}
