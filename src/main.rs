use std::env;
use std::process;

mod cli;

#[tokio::main]
async fn main() {
    let args: Vec<String> = env::args().collect();

    if args.len() < 2 {
        cli::print_usage();
        process::exit(2);
    }

    let result = match args[1].as_str() {
        "snapshot" => cli::run_snapshot().await,
        "upload" => cli::run_upload().await,
        "daemon" => handle_daemon(&args).await,
        "config" => handle_config(&args),
        "--version" | "-v" | "version" => {
            cli::print_version();
            return;
        }
        "--help" | "-h" | "help" => {
            cli::print_usage();
            return;
        }
        cmd => {
            eprintln!("unknown command: {}", cmd);
            cli::print_usage();
            process::exit(2);
        }
    };

    if let Err(e) = result {
        eprintln!("error: {}", e);
        process::exit(1);
    }
}

async fn handle_daemon(args: &[String]) -> anyhow::Result<()> {
    match args.get(2).map(|s| s.as_str()) {
        Some("start") => cli::start_daemon(),
        Some("stop") => cli::stop_daemon(),
        Some("status") => cli::daemon_status(),
        Some("logs") => {
            let follow = args
                .get(3)
                .map(|s| s == "-f" || s == "--follow")
                .unwrap_or(false);
            cli::daemon_logs(follow)
        }
        Some("--internal-run") | None => cli::run_daemon().await,
        Some(cmd) => {
            eprintln!("unknown daemon subcommand: {}", cmd);
            eprintln!("usage: pgdoctor daemon [start|stop|status|logs]");
            process::exit(2);
        }
    }
}

fn handle_config(args: &[String]) -> anyhow::Result<()> {
    match args.get(2).map(|s| s.as_str()) {
        Some("init") => cli::config_init(args.get(3).map(|s| s.as_str())),
        Some("show") => cli::config_show(),
        Some("path") => cli::config_path(),
        None => {
            eprintln!("usage: pgdoctor config <subcommand>\n");
            eprintln!("Subcommands:");
            eprintln!("  init [path]  Generate sample config file");
            eprintln!("  show         Show current configuration");
            eprintln!("  path         Show configuration file search paths");
            process::exit(2);
        }
        Some(cmd) => {
            eprintln!("unknown config subcommand: {}", cmd);
            process::exit(2);
        }
    }
}
