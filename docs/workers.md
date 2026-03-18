# Workers

The background worker is a separate Node.js process (`npm run worker` → `tsx src/workers/index.ts`). It shares the same PostgreSQL pool as the API but runs independently, consuming jobs from a **BullMQ** queue backed by Redis.

## Module layout

```
workers/
├── index.ts       — BullMQ Worker setup, job routing, startup
├── scheduler.ts   — dispatchDueSyncs() — finds due connectors, enqueues sync jobs
├── processor.ts   — per-job handler — marks job running/done/failed in DB
└── runner.ts      — runSync(connectorModel) — drives the actual sync
```

---

## Lifecycle

```
main() in index.ts
  ├─ initializeDatabase()      // idempotent DDL (CREATE TABLE IF NOT EXISTS, indexes)
  ├─ loadConnectors()          // registers connector classes in the registry
  ├─ BullMQ Worker(queue, handler, { concurrency: 1 })
  │     routes job.name:
  │       "dispatch" → dispatchDueSyncs()
  │       "sync"     → processJob(job.data)
  └─ BullMQ Queue.upsertJobScheduler(
         "dispatch", { every: 30_000 }    // repeating dispatch every 30s
     )
```

On startup the worker also resets any `sync_jobs` rows that were left `running` from a previous crash back to `failed`.

---

## `scheduler.ts` — `dispatchDueSyncs()`

Finds connectors that are due for a sync:

```sql
SELECT id, org_id FROM connectors
WHERE status NOT IN ('paused', 'error')
  AND credentials IS NOT NULL
  AND (
    last_synced_at IS NULL
    OR last_synced_at + sync_frequency::interval < now()
  )
```

For each due connector it checks whether a BullMQ job already exists for that connector (to avoid duplicates). If not, it:
1. Inserts a `pending` row into `sync_jobs`.
2. Enqueues a `"sync"` job into BullMQ with `{ syncJobId, connectorId }` as the payload.

---

## `processor.ts` — `processJob(data)`

1. Loads the `sync_jobs` row and marks it `running`.
2. Loads the connector row from the database.
3. Calls `runSync(connectorModel)`.
4. On success: marks job `done`, updates `docs_indexed / docs_skipped / docs_errored`.
5. On error: marks job `failed`, stores the error message on both the `sync_jobs` row and the connector row.
6. Re-throws on failure so BullMQ can record the job as failed (enabling future retry policies).

---

## `runner.ts` — `runSync(connectorModel)`

1. Decrypts OAuth credentials with `decryptCredentials()`.
2. Instantiates the connector via `getConnector()`, passing `last_synced_at` (converted from the PostgreSQL `Date` object to an **ISO string**) in `config` so the connector can filter only changed documents.
3. Calls `connector.refreshCredentials()` — if the provider returns updated tokens (e.g. a refreshed Google access token), stores the new encrypted credentials after the sync.
4. Iterates `connector.listDocuments()` — an async generator yielding `ConnectorDocument` objects. Respects `config.max_documents` if set (useful for limiting scope during testing).
5. For each document:
   - Calls `connector.fetchContent(externalId, metadata)` to get full text.
   - Runs `ingestDocument()` in its own `BEGIN / COMMIT` transaction.
   - On error: rolls back, increments `docsErrored` — does **not** abort the rest of the sync.
6. After all documents: queries `SELECT count(*) FROM documents WHERE connector_id = $1` for the true total, then updates `connectors.doc_count` and `last_synced_at`.

Returns `{ docsIndexed, docsSkipped, docsErrored }`.

---

## `services/indexer.ts` — `ingestDocument()`

Called per-document inside a transaction:

1. Computes SHA-256 of `"${title}::${content}"` — includes title so title-only renames trigger re-index.
2. Checks existing `content_hash` in DB — if identical, returns `"skipped"` immediately.
3. Chunks the content with `chunkText()` (800-char chunks, 100-char overlap).
4. Upserts `documents` row (`ON CONFLICT (connector_id, external_id)`).
5. Deletes old `document_chunks`, inserts new ones.
6. SQL updates `search_vector` (tsvector) on both tables.

---

## Pause / resume

When a connector is paused (`POST /connectors/:id/pause`), its `status` is set to `'paused'`. The dispatch worker skips it during the connector eligibility check. In-flight syncs are not interrupted — pause takes effect on the next scheduled cycle.

Resume (`POST /connectors/:id/resume`) resets `status` to `'idle'`, making the connector eligible for dispatch again.

---

## Concurrency

The BullMQ worker runs with `concurrency: 1`. This is intentional — running concurrent sync jobs for the same connector could produce race conditions on `document_chunks` (delete-then-insert pattern). If parallel throughput is needed in future, the safest path is per-connector locking rather than increasing global concurrency.

---

## Completed job cleanup

BullMQ is configured with `removeOnComplete: { count: 100 }` — only the 100 most recent completed jobs are kept in Redis. Historical sync records live in the `sync_jobs` PostgreSQL table, which is the source of truth for the sync history UI.
