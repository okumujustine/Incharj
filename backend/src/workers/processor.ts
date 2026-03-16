import { query } from "../db";
import {
  SQL_COMPLETE_SYNC_JOB,
  SQL_FAIL_SYNC_JOB,
  SQL_FAIL_SYNC_JOB_CONNECTOR_NOT_FOUND,
  SQL_SELECT_CONNECTOR_FOR_SYNC,
  SQL_START_SYNC_JOB,
} from "../sql/sync-jobs";
import { SQL_SET_CONNECTOR_ERROR } from "../sql/connectors";
import { runSync } from "./runner";

export async function processSyncJob(syncJobId: string, connectorId: string): Promise<void> {
  await query(SQL_START_SYNC_JOB, [syncJobId]);

  const connectorResult = await query<{
    id: string; org_id: string; kind: string;
    credentials: string | null; config: Record<string, unknown> | null; last_synced_at: string | null;
  }>(SQL_SELECT_CONNECTOR_FOR_SYNC, [connectorId]);
  const connectorModel = connectorResult.rows[0];

  if (!connectorModel) {
    await query(SQL_FAIL_SYNC_JOB_CONNECTOR_NOT_FOUND, [syncJobId]);
    return;
  }

  try {
    const { docsIndexed, docsSkipped, docsErrored } = await runSync(connectorModel);
    await query(SQL_COMPLETE_SYNC_JOB, [syncJobId, docsIndexed, docsSkipped, docsErrored]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync error";
    await query(SQL_SET_CONNECTOR_ERROR, [connectorModel.id, message]);
    await query(SQL_FAIL_SYNC_JOB, [syncJobId, message]);
    throw error; // re-throw so BullMQ records the failure and can retry
  }
}
