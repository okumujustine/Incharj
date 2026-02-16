# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2024-01-15

### Added

#### Multi-Database Support
- YAML configuration file support for monitoring multiple databases
- Config file search order: `./pgdoctor.yaml`, `~/.config/pgdoctor/config.yaml`, `/etc/pgdoctor/config.yaml`
- Per-database interval and limit overrides
- Database tagging for organization
- Enable/disable individual databases

#### Config Commands
- `pgdoctor config init [path]` - Generate sample configuration file
- `pgdoctor config show` - Display current configuration
- `pgdoctor config path` - Show configuration file search paths

#### Daemon Improvements
- Multi-database daemon mode with individual schedules per database
- Enhanced logging with database names in multi-database mode
- Better error messages with setup instructions

#### Error Handling
- Retry logic with exponential backoff (1s, 2s, 4s) for uploads
- Specific handling for 401 (unauthorized), 403 (forbidden), and 5xx errors
- Timeout handling (30s) for API requests
- Graceful continue on individual database failures

#### Documentation
- Comprehensive CLI reference (`docs/CLI.md`)
- Configuration guide (`docs/CONFIGURATION.md`)
- Daemon mode documentation (`docs/DAEMON.md`)
- Updated README with new features

### Changed
- Version bumped to 0.2.0
- Updated help text to include config commands
- Improved error messages with actionable instructions

### Dependencies
- Added `serde_yaml` for YAML config parsing

## [0.1.0] - 2024-01-10

### Added

#### Core Functionality
- Database metadata collection
- `pg_stat_statements` query extraction
- Query normalization (replace literals with placeholders)
- Query fingerprinting (SHA-256 based)

#### Commands
- `pgdoctor snapshot` - Collect and print statistics as JSON
- `pgdoctor upload` - Collect and upload to API endpoint
- `pgdoctor daemon` - Run in foreground mode
- `pgdoctor daemon start/stop/status/logs` - Background daemon management

#### Daemon Mode
- Configurable interval (30-3600 seconds)
- Signal handling (SIGINT, SIGTERM)
- PID file tracking
- Log file with rotation support

#### Configuration
- Environment variable based configuration
- `.env` file support via dotenvy

### Technical Details
- Written in Rust 1.80+
- Async runtime with Tokio
- HTTP client with reqwest
- JSON serialization with serde

---

## Roadmap

### Phase A: Agent Core ✅
- [x] Collect database metadata
- [x] Query pg_stat_statements
- [x] Normalize and fingerprint queries
- [x] JSON output

### Phase B: Cloud Upload ✅
- [x] POST to authenticated endpoint
- [x] Handle 401/403/5xx errors
- [x] Request timeout (30s)
- [x] Retry with exponential backoff

### Phase C: Daemon Mode ✅
- [x] Configurable interval
- [x] Auto collect/upload
- [x] SIGINT/SIGTERM handling
- [x] Background execution
- [x] Status/logs commands

### Phase D: Enterprise Features ✅
- [x] Multi-database configuration
- [x] YAML config file support
- [x] Per-database settings
- [x] Database tagging

### Future Plans
- [ ] Linux (AMD64/ARM64) releases
- [ ] Windows support
- [ ] Prometheus metrics endpoint
- [ ] Query plan collection
- [ ] Alert thresholds
- [ ] Web dashboard integration
