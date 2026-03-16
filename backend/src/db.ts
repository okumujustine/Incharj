import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { config } from "./config";
import { DDL_EXTENSIONS, DDL_INITIALIZE } from "./sql/schema";

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 20
});

type Db = Pool | PoolClient;

export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = [],
  db: Db = pool
) {
  return db.query<T>(sql, params);
}

export async function withTransaction<T>(
  handler: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await handler(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function initializeDatabase(): Promise<void> {
  for (const ext of DDL_EXTENSIONS) {
    try {
      await pool.query(`CREATE EXTENSION IF NOT EXISTS "${ext}"`);
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code !== "23505" && code !== "42710") throw err;
      // 23505 = duplicate key, 42710 = already exists — safe to ignore
    }
  }
  await pool.query(DDL_INITIALIZE);
}
