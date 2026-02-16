use anyhow::{Context, Result};
use reqwest::header;
use std::time::Duration;

use crate::models::{IngestResponse, Snapshot};

const DEFAULT_TIMEOUT_SECS: u64 = 30;
const MAX_RETRIES: u32 = 3;
const INITIAL_BACKOFF_MS: u64 = 1000;

pub struct Client {
    endpoint: String,
    token: String,
    http: reqwest::Client,
}

impl Client {
    pub fn new(endpoint: String, token: String) -> Result<Self> {
        Self::with_timeout(endpoint, token, DEFAULT_TIMEOUT_SECS)
    }

    pub fn with_timeout(endpoint: String, token: String, timeout_secs: u64) -> Result<Self> {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(timeout_secs))
            .build()
            .context("failed to build HTTP client")?;

        Ok(Self {
            endpoint,
            token,
            http,
        })
    }

    pub fn endpoint(&self) -> &str {
        &self.endpoint
    }

    pub async fn upload_snapshot(&self, snapshot: &Snapshot) -> Result<IngestResponse> {
        self.upload_snapshot_with_label(snapshot, None).await
    }

    pub async fn upload_snapshot_with_label(
        &self,
        snapshot: &Snapshot,
        label: Option<&str>,
    ) -> Result<IngestResponse> {
        let mut last_error = None;
        let prefix = label.map(|l| format!("[{}] ", l)).unwrap_or_default();

        for attempt in 0..=MAX_RETRIES {
            if attempt > 0 {
                let backoff = INITIAL_BACKOFF_MS * 2_u64.pow(attempt - 1);
                eprintln!("{}Retry attempt {} after {}ms...", prefix, attempt, backoff);
                tokio::time::sleep(Duration::from_millis(backoff)).await;
            }

            match self.do_upload(snapshot).await {
                Ok(response) => return Ok(response),
                Err(e) => {
                    // Don't retry on authentication errors
                    if e.to_string().contains("401") || e.to_string().contains("Unauthorized") {
                        return Err(e);
                    }

                    // Don't retry on client errors (4xx except 401, 408, 429)
                    if e.to_string().contains("status=4")
                        && !e.to_string().contains("408")
                        && !e.to_string().contains("429")
                    {
                        return Err(e);
                    }

                    last_error = Some(e);
                }
            }
        }

        Err(last_error
            .unwrap_or_else(|| anyhow::anyhow!("upload failed after {} retries", MAX_RETRIES)))
    }

    async fn do_upload(&self, snapshot: &Snapshot) -> Result<IngestResponse> {
        let response = self
            .http
            .post(&self.endpoint)
            .header(header::CONTENT_TYPE, "application/json")
            .bearer_auth(&self.token)
            .json(snapshot)
            .send()
            .await
            .context("failed to connect to server (check your network or endpoint URL)")?;

        let status = response.status();

        // Handle specific status codes
        if status.as_u16() == 401 {
            anyhow::bail!("Authentication failed (401 Unauthorized)");
        }

        if status.as_u16() == 403 {
            anyhow::bail!("Access forbidden (403 Forbidden)");
        }

        if status.is_server_error() {
            anyhow::bail!("Server error (status={})", status);
        }

        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            anyhow::bail!("Upload failed (status={}): {}", status, body);
        }

        response
            .json::<IngestResponse>()
            .await
            .context("failed to decode server response")
    }
}
