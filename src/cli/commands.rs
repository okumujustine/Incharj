use anyhow::{Context, Result};
use pgdoctor::{collect, Config, ConfigFile, UploaderClient};

use super::VERSION;

pub fn print_version() {
    println!("pgdoctor {}", VERSION);
}

pub fn print_usage() {
    eprintln!(
        r#"usage: pgdoctor <command>

Commands:
  snapshot        Collect and print database statistics as JSON
  upload          Collect and upload database statistics to remote endpoint
  daemon          Run daemon in foreground
  daemon start    Start daemon in background
  daemon stop     Stop background daemon
  daemon status   Check daemon status
  daemon logs     Show daemon logs
  config init     Generate sample configuration file
  config show     Show current configuration
  config path     Show configuration file paths
  --version       Print version information

Configuration:
  Config file: pgdoctor.yaml (see 'pgdoctor config init')
  
  Set PGDOCTOR_CONFIG to specify a custom config file path."#
    );
}

pub async fn run_snapshot() -> Result<()> {
    let config_file = ConfigFile::load()?;
    let databases = config_file.enabled_databases();

    if databases.is_empty() {
        anyhow::bail!("No enabled databases in config.");
    }

    for db in databases {
        let cfg = Config::from_database(db, &config_file);
        let snap = collect(&cfg).await?;
        let out = serde_json::to_string_pretty(&snap).context("failed to serialize snapshot")?;
        println!("--- {} ---", db.name);
        println!("{}", out);
    }
    Ok(())
}

pub async fn run_upload() -> Result<()> {
    let config_file = ConfigFile::load()?;
    config_file.validate()?;

    let client = UploaderClient::new(config_file.endpoint.clone(), config_file.token.clone())
        .context("failed to create upload client")?;

    for db in config_file.enabled_databases() {
        let cfg = Config::from_database(db, &config_file);
        let snap = collect(&cfg).await?;
        let resp = client.upload_snapshot(&snap).await?;
        println!(
            "[{}] uploaded: id={} source_id={} received_at={}",
            db.name, resp.id, resp.source_id, resp.received_at
        );
    }
    Ok(())
}
