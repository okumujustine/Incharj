# Workers

The background worker is a separate Node.js process (`npm run worker` → `tsx src/workers/index.ts`). It shares the same PostgreSQL pool as the API but runs completely independently.

## Module layout

```
workers/
├── index.ts       — tick() + main() poll loop
├── scheduler.ts   — dispatchDueSyncs()
├── processor.ts   — processOnePendingJob()
└── runner.ts      — runSync(connectorModel)
```

---

## Lifecycle

```
main()
  ├─ initializeDatabase()    // idempotent DDL
  ├─ loadConnectors()        // registers connector classes
  └─ loop every 30 s:
       tick()
         ├─ dispatchDueSyncs()      → inserts pending sync_jobs rows
         └─ while processOnePendingJob():
               pick job (FOR UPDATE SKIP LOCKED)
               mark running
               runSync(connector)
               mark done / failed
```

---

## `scheduler.ts` — `dispatchDueSyncs()`

Queries for connectors that are due:

```sql
-- SQL_DISPATCH_DUE_CONNECTORS (simplified)
SELECT id, org_id FROM connectors
WHERE status NOT IN ('paused', 'error')
  AND last_synced_at + sync_frequency::interval < now()
   OR last_synced_at IS NULL
```

For each due connector, checks whether an active job already exists (`SQL_CHECK_CONNECTOR_ACTIVE_JOB`). If not, inserts a `pending` row into `sync_jobs` (`SQL_INSERT_SCHEDULED_JOB`). This prevents duplicate jobs without any locking.

---

## `processor.ts` — `processOnePendingJob()`

1. Opens a connection, begins a transaction.
2. Runs `SQL_PICKUP_PENDING_JOB` — `SELECT … FOR UPDATE SKIP LOCKED LIMIT 1` — so multiple worker replicas can run safely without picking the same job.
3. Marks the job `running` (`SQL_START_SYNC_JOB`) and commits.
4. Loads the connector row (`SQL_SELECT_CONNECTOR_FOR_SYNC`).
5. Calls `runSync(connectorModel)`.
6. On success: `SQL_COMPLETE_SYNC_JOB` (status → `done`, sets doc counts).
7. On error: `SQL_FAIL_SYNC_JOB` + `SQL_SET_CONNECTOR_ERROR` (records error message on connector).

Returns `true` if a job was processed, `false` if the queue was empty (so the caller can stop the inner loop).

---

## `runner.ts` — `runSync(connectorModel)`

1. Decrypts credentials.
2. Instantiates the connector via `getConnector()`, passing `last_synced_at` in the config so the connector can filter incrementally.
3. Calls `connector.refreshCredentials()` — if the provider returns updated tokens (e.g. Google access token refresh), updates `credentials` in memory.
4. Iterates `connector.listDocuments()` — an async generator that yields `ConnectorDocument` objects.
5. For each document:
   - Calls `connector.fetchContent(externalId, metadata)` to get full text.
   - Acquires a new pool connection, runs `ingestDocument()` in its own `BEGIN / COMMIT` transaction.
   - On error: rolls back and increments `docsErrored` — does **not** abort the rest of the sync.
6. After all documents: queries `SELECT count(*) FROM documents WHERE connector_id = $1` for the true total (not just the delta), then updates `connectors.doc_count` and `last_synced_at`.

Returns `{ docsIndexed, docsSkipped, docsErrored }`.

---

## Adding a second worker replica

Because job pickup uses `FOR UPDATE SKIP LOCKED`, you can run multiple worker processes against the same database safely. Each will pick a different job. No additional coordination is needed.

---

## Replacing the queue mechanism

The entire scheduling/pickup strategy is isolated to `scheduler.ts` and `processor.ts`. To swap in Redis + BullMQ or another broker:

1. Replace `dispatchDueSyncs()` in `scheduler.ts` with code that pushes jobs onto the queue.
2. Replace `processOnePendingJob()` in `processor.ts` with a queue consumer.
3. `runner.ts` and `services/indexer.ts` stay unchanged.
