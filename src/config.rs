use anyhow::{Context, Result};
use cron::Schedule;
use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::path::PathBuf;
use std::str::FromStr;

const DEFAULT_LIMIT: i32 = 10;
const MIN_LIMIT: i32 = 1;
const MAX_LIMIT: i32 = 200;
const DEFAULT_INTERVAL_SECS: u64 = 300;
const MIN_INTERVAL_SECS: u64 = 30;
const MAX_INTERVAL_SECS: u64 = 3600;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ScheduleMode {
    Interval,
    Cron,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseConfig {
    pub name: String,
    pub dsn: String,
    #[serde(default)]
    pub limit: Option<i32>,
    #[serde(default)]
    pub interval: Option<u64>,
    #[serde(default)]
    pub cron: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default = "default_enabled")]
    pub enabled: bool,
}

impl DatabaseConfig {
    pub fn schedule_mode(&self) -> ScheduleMode {
        if self.cron.is_some() {
            ScheduleMode::Cron
        } else {
            ScheduleMode::Interval
        }
    }

    pub fn parse_cron_schedule(&self) -> Option<Schedule> {
        self.cron
            .as_ref()
            .and_then(|expr| Schedule::from_str(expr).ok())
    }

    pub fn schedule_display(&self, global_interval: u64) -> String {
        match self.schedule_mode() {
            ScheduleMode::Cron => format!("cron: {}", self.cron.as_ref().unwrap()),
            ScheduleMode::Interval => {
                format!("interval: {}s", self.interval.unwrap_or(global_interval))
            }
        }
    }
}

