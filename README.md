# pgdoctor

A lightweight PostgreSQL monitoring agent written in Rust. Collects query statistics from `pg_stat_statements` and uploads them to a remote endpoint for analysis.

[![Release](https://img.shields.io/github/v/release/okumujustine/pgdoctor-cli-rust)](https://github.com/okumujustine/pgdoctor-cli-rust/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **Query Collection**: Captures top queries from `pg_stat_statements`
- **Multi-Database Support**: Monitor multiple PostgreSQL databases with one agent
- **Query Fingerprinting**: Normalizes queries for aggregation
- **Daemon Mode**: Run continuously with configurable intervals
- **Retry Logic**: Automatic retries with exponential backoff
- **Signal Handling**: Graceful shutdown on SIGINT/SIGTERM

## Quick Start

### Installation (macOS ARM64)

```bash
curl -LO https://github.com/okumujustine/pgdoctor-cli-rust/releases/latest/download/pgdoctor-macos-arm64.tar.gz
tar -xzf pgdoctor-macos-arm64.tar.gz
sudo mv pgdoctor /usr/local/bin/
```

### Setup

```bash
# 1. Generate config file
pgdoctor config init

# 2. Edit pgdoctor.yaml with your settings
#    - Add your database connection strings
#    - Add your API endpoint and token

# 3. Test connection
pgdoctor snapshot

# 4. Start monitoring
pgdoctor daemon start
```

## Commands

| Command | Description |
|---------|-------------|
| `snapshot` | Collect and print statistics as JSON |
| `upload` | Collect and upload to API |
| `daemon` | Run in foreground (Ctrl+C to stop) |
| `daemon start` | Start as background process |
| `daemon stop` | Stop background daemon |
| `daemon status` | Check daemon status |
| `daemon logs` | View daemon logs |
| `config init` | Generate sample config |
| `config show` | Show current configuration |
| `config path` | Show config file locations |
| `--version` | Print version |

## Configuration

Create a config file with `pgdoctor config init`, then edit `pgdoctor.yaml`:

```yaml
endpoint: "https://api.example.com/api/snapshots"
token: "your-api-token"
interval: 300  # default interval in seconds (30-3600)
limit: 20      # max queries per snapshot (1-200)

# Two scheduling modes available per database:
#   interval: continuous collection every N seconds
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
    dsn: "postgres://user:pass@prod:5432/app"
    interval: 60  # interval-based: every 60 seconds
    tags: ["production", "critical"]

  - name: "analytics"
    dsn: "postgres://user:pass@analytics:5432/app"
    cron: "0 */15 * * * * *"  # cron-based: every 15 minutes
    tags: ["analytics"]

  - name: "backup"
    dsn: "postgres://user:pass@backup:5432/app"
    cron: "0 0 2 * * * *"  # cron-based: daily at 2am
    tags: ["backup"]

  - name: "development"
    dsn: "postgres://localhost:5432/app_dev"
    enabled: false  # Skip this database (uses default interval when enabled)
```

### Schedule Modes

| Mode | Use Case | Example |
|------|----------|---------|
| `interval` | Real-time monitoring, continuous metrics | `interval: 60` (every 60s) |
| `cron` | Scheduled jobs, off-peak collection, cost control | `cron: "0 0 3 * * * *"` (daily at 3am) |

**Note:** Each database can use either `interval` or `cron`, but not both.

### Config File Search Order

1. `$PGDOCTOR_CONFIG` (environment variable)
2. `./pgdoctor.yaml` (current directory)
3. User config directory:
   - macOS: `~/Library/Application Support/pgdoctor/config.yaml`
   - Linux: `~/.config/pgdoctor/config.yaml`
   - Windows: `%APPDATA%\pgdoctor\config.yaml`
4. `/etc/pgdoctor/config.yaml` (system-wide, Unix only)

## Prerequisites

Enable `pg_stat_statements` in PostgreSQL:

```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

## Documentation

- [CLI Reference](docs/CLI.md) - All commands and options
- [Configuration Guide](docs/CONFIGURATION.md) - Detailed config options
- [Daemon Mode](docs/DAEMON.md) - Running as a service

## Example Output

```json
{
  "meta": {
    "db_name": "mydb",
    "db_version": "PostgreSQL 16.1"
  },
  "top_queries": [
    {
      "fingerprint": "a1b2c3d4",
      "normalized_query": "SELECT * FROM users WHERE id = ?",
      "calls": 1523,
      "total_exec_time_ms": 45.12,
      "mean_exec_time_ms": 0.029,
      "rows": 1523
    }
  ]
}
```

## Building from Source

Requirements:
- Rust 1.80+ (for `LazyLock`)

```bash
git clone https://github.com/okumujustine/pgdoctor-cli-rust.git
cd pgdoctor-cli-rust
cargo build --release
sudo cp target/release/pgdoctor /usr/local/bin/
```

## License

MIT
