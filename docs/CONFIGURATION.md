# PGDoctor Configuration Guide

PGDoctor supports two configuration modes:

1. **Environment Variables** - Simple setup for single database monitoring
2. **YAML Config File** - Enterprise setup for multi-database monitoring

## Quick Start

### Single Database (Environment Variables)

Set these environment variables in your shell profile (`~/.zshrc` or `~/.bashrc`):

```bash
export PGDOCTOR_DSN="postgres://user:password@localhost:5432/mydb"
export PGDOCTOR_ENDPOINT="https://api.example.com/api/snapshots"
export PGDOCTOR_TOKEN="your-api-token"
```

Then run:
```bash
pgdoctor daemon
```

### Multi-Database (Config File)

Generate a sample configuration:
```bash
pgdoctor config init
```

Edit `pgdoctor.yaml` with your settings, then run:
```bash
pgdoctor daemon
```

---

## Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PGDOCTOR_DSN` | PostgreSQL connection string | - | Yes (for snapshot/upload) |
| `PGDOCTOR_ENDPOINT` | API endpoint URL | - | Yes (for upload/daemon) |
| `PGDOCTOR_TOKEN` | API authentication token | - | Yes (for upload/daemon) |
| `PGDOCTOR_LIMIT` | Max queries to collect | 10 | No |
| `PGDOCTOR_INTERVAL` | Daemon interval (seconds) | 300 | No |
| `PGDOCTOR_CONFIG` | Path to config file | - | No |

### DSN Format

```
postgres://[user[:password]@][host][:port][/database][?params]
```

Examples:
```bash
# Local database
export PGDOCTOR_DSN="postgres://localhost:5432/mydb"

# With credentials
export PGDOCTOR_DSN="postgres://pguser:secret@db.example.com:5432/production"

# With SSL
export PGDOCTOR_DSN="postgres://user:pass@host:5432/db?sslmode=require"
```

### Interval Limits

- **Minimum**: 30 seconds
- **Maximum**: 3600 seconds (1 hour)
- **Default**: 300 seconds (5 minutes)

Values outside this range are automatically clamped.

### Query Limit

- **Minimum**: 1
- **Maximum**: 200
- **Default**: 10

---

## YAML Configuration File

### Config File Search Order

PGDoctor searches for configuration files in this order:

1. `$PGDOCTOR_CONFIG` (if set)
2. `./pgdoctor.yaml` (current directory)
3. `~/.config/pgdoctor/config.yaml` (user config on Linux)
4. `~/Library/Application Support/pgdoctor/config.yaml` (user config on macOS)
5. `/etc/pgdoctor/config.yaml` (system-wide, Unix only)

Use `pgdoctor config path` to see the actual paths on your system.

### File Structure

```yaml
# PGDoctor Configuration

# Global Settings
endpoint: "https://api.example.com/api/snapshots"
token: "your-api-token"
interval: 300  # Default interval for all databases
limit: 20      # Default query limit for all databases

# Databases to monitor
databases:
  - name: "production"
    dsn: "postgres://user:password@prod-host:5432/app_prod"
    interval: 60        # Override: check every 60s
    limit: 50           # Override: collect up to 50 queries
    tags: ["production", "critical"]

  - name: "staging"
    dsn: "postgres://user:password@staging-host:5432/app_staging"
    tags: ["staging"]
    # Uses global interval (300s) and limit (20)

  - name: "development"
    dsn: "postgres://localhost:5432/app_dev"
    tags: ["development"]
    enabled: false  # Disabled - won't be monitored
```

### Database Configuration Fields

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| `name` | string | Friendly name for this database | Yes |
| `dsn` | string | PostgreSQL connection string | Yes |
| `interval` | integer | Collection interval (seconds) | No |
| `limit` | integer | Max queries to collect | No |
| `tags` | array | Labels for categorization | No |
| `enabled` | boolean | Whether to monitor this DB | No (default: true) |

### Overrides

Per-database `interval` and `limit` override global settings:

```yaml
interval: 300  # Global default
limit: 20      # Global default

databases:
  - name: "critical-db"
    dsn: "..."
    interval: 30   # This DB checked every 30s
    limit: 100     # Collect up to 100 queries

  - name: "normal-db"
    dsn: "..."
    # Uses global: interval=300, limit=20
```

---

## Config Commands

### Generate Sample Config

```bash
# Create in current directory
pgdoctor config init

# Create at specific path
pgdoctor config init /etc/pgdoctor/config.yaml
```

### Show Current Configuration

```bash
pgdoctor config show
```

Example output (multi-database mode):
```
Configuration Source: YAML file

Global Settings:
  Endpoint: https://api.example.com/api/snapshots
  Token:    ****
  Interval: 300s
  Limit:    20

Databases (3 configured, 2 enabled):
  ✓ production (postgres://user:****@prod-host:5432/app_prod)
    Tags: production, critical
    Interval: 60s (override)
  ✓ staging (postgres://user:****@staging-host:5432/app_staging)
    Tags: staging
  ○ development (postgres://localhost:5432/app_dev)
    Tags: development
```

### Show Config File Paths

```bash
pgdoctor config path
```

---

## Best Practices

### Security

1. **Never commit config files with real credentials** to version control
2. Use environment variables or secrets management for production
3. Config files should have restricted permissions:
   ```bash
   chmod 600 pgdoctor.yaml
   ```

### Production Setup

For production monitoring, we recommend:

1. **Use system-wide config**: `/etc/pgdoctor/config.yaml`
2. **Run as a service**: Use `pgdoctor daemon start`
3. **Set appropriate intervals**:
   - Production: 30-60s
   - Staging: 60-300s
   - Development: 300-600s

### Multi-Environment Setup

```yaml
# Example: Different intervals by environment
databases:
  # Production - high frequency
  - name: "prod-primary"
    dsn: "postgres://...@prod-primary:5432/app"
    interval: 30
    tags: ["production", "primary"]
    
  - name: "prod-replica"
    dsn: "postgres://...@prod-replica:5432/app"
    interval: 60
    tags: ["production", "replica"]

  # Staging - medium frequency
  - name: "staging"
    dsn: "postgres://...@staging:5432/app"
    interval: 120
    tags: ["staging"]

  # Dev - low frequency, disabled by default
  - name: "development"
    dsn: "postgres://localhost:5432/app_dev"
    interval: 300
    tags: ["development"]
    enabled: false
```

---

## Troubleshooting

### Config Not Loading

Check which config is active:
```bash
pgdoctor config show
```

Verify search paths:
```bash
pgdoctor config path
```

### Invalid YAML

If your config file has syntax errors, PGDoctor will show the error:
```
error: failed to parse config file: ./pgdoctor.yaml
  caused by: expected ':', found ...
```

Use a YAML validator to check your file:
```bash
# Using Python
python -c "import yaml; yaml.safe_load(open('pgdoctor.yaml'))"
```

### Connection Issues

Test individual database connections:
```bash
# Temporarily use env vars for testing
export PGDOCTOR_DSN="postgres://user:pass@host:5432/db"
pgdoctor snapshot
```

### Permission Denied

Ensure your config file has correct permissions:
```bash
ls -la pgdoctor.yaml
# Should show your user as owner
```
