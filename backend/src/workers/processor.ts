import { pool, query } from "../db";
import {
  SQL_COMPLETE_SYNC_JOB,
  SQL_FAIL_SYNC_JOB,
  SQL_FAIL_SYNC_JOB_CONNECTOR_NOT_FOUND,
  SQL_PICKUP_PENDING_JOB,
  SQL_SELECT_CONNECTOR_FOR_SYNC,
  SQL_START_SYNC_JOB,
} from "../sql/sync-jobs";
import { SQL_SET_CONNECTOR_ERROR } from "../sql/connectors";
import { runSync } from "./runner";

export async function processOnePendingJob(): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const jobResult = await client.query<{ id: string; connector_id: string; org_id: string }>(
      SQL_PICKUP_PENDING_JOB
    );
    const job = jobResult.rows[0];
    if (!job) {
      await client.query("COMMIT");
      return false;
    }

    await client.query(SQL_START_SYNC_JOB, [job.id]);
    await client.query("COMMIT");

    const connectorResult = await query<{
      id: string; org_id: string; kind: string;
      credentials: string | null; config: Record<string, unknown> | null; last_synced_at: string | null;
    }>(SQL_SELECT_CONNECTOR_FOR_SYNC, [job.connector_id]);
    const connectorModel = connectorResult.rows[0];

    if (!connectorModel) {
      await query(SQL_FAIL_SYNC_JOB_CONNECTOR_NOT_FOUND, [job.id]);
      return true;
    }

    try {
      const { docsIndexed, docsSkipped, docsErrored } = await runSync(connectorModel);
      await query(SQL_COMPLETE_SYNC_JOB, [job.id, docsIndexed, docsSkipped, docsErrored]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown sync error";
      await query(SQL_SET_CONNECTOR_ERROR, [connectorModel.id, message]);
      await query(SQL_FAIL_SYNC_JOB, [job.id, message]);
    }

    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
