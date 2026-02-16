use anyhow::{Context, Result};
use chrono::Utc;
use cron::Schedule;
use std::fs;
use std::io::Write;
use std::process::Command;
use std::str::FromStr;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use pgdoctor::{collect, Config, ConfigFile, ScheduleMode, UploaderClient};

use super::paths::{log_file, pid_file};

const MAX_CONSECUTIVE_FAILURES: u32 = 10;

pub async fn run_daemon() -> Result<()> {
    let config_file = ConfigFile::load()?;
    config_file.validate()?;

    let enabled_databases = config_file.enabled_databases();
    let client = Arc::new(
        UploaderClient::new(config_file.endpoint.clone(), config_file.token.clone())
            .context("failed to create upload client")?,
    );

    let running = setup_signal_handler()?;

    println!(
        "pgdoctor daemon started ({} databases, parallel mode)",
        enabled_databases.len()
    );
    println!("Databases:");
    for db in &enabled_databases {
        println!(
            "  - {} ({})",
            db.name,
            db.schedule_display(config_file.interval)
        );
    }
    println!(
        "Circuit breaker: {} consecutive failures per database\n",
        MAX_CONSECUTIVE_FAILURES
    );
    println!("Press Ctrl+C to stop\n");

    let iteration = Arc::new(AtomicU64::new(0));
    let mut handles = Vec::new();

    for db in enabled_databases {
        let cfg = Config::from_database(db, &config_file);
        let client = Arc::clone(&client);
        let running = Arc::clone(&running);
        let iteration = Arc::clone(&iteration);
        let db_name = db.name.clone();
        let schedule_mode = db.schedule_mode();
        let interval = Duration::from_secs(db.interval.unwrap_or(config_file.interval));
        let cron_expr = db.cron.clone();

        let handle = tokio::spawn(async move {
            match schedule_mode {
                ScheduleMode::Interval => {
                    run_interval_loop(client, cfg, db_name, interval, running, iteration).await;
                }
                ScheduleMode::Cron => {
                    if let Some(expr) = cron_expr {
                        run_cron_loop(client, cfg, db_name, expr, running, iteration).await;
                    }
                }
            }
        });
        handles.push(handle);
    }

    for handle in handles {
        let _ = handle.await;
    }

    println!("Daemon stopped gracefully.");
    Ok(())
}

async fn run_interval_loop(
    client: Arc<UploaderClient>,
    cfg: Config,
    db_name: String,
    interval: Duration,
    running: Arc<AtomicBool>,
    iteration: Arc<AtomicU64>,
) {
    let mut consecutive_failures: u32 = 0;

    while running.load(Ordering::SeqCst) {
        let iter = iteration.fetch_add(1, Ordering::SeqCst) + 1;
        let success = collect_and_upload(&client, &cfg, &db_name, iter).await;

        if success {
            consecutive_failures = 0;
        } else {
            consecutive_failures += 1;
            if consecutive_failures >= MAX_CONSECUTIVE_FAILURES {
                eprintln!(
                    "[{}] Circuit breaker: {} consecutive failures, stopping this database.",
                    db_name, consecutive_failures
                );
                return;
            }
        }

        sleep_with_interrupt(interval, &running).await;
    }
}

async fn run_cron_loop(
    client: Arc<UploaderClient>,
    cfg: Config,
    db_name: String,
    cron_expr: String,
    running: Arc<AtomicBool>,
    iteration: Arc<AtomicU64>,
) {
    let schedule = match Schedule::from_str(&cron_expr) {
        Ok(s) => s,
        Err(e) => {
            eprintln!(
                "[{}] Invalid cron expression '{}': {}",
                db_name, cron_expr, e
            );
            return;
        }
    };

    let mut consecutive_failures: u32 = 0;

    while running.load(Ordering::SeqCst) {
        let now = Utc::now();
        let next = match schedule.upcoming(Utc).next() {
            Some(t) => t,
            None => {
                eprintln!("[{}] No upcoming cron schedule found", db_name);
                return;
            }
        };

        let wait_duration = (next - now).to_std().unwrap_or(Duration::from_secs(1));

        let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
        eprintln!(
            "[{}] [{}] Next run scheduled at {} (in {:?})",
            timestamp,
            db_name,
            next.format("%Y-%m-%d %H:%M:%S"),
            wait_duration
        );

        if !sleep_with_interrupt(wait_duration, &running).await {
            break;
        }

        let iter = iteration.fetch_add(1, Ordering::SeqCst) + 1;
        let success = collect_and_upload(&client, &cfg, &db_name, iter).await;

        if success {
            consecutive_failures = 0;
        } else {
            consecutive_failures += 1;
            if consecutive_failures >= MAX_CONSECUTIVE_FAILURES {
                eprintln!(
                    "[{}] Circuit breaker: {} consecutive failures, stopping this database.",
                    db_name, consecutive_failures
                );
                return;
            }
        }
    }
}

