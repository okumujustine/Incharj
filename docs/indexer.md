# Indexer

The indexer turns raw document content from a connector into searchable PostgreSQL records. It is the most critical piece of the system — everything the search engine returns was written by the indexer.

**Entry point**: `backend/src/services/indexer.ts` → `ingestDocument(client, orgId, connectorId, docData)`

---

## Pipeline overview

```
connector.fetchContent(externalId, metadata)
         │
         │  string | null
         ▼
┌─────────────────────────────────────────────┐
│  ingestDocument()  — one transaction        │
│                                             │
│  1. Hash check     skip if unchanged        │
│         │                                   │
│         ▼  (new or changed)                 │
│  2. Chunk text     800 chars / 100 overlap  │
│         │                                   │
│         ▼                                   │
│  3a. Upsert documents row                   │
│  3b. Delete old chunks                      │
│  3c. Insert new chunks                      │
│         │                                   │
│  4. Update search_vector on documents       │
│     (chunks get search_vector at insert)    │
└─────────────────────────────────────────────┘
         │
         ▼
   return 'indexed' | 'skipped' | 'error'
```

Each document runs in its own `BEGIN / COMMIT` transaction. If content fetching fails or a DB constraint is violated, only that document's transaction rolls back. The sync worker increments `docs_errored` and moves on to the next document.

---

## What the connector yields

Each iteration of `connector.listDocuments()` yields a `ConnectorDocument`:

```ts
interface ConnectorDocument {
  external_id: string           // stable ID in the source system (e.g. Google file ID)
  url?: string | null           // link back to the original
  title?: string | null
  kind?: string | null          // 'document' | 'page' | 'message' | 'spreadsheet' | 'presentation'
  ext?: string | null           // file extension: 'pdf', 'md', 'csv', null for Google Docs
  author_name?: string | null
  author_email?: string | null
  mtime?: string | null         // ISO timestamp from the source system
  metadata?: Record<string, unknown> | null  // connector-specific extras
}
```

