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
