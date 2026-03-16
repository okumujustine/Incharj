import { query } from "../db";
import { NotFoundError } from "../errors";

export const CONNECTOR_FIELDS = `
  id, org_id, created_by, kind, name, status, credentials, config,
  sync_cursor, last_synced_at, last_error, sync_frequency, doc_count, created_at
`;

export const SQL_SELECT_CONNECTOR_BY_ID = `
  SELECT ${CONNECTOR_FIELDS}
  FROM connectors
  WHERE id = $1 AND org_id = $2
`;

export const SQL_SELECT_CONNECTORS_BY_ORG = `
  SELECT ${CONNECTOR_FIELDS}
  FROM connectors
  WHERE org_id = $1
  ORDER BY created_at DESC
`;

export const SQL_INSERT_CONNECTOR = `
  INSERT INTO connectors (org_id, created_by, kind, name, status, config, sync_frequency)
  VALUES ($1, $2, $3, $4, 'idle', $5, $6)
  RETURNING ${CONNECTOR_FIELDS}
`;

export const SQL_DELETE_CONNECTOR = `
  DELETE FROM connectors WHERE id = $1 AND org_id = $2 RETURNING id
`;

export const SQL_PAUSE_CONNECTOR = `
  UPDATE connectors SET status = 'paused', updated_at = now()
  WHERE id = $1 AND org_id = $2
  RETURNING ${CONNECTOR_FIELDS}
`;

export const SQL_RESUME_CONNECTOR = `
  UPDATE connectors SET status = 'idle', updated_at = now()
  WHERE id = $1 AND org_id = $2
  RETURNING ${CONNECTOR_FIELDS}
`;

export const SQL_UPDATE_CONNECTOR_CREDENTIALS = `
  UPDATE connectors
  SET credentials = $3, status = 'idle', updated_at = now()
  WHERE id = $1 AND org_id = $2
  RETURNING ${CONNECTOR_FIELDS}
`;

export const SQL_UPDATE_CONNECTOR_AFTER_SYNC = `
  UPDATE connectors
  SET credentials = $2,
      last_synced_at = now(),
      status = 'idle',
      last_error = NULL,
      doc_count = $3
  WHERE id = $1
`;

export const SQL_SET_CONNECTOR_ERROR = `
  UPDATE connectors SET status = 'idle', last_error = $2 WHERE id = $1
`;

export function buildUpdateConnectorSql(sets: string[]): string {
  return `
    UPDATE connectors
    SET ${sets.join(", ")}, updated_at = now()
    WHERE id = $1 AND org_id = $2
    RETURNING ${CONNECTOR_FIELDS}
  `;
}

export async function getConnectorOr404(connectorId: string, orgId: string) {
  const result = await query(SQL_SELECT_CONNECTOR_BY_ID, [connectorId, orgId]);
  const connector = result.rows[0];
  if (!connector) throw new NotFoundError("Connector not found");
  return connector;
}
