export const SQL_SELECT_CONNECTOR_CHECKPOINT = `
  SELECT checkpoint
  FROM connector_sync_state
  WHERE connector_id = $1
`;

export const SQL_UPSERT_CONNECTOR_CHECKPOINT = `
  INSERT INTO connector_sync_state (connector_id, org_id, checkpoint, last_sync_job_id, updated_at)
  VALUES ($1, $2, $3, $4, now())
  ON CONFLICT (connector_id) DO UPDATE SET
    checkpoint = EXCLUDED.checkpoint,
    last_sync_job_id = EXCLUDED.last_sync_job_id,
    updated_at = now()
`;
