use anyhow::{Context, Result};
use tokio_postgres::Client;

use crate::collector::normalizer::{fingerprint, normalize_query};
use crate::models::QueryStat;

pub async fn collect_meta(client: &Client) -> Result<(String, String)> {
    let row = client
        .query_one("SELECT current_database()", &[])
        .await
        .context("failed to collect database name")?;
    let db_name: String = row.get(0);

    let row = client
        .query_one("SHOW server_version", &[])
        .await
        .context("failed to collect server version")?;
    let server_version: String = row.get(0);

    let db_version = format!("PostgreSQL {}", server_version.trim());

    Ok((db_name, db_version))
}

pub async fn has_pg_stat_statements(client: &Client) -> Result<bool> {
    let row = client
        .query_one(
            "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements')",
            &[],
        )
        .await
        .context("failed to check pg_stat_statements")?;

    Ok(row.get(0))
}

pub async fn collect_top_queries(client: &Client, limit: i32) -> Result<Vec<QueryStat>> {
    let rows = client
        .query(
            "SELECT query, calls, total_exec_time, mean_exec_time, rows
             FROM pg_stat_statements
             ORDER BY total_exec_time DESC
             LIMIT $1",
            &[&(limit as i64)],
        )
        .await
        .context("failed to query pg_stat_statements")?;

    let mut out = Vec::with_capacity(limit as usize);

    for row in rows {
        let query_text: String = row.get(0);
        let calls: i64 = row.get(1);
        let total_exec: f64 = row.get(2);
        let mean_exec: f64 = row.get(3);
        let rows_out: i64 = row.get(4);

        let norm = normalize_query(&query_text);
        let fp = fingerprint(&norm);

        out.push(QueryStat {
            fingerprint: fp,
            normalized_query: norm,
            calls,
            total_exec_time_ms: total_exec,
            mean_exec_time_ms: mean_exec,
            rows: rows_out,
        });
    }

    Ok(out)
}
