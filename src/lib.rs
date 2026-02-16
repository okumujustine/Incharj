//! PGDoctor CLI - PostgreSQL diagnostics collector
//!
//! This library provides functionality to collect PostgreSQL database statistics
//! and upload them to a remote endpoint for analysis.
//!
//! ## Features
//! - Collect database metadata and performance statistics
//! - Query `pg_stat_statements` for top queries by execution time
//! - Upload snapshots to a remote API endpoint
//! - Query normalization and fingerprinting
//! - Multi-database monitoring via YAML config
//! - Daemon mode with background execution

pub mod collector;
pub mod config;
pub mod db;
pub mod models;
pub mod uploader;

// Re-export commonly used types for convenience
pub use collector::collect;
pub use config::{Config, ConfigFile, DatabaseConfig, ScheduleMode};
pub use models::{IngestResponse, Meta, QueryStat, Snapshot};
pub use uploader::Client as UploaderClient;
