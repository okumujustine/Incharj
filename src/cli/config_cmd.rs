use anyhow::{Context, Result};
use std::fs;
use std::path::PathBuf;

use pgdoctor::ConfigFile;

pub fn config_init(path: Option<&str>) -> Result<()> {
    let target = path
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("pgdoctor.yaml"));

    if target.exists() {
        anyhow::bail!("Config file already exists: {}", target.display());
    }

    if let Some(parent) = target.parent().filter(|p| !p.as_os_str().is_empty()) {
        fs::create_dir_all(parent)
            .with_context(|| format!("failed to create directory: {}", parent.display()))?;
    }

    fs::write(&target, ConfigFile::generate_sample())
        .with_context(|| format!("failed to write config file: {}", target.display()))?;

    println!("Created sample config: {}", target.display());
    println!("\nNext steps:");
    println!("  1. Edit the file with your database connection strings");
    println!("  2. Add your API endpoint and token");
    println!("  3. Run 'pgdoctor daemon' to start monitoring");
    Ok(())
}

pub fn config_show() -> Result<()> {
    let config = ConfigFile::load()?;
    println!("Configuration loaded from YAML\n");
    println!("Global Settings:");
    println!("  Endpoint: {}", display_or_not_set(&config.endpoint));
    println!(
        "  Token:    {}",
        if config.token.is_empty() {
            "(not set)"
        } else {
            "****"
        }
    );
    println!("  Interval: {}s", config.interval);
    println!("  Limit:    {}", config.limit);
    println!();

    let enabled_count = config.enabled_databases().len();
    println!(
        "Databases ({} configured, {} enabled):",
        config.databases.len(),
        enabled_count
    );

    for db in &config.databases {
        let status = if db.enabled { "✓" } else { "○" };
        println!("  {} {} ({})", status, db.name, mask_dsn(&db.dsn));
        if !db.tags.is_empty() {
            println!("    Tags: {}", db.tags.join(", "));
        }
        if let Some(interval) = db.interval {
            println!("    Interval: {}s (override)", interval);
        }
    }
    Ok(())
}

pub fn config_path() -> Result<()> {
    println!("Configuration file search order:\n");

    let env_config = std::env::var("PGDOCTOR_CONFIG").ok();
    let local_exists = std::path::Path::new("pgdoctor.yaml").exists();
    let user_path = ConfigFile::user_config_path();
    let user_exists = user_path.exists();
    #[cfg(unix)]
    let system_exists = std::path::Path::new("/etc/pgdoctor/config.yaml").exists();

    // Show which one is active
    let active = if env_config
        .as_ref()
        .map(|p| std::path::Path::new(p).exists())
        .unwrap_or(false)
    {
        1
    } else if local_exists {
        2
    } else if user_exists {
        3
    } else {
        #[cfg(unix)]
        if system_exists {
            4
        } else {
            0
        }
        #[cfg(not(unix))]
        0
    };

    let mark = |n: i32| if n == active { "✓" } else { " " };

    println!(
        "{} 1. $PGDOCTOR_CONFIG ({})",
        mark(1),
        env_config.as_deref().unwrap_or("not set")
    );
    println!(
        "{} 2. ./pgdoctor.yaml {}",
        mark(2),
        if local_exists {
            "(found)"
        } else {
            "(not found)"
        }
    );
    println!(
        "{} 3. {} {}",
        mark(3),
        user_path.display(),
        if user_exists {
            "(found)"
        } else {
            "(not found)"
        }
    );
    #[cfg(unix)]
    println!(
        "{} 4. /etc/pgdoctor/config.yaml {}",
        mark(4),
        if system_exists {
            "(found)"
        } else {
            "(not found)"
        }
    );

    if active == 0 {
        println!("\n⚠ No config file found. Run 'pgdoctor config init' to create one.");
    }
    Ok(())
}

fn display_or_not_set(s: &str) -> &str {
    if s.is_empty() {
        "(not set)"
    } else {
        s
    }
}

fn mask_dsn(dsn: &str) -> String {
    if let Some(at_pos) = dsn.find('@') {
        if let Some(colon_pos) = dsn[..at_pos].rfind(':') {
            if let Some(slash_pos) = dsn[..colon_pos].rfind('/') {
                let scheme_user = &dsn[..slash_pos + 2];
                if let Some(user_end) = dsn[slash_pos + 2..colon_pos].find(':') {
                    let user = &dsn[slash_pos + 2..slash_pos + 2 + user_end];
                    let host_onwards = &dsn[at_pos..];
                    return format!("{}{}:****{}", scheme_user, user, host_onwards);
                }
            }
        }
    }
    dsn.to_string()
}
