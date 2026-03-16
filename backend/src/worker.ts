import { initializeDatabase, pool, query } from "./db";
import { ingestDocument } from "./services/indexer";
import { decryptCredentials, encryptCredentials } from "./utils/security";
import { getConnector, loadConnectors } from "./services/connectors/registry";

async function dispatchDueSyncs() {
  const result = await query<{ id: string; org_id: string }>(
    `SELECT id, org_id
     FROM connectors
     WHERE status != 'paused'
       AND credentials IS NOT NULL
       AND (
         last_synced_at IS NULL
         OR (last_synced_at + sync_frequency::interval) < now()
       )`
  );

  for (const connector of result.rows) {
    const running = await query<{ id: string }>(
      `SELECT id FROM sync_jobs
       WHERE connector_id = $1 AND status IN ('pending', 'running')
       LIMIT 1`,
      [connector.id]
    );
    if (running.rowCount) {
      continue;
    }
    await query(
      `INSERT INTO sync_jobs (connector_id, org_id, triggered_by, status)
       VALUES ($1, $2, 'scheduled', 'pending')`,
      [connector.id, connector.org_id]
    );
  }
}

async function processOnePendingJob() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const jobResult = await client.query<{
      id: string;
      connector_id: string;
      org_id: string;
    }>(
      `SELECT id, connector_id, org_id
       FROM sync_jobs
       WHERE status = 'pending'
       ORDER BY created_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1`
    );
    const job = jobResult.rows[0];
    if (!job) {
      await client.query("COMMIT");
      return false;
    }

    await client.query(
      `UPDATE sync_jobs
       SET status = 'running', started_at = now()
       WHERE id = $1`,
      [job.id]
    );
    await client.query("COMMIT");

    const connectorResult = await query<{
      id: string;
      org_id: string;
      kind: string;
      credentials: string | null;
      config: Record<string, unknown> | null;
    }>(
      `SELECT id, org_id, kind, credentials, config
       FROM connectors WHERE id = $1`,
      [job.connector_id]
    );
    const connectorModel = connectorResult.rows[0];
    if (!connectorModel) {
      await query(
        `UPDATE sync_jobs
         SET status = 'failed', error_message = 'Connector not found', finished_at = now()
         WHERE id = $1`,
        [job.id]
      );
      return true;
    }

    let credentials = connectorModel.credentials
      ? decryptCredentials(connectorModel.credentials)
      : {};
    const connector = getConnector({
      kind: connectorModel.kind,
      connectorId: connectorModel.id,
      orgId: connectorModel.org_id,
      credentials,
      config: connectorModel.config
    });

    let docsIndexed = 0;
    let docsSkipped = 0;
    let docsErrored = 0;

    try {
      const refreshed = await connector.refreshCredentials();
      if (refreshed) {
        credentials = refreshed;
      }

      let docsLimit = 20; // TODO: remove for production
      for await (const docMeta of connector.listDocuments()) {
        if (docsLimit-- <= 0) break;
        try {
          const content = await connector.fetchContent(
            docMeta.external_id,
            docMeta.metadata ?? {}
          );
          const ingestionClient = await pool.connect();
          try {
            await ingestionClient.query("BEGIN");
            const result = await ingestDocument(
              ingestionClient,
              { ...docMeta, content },
              connectorModel.org_id,
              connectorModel.id
            );
            await ingestionClient.query("COMMIT");
            if (result === "indexed") docsIndexed += 1;
            else docsSkipped += 1;
          } catch (error) {
            await ingestionClient.query("ROLLBACK");
            docsErrored += 1;
          } finally {
            ingestionClient.release();
          }
        } catch {
          docsErrored += 1;
        }
      }

      await query(
        `UPDATE connectors
         SET credentials = $2,
             last_synced_at = now(),
             status = 'idle',
             last_error = NULL,
             doc_count = $3
         WHERE id = $1`,
        [
          connectorModel.id,
          connectorModel.credentials ? encryptCredentials(credentials) : null,
          docsIndexed
        ]
      );
      await query(
        `UPDATE sync_jobs
         SET status = 'done',
             docs_indexed = $2,
             docs_skipped = $3,
             docs_errored = $4,
             finished_at = now()
         WHERE id = $1`,
        [job.id, docsIndexed, docsSkipped, docsErrored]
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown sync error";
      await query(
        `UPDATE connectors
         SET status = 'idle', last_error = $2
         WHERE id = $1`,
        [connectorModel.id, message]
      );
      await query(
        `UPDATE sync_jobs
         SET status = 'failed', error_message = $2, finished_at = now()
         WHERE id = $1`,
        [job.id, message]
      );
    }

    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function tick() {
  await dispatchDueSyncs();
  while (await processOnePendingJob()) {
    // Drain queue.
  }
}

async function main() {
  await initializeDatabase();
  await loadConnectors();
  while (true) {
    await tick();
    await new Promise((resolve) => setTimeout(resolve, 30_000));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
