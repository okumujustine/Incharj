export const SYNC_JOB_FIELDS = `
  id, connector_id, org_id, triggered_by, status, started_at, finished_at,
  docs_enqueued, docs_processed, docs_indexed, docs_skipped, docs_errored,
  error_message, meta, created_at
`;

export const SQL_INSERT_SYNC_JOB = `
  INSERT INTO sync_jobs (connector_id, org_id, triggered_by, status)
  VALUES ($1, $2, $3, 'pending')
  RETURNING ${SYNC_JOB_FIELDS}
`;

export const SQL_SELECT_SYNC_JOBS_BY_ORG = `
  SELECT ${SYNC_JOB_FIELDS}
  FROM sync_jobs
  WHERE org_id = $1
  ORDER BY created_at DESC
  LIMIT $2 OFFSET $3
`;

export const SQL_SELECT_SYNC_JOB_BY_ID = `
  SELECT ${SYNC_JOB_FIELDS}
  FROM sync_jobs
  WHERE id = $1 AND org_id = $2
`;

export const SQL_SELECT_SYNC_JOB_STREAM = `
  SELECT id, status, docs_enqueued, docs_processed, docs_indexed, docs_skipped, docs_errored,
         error_message, started_at, finished_at
  FROM sync_jobs
  WHERE id = $1 AND org_id = $2
`;

export const SQL_COUNT_CONNECTOR_DOCS = `
  SELECT count(*)::text AS count FROM documents WHERE connector_id = $1
`;

export function buildSyncJobsListSql(hasConnectorFilter: boolean, limitParam: number, offsetParam: number): string {
  const connectorFilter = hasConnectorFilter ? ` AND connector_id = $2` : "";
  return `
    SELECT id, connector_id, org_id, triggered_by, status, started_at, finished_at,
           docs_enqueued, docs_processed, docs_indexed, docs_skipped, docs_errored,
           error_message, meta, created_at
    FROM sync_jobs
    WHERE org_id = $1${connectorFilter}
    ORDER BY created_at DESC
    LIMIT $${limitParam} OFFSET $${offsetParam}
  `;
}

export const SQL_PICKUP_PENDING_JOB = `
  SELECT id, connector_id, org_id
  FROM sync_jobs
  WHERE status = 'pending'
  ORDER BY created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1
`;

export const SQL_START_SYNC_JOB = `
  UPDATE sync_jobs
  SET status = 'running', started_at = now(), error_message = NULL
  WHERE id = $1
`;

export const SQL_SET_SYNC_JOB_ENQUEUED = `
  UPDATE sync_jobs
  SET docs_enqueued = $2,
      docs_processed = 0,
      docs_indexed = 0,
      docs_skipped = 0,
      docs_errored = 0,
      meta = jsonb_set(
        coalesce(meta, '{}'::jsonb) || coalesce($4::jsonb, '{}'::jsonb),
        '{checkpoint}',
        coalesce($3::jsonb, 'null'::jsonb),
        true
      )
  WHERE id = $1
`;

export const SQL_INCREMENT_SYNC_JOB_DOC_RESULT = `
  UPDATE sync_jobs
  SET docs_processed = docs_processed + 1,
      docs_indexed = docs_indexed + $2,
      docs_skipped = docs_skipped + $3,
      docs_errored = docs_errored + $4
  WHERE id = $1
`;

export const SQL_SELECT_SYNC_JOB_PROGRESS = `
  SELECT id, status, docs_enqueued, docs_processed, docs_indexed, docs_skipped, docs_errored
  FROM sync_jobs
  WHERE id = $1
`;

export const SQL_COMPLETE_SYNC_JOB_IF_FINISHED = `
  UPDATE sync_jobs
  SET status = 'done',
      finished_at = now(),
      error_message = NULL
  WHERE id = $1
    AND status = 'running'
    AND docs_processed >= docs_enqueued
`;

export const SQL_COMPLETE_SYNC_JOB = `
  UPDATE sync_jobs
  SET status = 'done',
      docs_indexed = $2,
      docs_skipped = $3,
      docs_errored = $4,
      docs_processed = $2 + $3 + $4,
      docs_enqueued = $2 + $3 + $4,
      finished_at = now()
  WHERE id = $1
`;

export const SQL_FAIL_SYNC_JOB = `
  UPDATE sync_jobs
  SET status = 'failed', error_message = $2, finished_at = now()
  WHERE id = $1
`;

export const SQL_FAIL_SYNC_JOB_CONNECTOR_NOT_FOUND = `
  UPDATE sync_jobs
  SET status = 'failed', error_message = 'Connector not found', finished_at = now()
  WHERE id = $1
`;

export const SQL_SELECT_CONNECTOR_FOR_SYNC = `
  SELECT id, org_id, kind, credentials, config, last_synced_at, sync_cursor
  FROM connectors WHERE id = $1
`;

export const SQL_DISPATCH_DUE_CONNECTORS = `
  SELECT id, org_id
  FROM connectors
  WHERE status != 'paused'
    AND credentials IS NOT NULL
    AND (
      last_synced_at IS NULL
      OR (last_synced_at + sync_frequency::interval) < now()
    )
`;

export const SQL_CHECK_CONNECTOR_ACTIVE_JOB = `
  SELECT id FROM sync_jobs
  WHERE connector_id = $1 AND status IN ('pending', 'running')
  LIMIT 1
`;

export const SQL_INSERT_SCHEDULED_JOB = `
  INSERT INTO sync_jobs (connector_id, org_id, triggered_by, status)
  VALUES ($1, $2, 'scheduled', 'pending')
  RETURNING id
`;