fn default_enabled() -> bool {
    true
}
fn default_interval() -> u64 {
    DEFAULT_INTERVAL_SECS
}
fn default_limit() -> i32 {
    DEFAULT_LIMIT
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigFile {
    #[serde(default)]
    pub endpoint: String,
    #[serde(default)]
    pub token: String,
    #[serde(default = "default_interval")]
    pub interval: u64,
    #[serde(default = "default_limit")]
    pub limit: i32,
    #[serde(default)]
    pub databases: Vec<DatabaseConfig>,
}

impl Default for ConfigFile {
    fn default() -> Self {
        Self {
            endpoint: String::new(),
            token: String::new(),
            interval: DEFAULT_INTERVAL_SECS,
            limit: DEFAULT_LIMIT,
            databases: Vec::new(),
        }
    }
}

impl ConfigFile {
    pub fn load() -> Result<Self> {
        match Self::find_config_file() {
            Some(path) => {
                let config = Self::load_from_path(&path)?;
                eprintln!("Loaded config from: {}", path.display());
                Ok(config)
            }
            None => anyhow::bail!(
                "No config file found.\n\n\
                Create one with: pgdoctor config init\n\n\
                Search paths:\n  \
                - ./pgdoctor.yaml\n  \
                - ~/.config/pgdoctor/config.yaml\n  \
                - /etc/pgdoctor/config.yaml (Unix only)\n\n\
                Or set PGDOCTOR_CONFIG to specify a custom path."
            ),
        }
    }

    pub fn load_from_path(path: &PathBuf) -> Result<Self> {
        let content = fs::read_to_string(path)
            .with_context(|| format!("failed to read config file: {}", path.display()))?;

        let mut config: ConfigFile = serde_yaml::from_str(&content)
            .with_context(|| format!("failed to parse config file: {}", path.display()))?;

        config.interval = config.interval.clamp(MIN_INTERVAL_SECS, MAX_INTERVAL_SECS);
        config.limit = config.limit.clamp(MIN_LIMIT, MAX_LIMIT);

        for db in &mut config.databases {
            db.limit = db.limit.map(|l| l.clamp(MIN_LIMIT, MAX_LIMIT));
            db.interval = db
                .interval
                .map(|i| i.clamp(MIN_INTERVAL_SECS, MAX_INTERVAL_SECS));
        }

        Ok(config)
    }

    fn find_config_file() -> Option<PathBuf> {
        if let Ok(path) = env::var("PGDOCTOR_CONFIG") {
            let path = PathBuf::from(path);
            if path.exists() {
                return Some(path);
            }
        }

        let local = PathBuf::from("pgdoctor.yaml");
        if local.exists() {
            return Some(local);
        }

        if let Some(config_dir) = dirs::config_dir() {
            let user_config = config_dir.join("pgdoctor").join("config.yaml");
            if user_config.exists() {
                return Some(user_config);
            }
        }

        #[cfg(unix)]
        {
            let system_config = PathBuf::from("/etc/pgdoctor/config.yaml");
            if system_config.exists() {
                return Some(system_config);
            }
        }

        None
    }

    pub fn user_config_path() -> PathBuf {
        dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("pgdoctor")
            .join("config.yaml")
    }

    pub fn enabled_databases(&self) -> Vec<&DatabaseConfig> {
        self.databases.iter().filter(|db| db.enabled).collect()
    }

    pub fn validate(&self) -> Result<()> {
        if self.endpoint.is_empty() {
            anyhow::bail!("'endpoint' is required in config file.");
        }
        if self.token.is_empty() {
            anyhow::bail!("'token' is required in config file.");
        }
        if self.databases.is_empty() {
            anyhow::bail!("At least one database must be configured.");
        }
        if self.enabled_databases().is_empty() {
            anyhow::bail!("At least one database must be enabled.");
        }

        for db in &self.databases {
            if db.interval.is_some() && db.cron.is_some() {
                anyhow::bail!(
                    "Database '{}': cannot specify both 'interval' and 'cron'. Choose one.",
                    db.name
                );
            }
            if let Some(cron_expr) = &db.cron {
                Schedule::from_str(cron_expr).map_err(|e| {
                    anyhow::anyhow!(
                        "Database '{}': invalid cron expression '{}': {}",
                        db.name,
                        cron_expr,
                        e
                    )
                })?;
            }
        }

        Ok(())
    }

    pub fn generate_sample() -> String {
        r#"# PGDoctor Configuration

endpoint: "https://your-api-endpoint.com/api/snapshots"
token: "your-api-token"
interval: 300  # default interval in seconds (30-3600)
limit: 20      # max queries per snapshot (1-200)

# Schedule modes:
#   interval: continuous collection every N seconds (default)
#   cron: scheduled collection using cron expression
#
# Cron format: "sec min hour day month weekday year"
# Examples:
#   "0 */5 * * * * *" = every 5 minutes
#   "0 0 * * * * *"   = every hour
#   "0 0 3 * * * *"   = daily at 3am
#   "0 0 9-17 * * MON-FRI *" = hourly during business hours

databases:
  - name: "production"
    dsn: "postgres://user:password@prod-db:5432/myapp"
    tags: ["production", "critical"]
    interval: 60  # every 60 seconds

  - name: "analytics"
    dsn: "postgres://user:password@analytics-db:5432/analytics"
    tags: ["analytics"]
    cron: "0 */15 * * * * *"  # every 15 minutes via cron

  - name: "backup"
    dsn: "postgres://user:password@backup-db:5432/backup"
    tags: ["backup"]
    cron: "0 0 2 * * * *"  # daily at 2am

  - name: "development"
    dsn: "postgres://localhost:5432/myapp_dev"
    tags: ["development"]
    enabled: false  # uses default interval when enabled
"#
        .to_string()
    }
}

#[derive(Debug, Clone)]
pub struct Config {
    pub dsn: String,
    pub limit: i32,
    pub endpoint: String,
    pub token: String,
    pub interval_secs: u64,
}

impl Config {
    pub fn from_database(db: &DatabaseConfig, global: &ConfigFile) -> Self {
        Self {
            dsn: db.dsn.clone(),
            limit: db.limit.unwrap_or(global.limit),
            endpoint: global.endpoint.clone(),
            token: global.token.clone(),
            interval_secs: db.interval.unwrap_or(global.interval),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_sample_config() {
        let sample = ConfigFile::generate_sample();
        let config: ConfigFile = serde_yaml::from_str(&sample).unwrap();
        assert_eq!(config.databases.len(), 4);
        assert_eq!(config.interval, 300);
        assert_eq!(config.enabled_databases().len(), 3);
    }

    #[test]
    fn test_validation() {
        let mut config = ConfigFile::default();
        assert!(config.validate().is_err());

        config.endpoint = "https://api.example.com".to_string();
        config.token = "token".to_string();
        assert!(config.validate().is_err());

        config.databases.push(DatabaseConfig {
            name: "test".to_string(),
            dsn: "postgres://localhost/test".to_string(),
            limit: None,
            interval: None,
            cron: None,
            tags: vec![],
            enabled: true,
        });
        assert!(config.validate().is_ok());
    }

    #[test]
    fn test_cron_validation() {
        let mut config = ConfigFile::default();
        config.endpoint = "https://api.example.com".to_string();
        config.token = "token".to_string();
        config.databases.push(DatabaseConfig {
            name: "cron-db".to_string(),
            dsn: "postgres://localhost/test".to_string(),
            limit: None,
            interval: None,
            cron: Some("0 */5 * * * * *".to_string()),
            tags: vec![],
            enabled: true,
        });
        assert!(config.validate().is_ok());
    }

    #[test]
    fn test_interval_and_cron_mutual_exclusion() {
        let mut config = ConfigFile::default();
        config.endpoint = "https://api.example.com".to_string();
        config.token = "token".to_string();
        config.databases.push(DatabaseConfig {
            name: "both-db".to_string(),
            dsn: "postgres://localhost/test".to_string(),
            limit: None,
            interval: Some(60),
            cron: Some("0 */5 * * * * *".to_string()),
            tags: vec![],
            enabled: true,
        });
        assert!(config.validate().is_err());
    }

    #[test]
    fn test_invalid_cron_expression() {
        let mut config = ConfigFile::default();
        config.endpoint = "https://api.example.com".to_string();
        config.token = "token".to_string();
        config.databases.push(DatabaseConfig {
            name: "bad-cron".to_string(),
            dsn: "postgres://localhost/test".to_string(),
            limit: None,
            interval: None,
            cron: Some("invalid cron".to_string()),
            tags: vec![],
            enabled: true,
        });
        assert!(config.validate().is_err());
    }
}
