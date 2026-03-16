import { pool, query } from "../db";
import { ingestDocument } from "../services/indexer";
import { getConnector } from "../connectors/registry";
import { decryptCredentials, encryptCredentials } from "../utils/security";
import { SQL_UPDATE_CONNECTOR_AFTER_SYNC } from "../sql/connectors";
import { SQL_COUNT_CONNECTOR_DOCS } from "../sql/sync-jobs";
import type { ConnectorModel, RunResult } from "../types/connector";

export async function runSync(connectorModel: ConnectorModel): Promise<RunResult> {
  let credentials = connectorModel.credentials
    ? decryptCredentials(connectorModel.credentials)
    : {};

  const connector = getConnector({
    kind: connectorModel.kind,
    connectorId: connectorModel.id,
    orgId: connectorModel.org_id,
    credentials,
    config: {
      ...connectorModel.config,
      last_synced_at: connectorModel.last_synced_at ?? undefined,
    },
  });

  const refreshed = await connector.refreshCredentials();
  if (refreshed) credentials = refreshed;

  let docsIndexed = 0;
  let docsSkipped = 0;
  let docsErrored = 0;

  let docsLimit = 20; // TODO: remove for production
  for await (const docMeta of connector.listDocuments()) {
    if (docsLimit-- <= 0) break;
    try {
      const content = await connector.fetchContent(docMeta.external_id, docMeta.metadata ?? {});
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
      } catch {
        await ingestionClient.query("ROLLBACK");
        docsErrored += 1;
      } finally {
        ingestionClient.release();
      }
    } catch {
      docsErrored += 1;
    }
  }

  const totalDocsResult = await query<{ count: string }>(SQL_COUNT_CONNECTOR_DOCS, [connectorModel.id]);
  const totalDocs = parseInt(totalDocsResult.rows[0]?.count ?? "0", 10);

  await query(SQL_UPDATE_CONNECTOR_AFTER_SYNC, [
    connectorModel.id,
    connectorModel.credentials ? encryptCredentials(credentials) : null,
    totalDocs,
  ]);

  return { docsIndexed, docsSkipped, docsErrored };
}
