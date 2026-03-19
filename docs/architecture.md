# Architecture

Incharj is a modular monolith with one ingestion and search loop:

1. Connect to external sources
2. Normalize and index content
3. Serve ranked search results

---

## Runtime components

Three processes share PostgreSQL and Redis:

- Browser (React SPA)
- API (Fastify)
- Worker (BullMQ)

### Data stores

- PostgreSQL: tenants, connectors, sync state, documents, chunks
- Redis: queue transport and scheduling

---

## Sync flow (high-level)

```
dispatch (every 30s)
  |
  `- enqueue sync-enumerate
           |
           |- enumerate refs + checkpoint
           |- enqueue N sync-document jobs
           `- enqueue sync-finalize

sync-document (per ref)
  |- fetchDocument
  |- build canonical envelope
  `- ingestCanonicalDocument
       |- normalize
       |- chunk
       |- index
       `- permissions hook

sync-finalize
  |- wait for docs_processed == docs_enqueued
  |- complete sync_jobs row
  |- persist checkpoint
  `- update connector state
```

### End-to-end flow walkthrough

High-level (what happens):

1. A connector becomes due and the dispatcher schedules one sync run.
2. The enumerate stage asks the connector for document references.
3. One document job is created for each reference.
4. Each document job fetches content and immediately ingests that single document.
5. The finalize stage waits for all document jobs, then updates state and checkpoint.

Technical (how state changes):

1. `dispatchDueSyncs()` inserts a `sync_jobs` row and enqueues `sync-enumerate`.
2. `processEnumerateJob()` loads credentials/checkpoint, calls `plugin.enumerate()`, writes `docs_enqueued`, enqueues `sync-document` x N, then enqueues `sync-finalize`.
3. `processDocumentJob()` calls `plugin.fetchDocument()`, builds `CanonicalDocumentEnvelope`, then calls ingestion facade.
4. Ingestion runs stage modules in order:
  - normalization: sanitize, checksum, dedup, document upsert
  - chunking: delete old chunks, insert new chunks
  - indexing: update search vector
  - permissions: org-level fallback today, ACL expansion path ready
5. Document counters are updated per outcome (`indexed`, `skipped`, `errored`).
6. `processFinalizeJob()` polls until `docs_processed == docs_enqueued`, marks sync complete, stores checkpoint, updates connector metadata (`last_synced_at`, `doc_count`).

See [Core: Orchestration](/core-orchestration) for stage payloads, retries, and failure semantics.

Detailed stage behavior is split into core docs:

- [Core: Orchestration](/core-orchestration)
- [Core: Connectors (Plugin Layer)](/core-connectors)
- [Core: Normalization](/core-normalization)
- [Core: Chunking](/core-chunking)
- [Core: Indexing](/core-indexing)
- [Core: Permissions](/core-permissions)

---

## Search flow (high-level)

`GET /orgs/:slug/search` executes in three tiers:

1. Stop-word guard
2. Full-text search (GIN and tsvector)
3. Fuzzy fallback (trigram similarity)

For SQL-level details and ranking behavior, see:

- [Search](/search)

---

## Multi-tenancy model

All user data is org-scoped.

- API middleware enforces membership and role checks
- SQL queries include org filters
- Roles: owner, admin, member

---

## Canonical document model

Ingestion uses one internal envelope (`CanonicalDocumentEnvelope`) with explicit fields for source identity, content metadata, extraction status, and version markers.

This envelope is the boundary between connector plugins and core indexing stages.