async fn sleep_with_interrupt(duration: Duration, running: &Arc<AtomicBool>) -> bool {
    let mut remaining = duration;
    let check_interval = Duration::from_secs(1);
    while remaining > Duration::ZERO && running.load(Ordering::SeqCst) {
        let sleep_time = remaining.min(check_interval);
        tokio::time::sleep(sleep_time).await;
        remaining = remaining.saturating_sub(sleep_time);
    }
    running.load(Ordering::SeqCst)
}

async fn collect_and_upload(
    client: &UploaderClient,
    cfg: &Config,
    db_name: &str,
    iteration: u64,
) -> bool {
    let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
    eprintln!(
        "[{}] [{}] Collecting #{}... ",
        timestamp, db_name, iteration
    );

    match collect(cfg).await {
        Ok(snap) => {
            match client
                .upload_snapshot_with_label(&snap, Some(db_name))
                .await
            {
                Ok(resp) => {
                    eprintln!("[{}] [{}] ✓ uploaded (id={})", timestamp, db_name, resp.id);
                    true
                }
                Err(e) => {
                    eprintln!("[{}] [{}] ✗ upload failed: {}", timestamp, db_name, e);
                    false
                }
            }
        }
        Err(e) => {
            eprintln!("[{}] [{}] ✗ collection failed: {}", timestamp, db_name, e);
            false
        }
    }
}

fn setup_signal_handler() -> Result<Arc<AtomicBool>> {
    let running = Arc::new(AtomicBool::new(true));
    let r = running.clone();

    ctrlc::set_handler(move || {
        eprintln!("\nReceived shutdown signal, stopping...");
        r.store(false, Ordering::SeqCst);
    })
    .context("failed to set signal handler")?;

    Ok(running)
}

pub fn start_daemon() -> Result<()> {
    if let Some(pid) = get_running_pid() {
        anyhow::bail!("Daemon is already running (PID: {})", pid);
    }

    let log_path = log_file();
    let pid_path = pid_file();

    if let Some(parent) = log_path.parent() {
        fs::create_dir_all(parent).ok();
    }
    if let Some(parent) = pid_path.parent() {
        fs::create_dir_all(parent).ok();
    }

    let exe = std::env::current_exe().context("failed to get executable path")?;

    let child = Command::new(&exe)
        .arg("daemon")
        .arg("--internal-run")
        .stdout(fs::File::create(&log_path).context("failed to create log file")?)
        .stderr(
            fs::File::options()
                .append(true)
                .open(&log_path)
                .unwrap_or_else(|_| fs::File::create(&log_path).unwrap()),
        )
        .spawn()
        .context("failed to start daemon process")?;

    let mut file = fs::File::create(&pid_path).context("failed to create PID file")?;
    writeln!(file, "{}", child.id()).context("failed to write PID")?;

    println!("Daemon started (PID: {})", child.id());
    println!("Log file: {}", log_path.display());
    Ok(())
}

pub fn stop_daemon() -> Result<()> {
    match get_running_pid() {
        Some(pid) => {
            #[cfg(unix)]
            Command::new("kill")
                .arg("-TERM")
                .arg(pid.to_string())
                .status()
                .context("failed to send stop signal")?;

            #[cfg(windows)]
            Command::new("taskkill")
                .args(["/PID", &pid.to_string(), "/F"])
                .status()
                .context("failed to stop daemon")?;

            fs::remove_file(pid_file()).ok();
            println!("Daemon stopped (PID: {})", pid);
            Ok(())
        }
        None => anyhow::bail!("Daemon is not running"),
    }
}

pub fn daemon_status() -> Result<()> {
    match get_running_pid() {
        Some(pid) => {
            println!("Daemon is running (PID: {})", pid);
            println!("Log file: {}", log_file().display());
        }
        None => println!("Daemon is not running"),
    }
    Ok(())
}

pub fn daemon_logs(follow: bool) -> Result<()> {
    let log_path = log_file();

    if !log_path.exists() {
        anyhow::bail!("No log file found at {}", log_path.display());
    }

    if follow {
        #[cfg(unix)]
        Command::new("tail")
            .args(["-f", log_path.to_str().unwrap()])
            .status()
            .context("failed to tail logs")?;

        #[cfg(windows)]
        Command::new("powershell")
            .args(["Get-Content", "-Wait", log_path.to_str().unwrap()])
            .status()
            .context("failed to tail logs")?;
    } else {
        let content = fs::read_to_string(&log_path).context("failed to read log file")?;
        let lines: Vec<&str> = content.lines().collect();
        let start = lines.len().saturating_sub(50);
        for line in &lines[start..] {
            println!("{}", line);
        }
    }
    Ok(())
}

fn get_running_pid() -> Option<u32> {
    let pid_path = pid_file();
    let pid: u32 = fs::read_to_string(&pid_path).ok()?.trim().parse().ok()?;

    if is_process_running(pid) {
        Some(pid)
    } else {
        fs::remove_file(&pid_path).ok();
        None
    }
}

fn is_process_running(pid: u32) -> bool {
    #[cfg(unix)]
    {
        Command::new("kill")
            .args(["-0", &pid.to_string()])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    #[cfg(windows)]
    {
        Command::new("tasklist")
            .args(["/FI", &format!("PID eq {}", pid)])
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).contains(&pid.to_string()))
            .unwrap_or(false)
    }
}
