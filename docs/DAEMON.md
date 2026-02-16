# PGDoctor Daemon Mode

PGDoctor can run as a long-lived daemon process that continuously collects database statistics and uploads them to your monitoring endpoint.

## Overview

The daemon mode:
- Runs continuously in foreground or background
- Collects snapshots at configurable intervals
- Supports multiple databases (with config file)
- Handles graceful shutdown on SIGINT/SIGTERM
- Provides status checking and log viewing

## Commands

| Command | Description |
|---------|-------------|
| `pgdoctor daemon` | Run in foreground (Ctrl+C to stop) |
| `pgdoctor daemon start` | Start in background |
| `pgdoctor daemon stop` | Stop background daemon |
| `pgdoctor daemon status` | Check if daemon is running |
| `pgdoctor daemon logs` | Show recent log output |
| `pgdoctor daemon logs -f` | Follow logs in real-time |

## Quick Start

### Foreground Mode

Run the daemon in your terminal:

```bash
pgdoctor daemon
```

Output:
```
pgdoctor daemon started (single-database mode, interval: 300s)
Press Ctrl+C to stop

[2024-01-15 10:00:00] Collecting snapshot #1... uploading... ✓ (id=abc123)
[2024-01-15 10:05:00] Collecting snapshot #2... uploading... ✓ (id=def456)
^C
Received shutdown signal, stopping...
Daemon stopped gracefully.
```

### Background Mode

Start the daemon as a background process:

```bash
pgdoctor daemon start
```

Output:
```
Daemon started (PID: 12345)
Log file: /Users/yourname/.local/state/pgdoctor.log
```

Check status:
```bash
pgdoctor daemon status
```

View logs:
```bash
pgdoctor daemon logs       # Last 50 lines
pgdoctor daemon logs -f    # Follow in real-time
```

Stop the daemon:
```bash
pgdoctor daemon stop
```

## Single vs Multi-Database Mode

### Single Database Mode (Environment Variables)

When no config file is found, daemon uses environment variables:

```bash
export PGDOCTOR_DSN="postgres://user:pass@localhost:5432/mydb"
export PGDOCTOR_ENDPOINT="https://api.example.com/api/snapshots"
export PGDOCTOR_TOKEN="your-token"
export PGDOCTOR_INTERVAL=60

pgdoctor daemon
```

Output:
```
pgdoctor daemon started (single-database mode, interval: 60s)
Press Ctrl+C to stop

[2024-01-15 10:00:00] Collecting snapshot #1... uploading... ✓ (id=abc123)
```

### Multi-Database Mode (Config File)

When a `pgdoctor.yaml` is found, daemon monitors multiple databases:

```yaml
# pgdoctor.yaml
endpoint: "https://api.example.com/api/snapshots"
token: "your-token"
interval: 300

databases:
  - name: "production"
    dsn: "postgres://user:pass@prod:5432/app"
    interval: 60

  - name: "staging"
    dsn: "postgres://user:pass@staging:5432/app"
    interval: 300
```

```bash
pgdoctor daemon
```

Output:
```
Loaded config from: ./pgdoctor.yaml
pgdoctor daemon started (multi-database mode, 2 databases)
Databases:
  - production (interval: 60s)
  - staging (interval: 300s)

Press Ctrl+C to stop

[2024-01-15 10:00:00] [production] Collecting #1... uploading... ✓ (id=abc123)
[2024-01-15 10:01:00] [production] Collecting #2... uploading... ✓ (id=def456)
[2024-01-15 10:01:00] [staging] Collecting #3... uploading... ✓ (id=ghi789)
```

Each database runs on its own schedule based on its configured interval.

## File Locations

### PID File

Stores the process ID when running in background:

| Platform | Location |
|----------|----------|
| macOS | `~/Library/Application Support/pgdoctor.pid` |
| Linux | `$XDG_RUNTIME_DIR/pgdoctor.pid` or `/tmp/pgdoctor.pid` |

### Log File

Captures stdout/stderr when running in background:

| Platform | Location |
|----------|----------|
| macOS | `~/Library/Application Support/pgdoctor.log` |
| Linux | `~/.local/state/pgdoctor.log` or `/tmp/pgdoctor.log` |

## Signal Handling

The daemon handles these signals gracefully:

| Signal | Action |
|--------|--------|
| `SIGINT` (Ctrl+C) | Graceful shutdown |
| `SIGTERM` | Graceful shutdown |

When receiving a shutdown signal, the daemon:
1. Stops accepting new collection cycles
2. Completes any in-progress uploads
3. Exits cleanly

## Error Handling

### Collection Errors

If snapshot collection fails, the daemon logs the error and continues:

```
[2024-01-15 10:00:00] [production] Collecting #1... ✗ collection failed: connection refused
```

Common collection errors:
- Database unreachable
- Invalid credentials
- Missing `pg_stat_statements` extension

### Upload Errors

If upload fails, the daemon logs the error and continues:

```
[2024-01-15 10:00:00] [production] Collecting #1... uploading... ✗ upload failed: 503 Service Unavailable
```

The uploader includes retry logic:
- 3 attempts with exponential backoff (1s, 2s, 4s)
- Logs each retry attempt

### Fatal Errors

These errors prevent the daemon from starting:
- Missing endpoint/token configuration
- Invalid config file syntax
- No enabled databases in config

## Running as a System Service

### macOS (launchd)

Create `~/Library/LaunchAgents/com.pgdoctor.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.pgdoctor</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/pgdoctor</string>
        <string>daemon</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/pgdoctor.stdout.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/pgdoctor.stderr.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PGDOCTOR_CONFIG</key>
        <string>/etc/pgdoctor/config.yaml</string>
    </dict>
</dict>
</plist>
```

Load the service:
```bash
launchctl load ~/Library/LaunchAgents/com.pgdoctor.plist
```

### Linux (systemd)

Create `/etc/systemd/system/pgdoctor.service`:

```ini
[Unit]
Description=PGDoctor Database Monitoring Agent
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/pgdoctor daemon
Restart=always
RestartSec=10
User=pgdoctor
Environment=PGDOCTOR_CONFIG=/etc/pgdoctor/config.yaml

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable pgdoctor
sudo systemctl start pgdoctor
```

Check status:
```bash
sudo systemctl status pgdoctor
sudo journalctl -u pgdoctor -f
```

## Best Practices

### Interval Selection

| Environment | Recommended Interval | Reason |
|-------------|---------------------|--------|
| Production (critical) | 30-60s | Quick detection of issues |
| Production (normal) | 60-120s | Balance of visibility and load |
| Staging | 120-300s | Sufficient for testing |
| Development | 300-600s | Low overhead |

### Resource Usage

The daemon is lightweight:
- ~10MB memory footprint
- Minimal CPU usage (brief spikes during collection)
- Network: small JSON payloads per collection

### Monitoring the Monitor

Consider alerting on:
- Daemon process not running
- No uploads for extended period
- Repeated upload failures

### High Availability

For critical monitoring:
1. Run daemon on multiple hosts
2. Use process supervisor (systemd, launchd)
3. Enable automatic restart on failure
