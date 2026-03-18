# Indexer

The indexer is the pipeline that turns raw document content from external sources into searchable records in PostgreSQL. It runs inside the sync worker for every document yielded by a connector.

Entry point: `backend/src/services/indexer.ts` → `ingestDocument(client, orgId, connectorId, docData)`

---

## The four stages

```
fetchContent()
     │  raw text string
     ▼
1. Hash check      ← skip if unchanged
     │  new/changed
     ▼
2. Chunk           ← split into overlapping segments
     │  chunks[]
     ▼
3. Upsert          ← atomic transaction per document
     │
     ▼
4. Search vector   ← pre-compute tsvector for fast query-time lookup
```

Each document runs in its own `BEGIN / COMMIT` transaction. If one document fails it is counted as `docs_errored` and the sync continues — a single bad file never aborts the whole job.

---

## Stage 1 — Hash check (deduplication)

```ts
const contentHash = sha256(`${docData.title ?? ''}::${content}`)

if (existing?.content_hash === contentHash) {
  return 'skipped'
}
```

**Why title is included in the hash**: if a document's title changes but its body stays the same, the hash changes and the document is re-indexed. Without this, a rename would be silently ignored.

**Effect on sync performance**: on an incremental sync of 1,200 documents where only 8 changed, 1,192 return `"skipped"` before touching any other table — making incremental syncs very cheap.

---

## Stage 2 — Chunking

```ts
// utils/chunker.ts
function chunkText(content: string): string[] {
  // chunk size : 800 characters
  // overlap    : 100 characters
}
```

| Parameter | Value | Reason |
|---|---|---|
| Chunk size | 800 chars | Fits comfortably within PostgreSQL's `ts_headline` processing limits and keeps tsvectors small |
| Overlap | 100 chars | Preserves context across chunk boundaries — a phrase that straddles a split point is still findable |

**Example**: a 2,400-char document produces 4 chunks:
```
[0 → 800], [700 → 1500], [1400 → 2200], [2100 → 2400]
```
Each chunk is stored as a separate `document_chunks` row with its `chunk_index` (0-based).

---

## Stage 3 — Upsert

```sql
-- documents: upsert on the natural key (connector_id, external_id)
INSERT INTO documents (id, org_id, connector_id, external_id, title, url,
                       kind, ext, author_name, content_hash, word_count, mtime, ...)
VALUES (...)
ON CONFLICT (connector_id, external_id)
DO UPDATE SET title = EXCLUDED.title,
              content_hash = EXCLUDED.content_hash,
              ...

-- chunks: replace entirely
DELETE FROM document_chunks WHERE document_id = $1
INSERT INTO document_chunks (document_id, org_id, chunk_index, content, token_count)
VALUES (...), (...), ...
```

Chunks are always replaced wholesale (delete + insert) rather than diffed. This keeps the code simple and correct — partial chunk updates would be tricky to reason about when content shifts positions.

---

## Stage 4 — Search vector

After the upsert, two `UPDATE` statements pre-compute the tsvector for both tables:

```sql
-- Document-level vector (title only, weight 'A')
UPDATE documents
SET search_vector = to_tsvector('english', coalesce(title, ''))
WHERE id = $1

-- Chunk-level vector (body content, set at insert time)
-- search_vector = to_tsvector('english', content)
```

**Why pre-compute?** At query time `search_vector @@ tsq` hits a GIN index directly. If we computed `to_tsvector()` at query time instead, every search would scan and tokenise potentially millions of rows — orders of magnitude slower.

Both `documents.search_vector` and `document_chunks.search_vector` have GIN indexes:

```sql
CREATE INDEX ix_documents_search_vector  ON documents       USING GIN (search_vector)
CREATE INDEX ix_chunks_search_vector     ON document_chunks USING GIN (search_vector)
```

---

## Core database tables

The indexer writes to two tables. These are the only tables that matter for understanding the search engine:

### `documents`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `org_id` | UUID | Tenant isolation — every query filters by this |
| `connector_id` | UUID | Which source this came from |
| `external_id` | VARCHAR(512) | ID in the source system (e.g. Google Drive file ID) |
| `title` | TEXT | Document title |
| `url` | TEXT | Link back to the source |
| `kind` | VARCHAR | `document`, `page`, `message`, `spreadsheet`, `presentation` |
| `content_hash` | VARCHAR(64) | SHA-256 of `title::content` — used for skip-on-unchanged |
| `mtime` | TIMESTAMPTZ | Last modified time from the source system |
| `search_vector` | tsvector | Pre-computed FTS vector over the title |

Unique constraint: `(connector_id, external_id)` — the upsert key.

### `document_chunks`

| Column | Type | Notes |
|---|---|---|
| `document_id` | UUID | FK → documents (cascade delete) |
| `org_id` | UUID | Denormalised for query performance |
| `chunk_index` | INTEGER | 0-based position within the document |
| `content` | TEXT | 800-char segment with 100-char overlap |
| `token_count` | INTEGER | Approximate token count |
| `search_vector` | tsvector | Pre-computed FTS vector over chunk content |

---

## Incremental sync

The indexer itself is stateless — it just processes whatever the connector yields. Incrementality is the connector's responsibility:

1. `runner.ts` reads `connectorModel.last_synced_at` (a PostgreSQL `Date` object) and converts it to an ISO string: `new Date(last_synced_at).toISOString()`
2. That ISO string is passed into `connector.config.last_synced_at`
3. The connector uses it to filter at the source API level — e.g. Google Drive `modifiedTime > '2024-01-15T10:00:00Z'`
4. After a successful sync, `connectors.last_synced_at` is updated to `now()`

**Why the ISO string conversion matters**: PostgreSQL returns `TIMESTAMPTZ` columns as JavaScript `Date` objects via the `pg` driver. Passing a `Date` object directly into the connector config as a filter string produces `[object Object]` — silently fetching all documents every time. The explicit `.toISOString()` call was the fix.
