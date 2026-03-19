import { query } from "../db";
import {
  SQL_CHECK_CONNECTOR_ACTIVE_JOB,
  SQL_DISPATCH_DUE_CONNECTORS,
  SQL_INSERT_SCHEDULED_JOB,
} from "../sql/sync-jobs";
import { syncQueue } from "./queue";

export async function dispatchDueSyncs(): Promise<void> {
  const result = await query<{ id: string; org_id: string }>(SQL_DISPATCH_DUE_CONNECTORS);
  for (const connector of result.rows) {
    const running = await query<{ id: string }>(SQL_CHECK_CONNECTOR_ACTIVE_JOB, [connector.id]);
    if (running.rowCount) continue;
    const jobResult = await query<{ id: string }>(SQL_INSERT_SCHEDULED_JOB, [connector.id, connector.org_id]);
    const syncJobId = jobResult.rows[0].id;
    await syncQueue.add("sync-enumerate", { syncJobId, connectorId: connector.id }, {
      jobId: `sync-enumerate-${syncJobId}`,
    });
  }
}