`fetchContent(external_id, metadata)` is called separately per document, returning the full plain-text content string (or `null` if the file has no extractable text — e.g. a binary that couldn't be parsed).

Documents with `null` content still get a `documents` row (for title-based search and browsing) but produce zero chunks.

---

## Stage 1 — Hash check

```ts
// sha256 is HMAC-SHA256, lives in utils/security.ts
const contentHash = sha256(`${docData.title ?? ''}::${content ?? ''}`)

// Look up the existing row
const existing = await client.query(
  'SELECT content_hash FROM documents WHERE connector_id = $1 AND external_id = $2',
  [connectorId, docData.external_id]
)

if (existing.rows[0]?.content_hash === contentHash) {
  return 'skipped'   // nothing has changed, stop here
}
```

**Why the hash covers both title and content:**

The hash is `sha256("${title}::${content}")`. The `::` separator prevents a collision where a title ending in `x` and content starting with `y` is the same as a title ending in `xy` with empty content.

Including the title means:
- Document body unchanged, title changed → hash differs → re-indexed ✓
- Document body changed, title unchanged → hash differs → re-indexed ✓
- Neither changed → hash matches → skipped ✓

Before this, title renames were silently ignored. A document called "Q3 Plan" renamed to "Q3 Roadmap" would still appear in search with the old name.

**Performance impact**: On a typical incremental sync of 1,200 documents where only 8 changed since the last sync, 1,192 documents return `'skipped'` at this stage — no chunk deletion, no chunk insertion, no search vector update.

---

## Stage 2 — Chunking

Full documents can be thousands of characters long. PostgreSQL's `ts_headline()` and `tsvector` work best on smaller units. The chunker in `utils/chunker.ts` splits content into overlapping segments:

```
Document (2,400 chars):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Chunk 0:  [0 ────────── 800]
Chunk 1:        [700 ────────── 1500]
Chunk 2:               [1400 ────────── 2200]
Chunk 3:                      [2100 ── 2400]

Overlap = 100 chars
```

| Parameter | Value | Reasoning |
|---|---|---|
| Chunk size | 800 chars | Large enough for meaningful context; small enough that `ts_headline` stays fast (capped at 5 KB input) |
| Overlap | 100 chars | A sentence or phrase that straddles a chunk boundary is still findable because it appears in both adjacent chunks |

Each chunk becomes one `document_chunks` row. The `chunk_index` (0-based) preserves reading order, which matters for snippet quality — the LATERAL join picks the **best-ranking** chunk, not necessarily chunk 0.

**Documents with no content** (content is `null` or empty) produce zero chunks. They are still indexed as `documents` rows so they show up in the file browser and can be found by title-only fuzzy search.

---

## Stage 3 — Database upsert

All three writes happen inside the same transaction:

```sql
-- 3a. Upsert the document
INSERT INTO documents (
  id, org_id, connector_id, external_id,
  title, url, kind, ext,
  author_name, author_email,
  content_hash, word_count, mtime,
  indexed_at, metadata
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now(), $14)
ON CONFLICT (connector_id, external_id)
DO UPDATE SET
  title        = EXCLUDED.title,
  url          = EXCLUDED.url,
  content_hash = EXCLUDED.content_hash,
  word_count   = EXCLUDED.word_count,
  mtime        = EXCLUDED.mtime,
  indexed_at   = now(),
  metadata     = EXCLUDED.metadata
RETURNING id;

-- 3b. Remove all old chunks for this document
DELETE FROM document_chunks WHERE document_id = $1;

-- 3c. Insert new chunks (one row per chunk)
INSERT INTO document_chunks
  (id, document_id, org_id, chunk_index, content, token_count)
VALUES
  ($1, $2, $3, 0, $4, $5),
  ($6, $7, $8, 1, $9, $10),
  ...
```

**Why chunks are deleted and re-inserted (not diffed):** When content changes, chunks shift position — chunk 3 of the old version may not correspond to chunk 3 of the new version at all. Diffing individual chunks is both complex and fragile. A full replace is simpler and always correct.

**`ON CONFLICT` key**: `(connector_id, external_id)` is the natural upsert key. The same file in Google Drive always has the same `external_id` (the file's Drive ID), so syncing it twice updates the existing row rather than creating a duplicate.

---

## Stage 4 — Search vector

After the upsert, the search vectors are written:

```sql
-- Document-level: title only, weight 'A'
UPDATE documents
SET search_vector = to_tsvector('english', coalesce(title, ''))
WHERE id = $1;
```

For chunks, the `search_vector` is set at insert time (included in the `INSERT` statement above):

```sql
-- Each chunk row includes:
search_vector = to_tsvector('english', content)
```

**What `to_tsvector('english', ...)` does:**
1. Lowercases all words
2. Strips stop words (`the`, `a`, `is`, `of`, …) — they take up index space but add no search value
3. Stems each word using the English Snowball stemmer: `running` → `run`, `products` → `product`
4. Records each stem with its position in the text

The resulting `tsvector` looks like: `'product':3A 'roadmap':4A 'q3':1A` where the numbers are positions and `A` is the weight.

**Why at index time, not query time:**

The alternative — computing `to_tsvector(content)` inside the search query — forces PostgreSQL to tokenise every candidate row at query time. With GIN indexes, the pre-computed vector is already in the index and the lookup is a direct bitmap index scan. The difference is roughly:

| Approach | 100k documents | 1M documents |
|---|---|---|
| Runtime `to_tsvector` | ~2-5 seconds | 20-60 seconds |
| Pre-computed + GIN | ~5-30 ms | ~30-100 ms |

---

## GIN indexes

Both search vector columns are indexed with GIN (Generalized Inverted Index):

```sql
CREATE INDEX ix_documents_search_vector
  ON documents USING GIN (search_vector);

CREATE INDEX ix_chunks_search_vector
  ON document_chunks USING GIN (search_vector);

CREATE INDEX ix_documents_title_trgm
  ON documents USING GIN (title gin_trgm_ops);
```

A GIN index maps each lexeme (stemmed word) to the list of row IDs that contain it — like the index at the back of a book. When you query `search_vector @@ tsq`, PostgreSQL does a GIN lookup on each lexeme in the tsquery, intersects the result sets, and returns the matching row IDs. No sequential scan.

---

## Sync job tracking

The sync worker updates the `sync_jobs` row throughout the run:

```ts
// In processor.ts, wrapping runner.ts
const result = await runSync(connector)

await db.query(SQL_COMPLETE_SYNC_JOB, [
  syncJobId,
  result.docsIndexed,
  result.docsSkipped,
  result.docsErrored,
])
```

`sync_jobs` columns written during a sync:

| Column | When set |
|---|---|
| `status` | `'running'` on pickup, `'done'` or `'failed'` on finish |
| `started_at` | When the worker picks up the job |
| `finished_at` | When the sync completes (success or failure) |
| `docs_indexed` | Count of documents successfully written |
| `docs_skipped` | Count of documents where hash matched (no change) |
| `docs_errored` | Count of documents that threw an error |
| `error_message` | Set only when `status = 'failed'` (whole-job failure) |

A job with `status = 'done'` and `docs_errored > 0` is shown as **partial** in the UI — meaning the sync completed but some individual documents failed.

---

## Incremental sync — the `last_synced_at` detail

The indexer itself is stateless. Incrementality is the connector's job:

```ts
// runner.ts — before calling listDocuments()
const lastSyncedAt = connectorModel.last_synced_at
  ? new Date(connectorModel.last_synced_at as unknown as Date).toISOString()
  : undefined

const connector = getConnector({
  kind: connectorModel.kind,
  credentials: decryptedCreds,
  config: {
    last_synced_at: lastSyncedAt,   // ISO string or undefined
    max_documents: connectorModel.config?.max_documents,
  },
})
```

**The `Date` object gotcha**: the `pg` driver returns `TIMESTAMPTZ` columns as JavaScript `Date` objects. If you pass a `Date` object into a template string — e.g. `modifiedTime > '${last_synced_at}'` — you get `modifiedTime > '[object Object]'`, which silently matches nothing. The Google Drive API ignores the malformed filter and returns all documents. Every sync becomes a full re-fetch. The fix is the explicit `.toISOString()` call above.

After a successful sync, `connectors.last_synced_at` is updated to `now()`. The next dispatch cycle uses this value to determine when the connector is next due.

---

## Adding a new connector

1. Create `backend/src/connectors/my-source.ts` extending `BaseConnector`
2. Implement five methods:

```ts
class MySourceConnector extends BaseConnector {
  authorizeUrl(state: string): string { /* return OAuth URL */ }

  async exchangeCode(code: string, redirectUri: string): Promise<Record<string, unknown>> {
    /* exchange code for tokens, return credential object */
  }

  async refreshCredentials(): Promise<Record<string, unknown> | null> {
    /* refresh access token if expired, return new credentials or null */
  }

  async *listDocuments(): AsyncGenerator<ConnectorDocument> {
    /* yield one ConnectorDocument per document, read this.config.last_synced_at */
  }

  async fetchContent(externalId: string, metadata: Record<string, unknown>): Promise<string | null> {
    /* return plain text content or null */
  }
}
```

3. Register it in `registry.ts`:
```ts
connectorRegistry.set('my_source', MySourceConnector)
```

4. Add `'my_source'` to the connector kind enum in `schemas/connector.ts`

The worker, indexer, OAuth routes, and search engine require no changes — they are connector-agnostic.
