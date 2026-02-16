# PGDoctor CLI Reference

## Overview

PGDoctor is a lightweight PostgreSQL monitoring agent that collects query statistics from `pg_stat_statements` and uploads them to a remote endpoint for analysis.

## Installation

### macOS (Apple Silicon)

```bash
# Download latest release
curl -LO https://github.com/okumujustine/pgdoctor-cli-rust/releases/latest/download/pgdoctor-macos-arm64.tar.gz

# Extract
tar -xzf pgdoctor-macos-arm64.tar.gz

# Install to PATH
sudo mv pgdoctor /usr/local/bin/

# Verify
pgdoctor --version
```

### Build from Source

```bash
# Clone repository
git clone https://github.com/okumujustine/pgdoctor-cli-rust.git
cd pgdoctor-cli-rust

# Build release
cargo build --release

# Install
sudo cp target/release/pgdoctor /usr/local/bin/
```

## Commands

### snapshot

Collect database statistics and print as JSON.

```bash
pgdoctor snapshot
```

**Output:**
```json
{
  "hostname": "my-server.local",
  "collected_at": "2024-01-15T10:00:00.000Z",
  "queries": [
    {
      "query": "SELECT * FROM users WHERE id = $1",
      "normalized_query": "SELECT * FROM users WHERE id = ?",
      "fingerprint": "a1b2c3d4e5f6",
      "calls": 1523,
      "total_exec_time": 45.123,
      "mean_exec_time": 0.029,
      "rows": 1523
    }
  ]
}
```

**Requirements:**
- `PGDOCTOR_DSN` environment variable (or config file)

---

### upload

Collect statistics and upload to remote endpoint.

```bash
pgdoctor upload
```

**Output:**
```
uploaded snapshot: id=abc123 source_id=srv-001 received_at=2024-01-15T10:00:00Z
```

**Requirements:**
- `PGDOCTOR_DSN` - Database connection string
- `PGDOCTOR_ENDPOINT` - API endpoint URL
- `PGDOCTOR_TOKEN` - API authentication token

---

### daemon

Run as a long-lived process, collecting and uploading at regular intervals.

```bash
# Foreground mode
pgdoctor daemon

# Background mode
pgdoctor daemon start
pgdoctor daemon stop
pgdoctor daemon status
pgdoctor daemon logs [-f]
```

| Subcommand | Description |
|------------|-------------|
| (none) | Run in foreground, Ctrl+C to stop |
| `start` | Start as background process |
| `stop` | Stop background process |
| `status` | Check if daemon is running |
| `logs` | Show last 50 lines of log |
| `logs -f` | Follow log in real-time |

**See:** [DAEMON.md](DAEMON.md) for detailed documentation.

---

### config

Manage configuration files.

```bash
# Generate sample config
pgdoctor config init [path]

# Show current config
pgdoctor config show

# Show config search paths
pgdoctor config path
```

| Subcommand | Description |
|------------|-------------|
| `init [path]` | Generate sample `pgdoctor.yaml` |
| `show` | Display current configuration |
| `path` | Show config file search order |

**See:** [CONFIGURATION.md](CONFIGURATION.md) for detailed documentation.

---

### version

Print version information.

```bash
pgdoctor --version
pgdoctor -v
pgdoctor version
```

---

### help

Print usage information.

```bash
pgdoctor --help
pgdoctor -h
pgdoctor help
```

## Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PGDOCTOR_DSN` | PostgreSQL connection string | - | Yes* |
| `PGDOCTOR_ENDPOINT` | API endpoint URL | - | Yes* |
| `PGDOCTOR_TOKEN` | API authentication token | - | Yes* |
| `PGDOCTOR_LIMIT` | Max queries to collect | 10 | No |
| `PGDOCTOR_INTERVAL` | Daemon interval (seconds) | 300 | No |
| `PGDOCTOR_CONFIG` | Path to config file | - | No |

*Required for respective commands, can be provided via config file instead.

## Exit Codes

| Code | Description |
|------|-------------|
| 0 | Success |
| 1 | Runtime error (connection failed, upload failed, etc.) |
| 2 | Usage error (invalid command, missing arguments) |

## Examples

### Basic Usage

```bash
# One-time snapshot
export PGDOCTOR_DSN="postgres://localhost:5432/mydb"
pgdoctor snapshot

# Upload to API
export PGDOCTOR_ENDPOINT="https://api.example.com/snapshots"
export PGDOCTOR_TOKEN="secret-token"
pgdoctor upload

# Start monitoring daemon
pgdoctor daemon start
```

### Using .env File

Create `.env` in your working directory:
```bash
PGDOCTOR_DSN=postgres://user:pass@localhost:5432/mydb
PGDOCTOR_ENDPOINT=https://api.example.com/snapshots
PGDOCTOR_TOKEN=secret-token
PGDOCTOR_INTERVAL=60
```

Then run:
```bash
pgdoctor daemon
```

### Multi-Database Setup

```bash
# Generate config
pgdoctor config init

# Edit pgdoctor.yaml with multiple databases
# Then start daemon
pgdoctor daemon
```

### Scripted Snapshot Collection

```bash
#!/bin/bash
# collect-snapshot.sh

export PGDOCTOR_DSN="postgres://localhost:5432/mydb"

# Collect and save to file
pgdoctor snapshot > "snapshot-$(date +%Y%m%d-%H%M%S).json"
```

### CI/CD Integration

```yaml
# .github/workflows/db-check.yml
name: Database Health Check
on:
  schedule:
    - cron: '0 */6 * * *'

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - name: Install pgdoctor
        run: |
          curl -LO https://github.com/okumujustine/pgdoctor-cli-rust/releases/latest/download/pgdoctor-linux-amd64.tar.gz
          tar -xzf pgdoctor-linux-amd64.tar.gz
          sudo mv pgdoctor /usr/local/bin/

      - name: Collect snapshot
        env:
          PGDOCTOR_DSN: ${{ secrets.DATABASE_URL }}
          PGDOCTOR_ENDPOINT: ${{ secrets.PGDOCTOR_ENDPOINT }}
          PGDOCTOR_TOKEN: ${{ secrets.PGDOCTOR_TOKEN }}
        run: pgdoctor upload
```
