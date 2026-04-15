# Indexing Flow

Incharj indexes documents from external connectors (Google Drive, Slack) so they can be searched and cited in AI answers. This page walks through the full pipeline — from the scheduler waking up through enumeration, fetch, content extraction, chunking, embedding, and FTS indexing — with the code, the schema, and the reasoning behind each decision.

## High-Level Overview

```
                    ┌─────────────────────────────────────────┐
                    │  Celery Beat (every 5 min)               │
                    │  dispatch task                           │
                    │  ┌─ queries connectors due for sync      │
                    │  └─ creates sync_job + fires enumerate   │
                    └───────────────────┬─────────────────────┘
                                        │
                            ┌───────────▼───────────┐
                            │  sync_enumerate task   │
                            │  (sync_orchestration   │
                            │   queue)               │
                            │                        │
                            │  ┌─ loads checkpoint   │
                            │  ├─ calls plugin       │
                            │  │  .enumerate()       │
                            │  ├─ saves cursor       │
                            │  └─ fires N document   │
                            │     tasks (one/doc)    │
                            └───────────┬────────────┘
                                        │ (N tasks in parallel)
                     ┌──────────────────▼──────────────────────┐
                     │  sync_document tasks (sync_documents queue,│
                     │  up to 3 retries each)                   │
                     │                                           │
                     │  for each document ref:                   │
                     │  ┌─ _is_doc_unchanged? → skip            │
                     │  ├─ plugin.fetch_document()              │
                     │  ├─ normalize → upsert documents row     │
                     │  ├─ chunk_text (800 tok, 100 overlap)    │
                     │  ├─ embed_batch_cached → pgvector        │
                     │  └─ update_search_index (tsvector)       │
                     └──────────────────┬──────────────────────┘
                                        │
                            ┌───────────▼───────────┐
                            │  sync_finalize task    │
                            │                        │
                            │  ┌─ polls until all    │
                            │  │  docs processed     │
                            │  ├─ advances checkpoint│
                            │  │  (only if 0 errors) │
                            │  ├─ updates connector  │
                            │  │  doc count + cursor │
                            │  └─ Slack notify       │
                            └────────────────────────┘
```

## Scheduler: the dispatch task

Every 5 minutes Celery Beat fires `app.workers.tasks.sync.dispatch`. It queries the database for connectors whose next sync is overdue, skips any that already have an active job running (no double-running), creates a `sync_jobs` row, then fires `sync_enumerate` for each one.

```python
# apps/api/app/workers/celery_app.py
celery_app.conf.beat_schedule = {
    "dispatch-due-syncs-every-5m": {
        "task": "app.workers.tasks.sync.dispatch",
        "schedule": 300.0,
    }
}
```

**Why a scheduler instead of webhook-only?** Webhooks are fast but unreliable — they can miss events, fail to deliver, or not exist for every source. The scheduler ensures every connector is re-indexed on a predictable cadence even if webhook delivery fails.

## Two Queues, One Reason

```python
celery_app.conf.task_routes = {
    "app.workers.tasks.sync.dispatch":      {"queue": "sync_orchestration"},
    "app.workers.tasks.sync.sync_enumerate":{"queue": "sync_orchestration"},
    "app.workers.tasks.sync.sync_finalize": {"queue": "sync_orchestration"},
    "app.workers.tasks.sync.sync_document": {"queue": "sync_documents"},
}
```

Orchestration tasks (dispatch, enumerate, finalize) are fast and few. Document tasks are slow and many — a single Google Drive sync can produce hundreds. Separating them means a connector with 500 documents doesn't starve the scheduler from starting other syncs.

## Phase 1: Enumeration

`process_enumerate_job` in `processor.py` runs inside `sync_enumerate`. It does three things in a loop:

1. Calls `plugin.enumerate()` with the current checkpoint (or `None` on first run).
2. Immediately saves the new cursor to the database after each page of 100 documents.
3. Fires one `sync_document` Celery task per document ref returned.

```python
_ENUMERATE_PAGE_LIMIT = 100  # docs per enumerate call

while True:
    enumeration = await plugin.enumerate(
        ConnectorEnumerateInput(
            ...
            checkpoint=current_checkpoint,
            page_limit=_ENUMERATE_PAGE_LIMIT,
        )
    )

    # Save cursor BEFORE dispatching tasks
    if enumeration.next_checkpoint:
        await pool.execute(
            sql_checkpoints.upsert_connector_checkpoint(
                connector_id, org_id, next_ckpt_data, sync_job_id
            )
        )

    for ref in enumeration.refs:
        sync_document.apply_async(args=[sync_job_id, connector_id, _ref_to_dict(ref)])

    if not enumeration.next_checkpoint or not enumeration.next_checkpoint.cursor:
        break

    current_checkpoint = enumeration.next_checkpoint
```

**Why save the cursor before dispatching?** If the worker crashes after saving 3 pages of cursors but only dispatching 2, the worst case is some documents get processed twice (idempotent). If the cursor is saved after dispatching, a crash could mean a page is never dispatched at all — data loss.

### ConnectorDocumentRef — just a pointer, not content

The enumerate step only returns references — not content:

```python
@dataclass
class ConnectorDocumentRef:
    external_id: str        # e.g. "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs"
    title: str | None
    url: str | None
    kind: str | None        # "doc", "sheet", "message", etc.
    ext: str | None
    author_name: str | None
    author_email: str | None
    content_type: str | None
    source_path: str | None
    source_last_modified_at: str | None  # ISO 8601 — key for skip optimization
    source_permissions: dict | None
    metadata: dict
```

Keeping enumerate lightweight means a connector returning 10,000 document refs doesn't hold a long-lived API connection or consume large amounts of memory in the orchestration worker.

## Phase 2: Document Processing

Each `sync_document` task calls `process_document_job`. This is where the real work happens.

### The Skip Optimization — `_is_doc_unchanged`

Before making any API call to fetch content, the processor checks whether the document has already been indexed at the same `source_last_modified_at` timestamp:

```python
async def _is_doc_unchanged(pool, connector_id: str, ref) -> bool:
    if not ref.source_last_modified_at:
        return False

    row = await pool.fetchrow(
        select(docs_t.c.source_last_modified_at, docs_t.c.extraction_status)
        .where(
            docs_t.c.connector_id == connector_id,
            docs_t.c.external_id == ref.external_id,
        )
        .limit(1)
    )
    if row is None or row["extraction_status"] != "succeeded":
        return False

    # Normalise both to UTC before comparing
    existing_dt = existing_mtime.astimezone(timezone.utc).replace(tzinfo=None)
    ref_dt = datetime.fromisoformat(ref_iso).astimezone(timezone.utc).replace(tzinfo=None)
    return existing_dt >= ref_dt
```

If `True`, the task increments the `docs_skipped` counter and returns. No API call, no chunking, no embedding.

**Why this matters:** On a daily sync of a 1,000-document Drive where only 5 files changed, this avoids 995 API calls and 995 embedding requests. The skip is only applied when `extraction_status = "succeeded"` — failed documents are always retried.

### Fetch

If the document isn't skipped, the plugin's `fetch_document` is called:

```python
fetched = await plugin.fetch_document(
    ConnectorFetchInput(
        org_id=..., connector_id=..., credentials=..., config=..., ref=ref
    )
)
```

The plugin returns a `ConnectorFetchedDocument` with `content` (plain text), `content_type`, and arbitrary metadata. Google Drive's fetch converts Google Docs to plain text via the export API. Slack's fetch assembles message threads.

### Building the Envelope

The raw content and ref metadata are assembled into a `CanonicalDocumentEnvelope` — the single contract between the connector layer and the indexing layer:

```python
@dataclass
class CanonicalDocumentEnvelope:
    org_id: str
    connector_id: str
    connector_key: str     # "google_drive", "slack" — never changes even if connector is renamed
    source_id: str
    external_id: str
    checksum: str          # sha256("title::content") — used for dedup
    extraction_status: Literal["succeeded", "failed", "empty"]
    extraction_version: int   # bumped when extraction logic changes, triggers re-index
    chunking_version: int     # bumped when chunking algo changes
    indexing_version: int     # bumped when FTS/vector schema changes
    url: str | None
    title: str | None
    content: str | None
    source_last_modified_at: str | None
    # ... author, path, permissions, metadata
```

**Why version numbers?** When the chunking algorithm is improved, every document needs to be re-chunked. Setting `CHUNKING_VERSION = 2` and comparing against the stored version is a clean way to trigger re-indexing without ad hoc migration scripts.

**Why `checksum` on the envelope?** The normalizer compares the incoming checksum against the stored `content_hash`. If they match, the document is skipped at the DB level even if `source_last_modified_at` wasn't available. Two independent skip mechanisms: timestamp-based (pre-fetch) and hash-based (post-fetch).

## Phase 3: Normalization

`normalize_document` in `normalization/normalizer.py` handles the database record:

```python
async def normalize_document(conn, envelope):
    content = (envelope.content or "").strip().replace("\x00", "")[:500_000]
    checksum = envelope.checksum or sha256(f"{envelope.title or ''}::{content}")

    existing = await conn.fetchrow(
        sql_indexer.select_document_hash(envelope.connector_id, envelope.external_id)
    )
    if existing and existing["content_hash"] == checksum:
        return NormalizedDocument(..., was_skipped=True)

    # UPSERT — first index creates row; re-index updates it
    row = await conn.fetchrow(
        sql_indexer.upsert_document(
            org_id=..., connector_id=..., external_id=...,
            content_hash=checksum, extraction_status=..., ...
        )
    )
    return NormalizedDocument(document_id=str(row["id"]), ...)
```

The upsert uses a `ON CONFLICT (connector_id, external_id) DO UPDATE` so the same external document always maps to the same row. The constraint `uq_document_connector_external` enforces uniqueness.

**Content truncation at 500,000 characters:** Prevents pathologically large documents (e.g., a 50MB export) from blowing up memory during chunking and the embedding API call.

**Null byte stripping (`replace("\x00", "")`):** PostgreSQL rejects text fields containing `\x00`. Null bytes can appear in binary-converted content. Stripping them is safer than letting the row insert fail.

## Phase 4: Chunking

`process_chunks` in `chunking/chunk_processor.py` splits the content into overlapping chunks:

```python
chunks = chunk_text(content, 800, 100) if content else []
```

The `chunk_text` function in `utils/chunker.py` works sentence-by-sentence:

1. Splits on sentence boundaries (`[.!?]\s+`).
2. Accumulates sentences into a chunk until it would exceed 800 tokens.
3. When a chunk is full, saves it and carries the last ~100 tokens of overlap into the next chunk.
4. Handles sentences longer than the chunk limit by splitting on words.

**Why 800 tokens?** Balances retrieval precision (smaller = more precise) against context (larger = more context per chunk). At ~1.3 words/token, 800 tokens ≈ 615 words — enough for a full paragraph or a few Slack messages.

**Why 100 tokens of overlap?** A key concept often spans a sentence boundary. Without overlap, a question about a concept that straddles two chunks would only match one of them. The overlap ensures both chunks contain the full context.

**Token approximation:** `approximate_token_count` uses `words * 1.3` rather than calling a tokenizer. This avoids a dependency on a full tokenizer and is accurate enough for chunking purposes — real token counts are only needed for LLM prompt budget calculations.

After chunking, all existing chunks for the document are deleted before new ones are inserted:

```python
await conn.execute(sql_indexer.delete_document_chunks(document_id))
```

This is safe because the full ingestion is wrapped in a transaction — the old chunks stay visible until the new ones are committed.

## Phase 5: Embeddings

After chunking, each chunk is embedded via `embed_batch_cached`:

```python
embeddings = await embed_batch_cached(chunks, conn) if chunks else []
```

The embedder has two layers:

### Cache Layer

Before calling the embedding API, the embedder checks a local DB cache keyed by `sha256(text)`:

```python
keys = [_build_cache_key(provider.cache_namespace, t) for t in texts]
cached_rows = await conn.fetch(sql_ai.select_embeddings_by_keys(keys))
```

Only the texts not found in the cache are sent to the API. Cache hits are assembled back into the result list in the correct position. New embeddings are inserted into the cache after the API call.

**Why cache embeddings?** Re-indexing a connector (e.g., after bumping `INDEXING_VERSION`) re-chunks documents. Most chunks will be identical text — the cache turns what would be 1,000 API calls into a few dozen. The cache is keyed by content hash so any two documents with the same chunk text share a cached embedding.

### Embedding Provider

The provider is loaded via `get_embedding_provider()`. If no embedding model is configured, it returns `None` and the embedder returns empty lists — the document is still indexed for FTS, just without vector search capability.

When an embedding is returned, it's stored in the `document_chunks.embedding` column (`vector(1536)` for OpenAI `text-embedding-3-small`). A dimension mismatch raises immediately rather than silently storing an incompatible vector.

### FTS Search Vector on Chunks

Each chunk also gets a `search_vector` computed at insert time:

```python
search_vector=func.to_tsvector("english", func.left(content, 50000))
```

This is a PostgreSQL `tsvector` — a pre-processed lexeme list used for fast full-text search. Computing it at write time means search queries never need to call `to_tsvector` per-row.

## Phase 6: FTS Index Update

After chunks are written, `update_search_index` updates the document's own search vector:

```python
UPDATE documents SET search_vector =
  setweight(to_tsvector('english', coalesce(title, '')), 'A')
WHERE id = :document_id
```

Weight `'A'` is the highest in PostgreSQL's `ts_rank_cd` scoring. This means title matches score significantly higher than body matches — a query matching a document's exact title ranks above one that matches only inside the content.

## Database Schema

### `documents`

The main record per indexed document:

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `org_id` | UUID FK | Org scoping — all queries filter on this |
| `connector_id` | UUID FK | Which connector produced this doc |
| `external_id` | VARCHAR | Doc ID in the source system (e.g. Drive file ID) |
| `title` | TEXT | |
| `url` | TEXT | Link back to source |
| `kind` | VARCHAR | `doc`, `sheet`, `message`, etc. |
| `ext` | VARCHAR | File extension if relevant |
| `content_hash` | VARCHAR | `sha256(title::content)` — dedup key |
| `word_count` | INT | |
| `search_vector` | TSVECTOR | Pre-weighted title vector (weight A) |
| `source_last_modified_at` | TIMESTAMPTZ | Source mtime — used for skip optimization |
| `extraction_status` | VARCHAR | `succeeded` \| `failed` \| `empty` |
| `extraction_version` | INT | Bumped to force re-extraction |
| `chunking_version` | INT | Bumped to force re-chunking |
| `indexing_version` | INT | Bumped to force full re-index |
| `indexed_at` | TIMESTAMPTZ | Last time this row was written |
| `metadata` | JSONB | Source-specific fields |

Unique constraint: `(connector_id, external_id)` — prevents duplicate rows per source document.

### `document_chunks`

One row per chunk of a document:

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `document_id` | UUID FK | CASCADE DELETE — removing a doc removes all its chunks |
| `org_id` | UUID FK | Denormalized for query efficiency |
| `chunk_index` | INT | 0-based position within document |
| `content` | TEXT | Chunk text |
| `token_count` | INT | Approximate token count |
| `embedding` | VECTOR(1536) | pgvector — NULL if no embedding model configured |
| `search_vector` | TSVECTOR | FTS index on chunk content |

### `connector_checkpoints`

Cursor state for incremental sync:

| Column | Type | Notes |
|---|---|---|
| `connector_id` | UUID FK | One row per connector |
| `org_id` | UUID FK | |
| `checkpoint` | JSONB | `{ cursor, modifiedAfter }` |
| `last_sync_job_id` | UUID | Which job last updated this checkpoint |
| `updated_at` | TIMESTAMPTZ | |

## Phase 7: Finalization

`sync_finalize` polls until `docs_processed >= docs_enqueued`, then:

1. Marks the `sync_jobs` row as `completed`.
2. Advances the checkpoint **only if `docs_errored == 0`** — if any document failed, the cursor stays at its old position so failed documents are retried on the next sync.
3. Updates `connectors.sync_cursor` and `connectors.document_count`.
4. Sends a Slack notification with the indexed/skipped/errored counts.

**Why self-rescheduling finalize?** Document tasks run on a separate queue and their completion order is non-deterministic. Finalize can't know in advance how long to wait. Instead, it checks progress every 2 seconds and re-queues itself if work is still ongoing. When the last document task finishes, the next finalize poll sees `docs_processed == docs_enqueued` and completes.

## Search: Using the Index

Once indexed, documents are searched via `full_text_search` in `services/search_service.py`:

```
query
  │
  ├─ websearch_to_tsquery('english', query)
  │    empty? → return []
  │
  ├─ FTS query (tsvector match on documents + document_chunks)
  │    setweight(doc.search_vector, 'A') || setweight(chunk.search_vector, 'B')
  │    ranked by: ts_rank_cd * freshness_decay
  │               exp(-seconds_since_mtime / 90_days_in_seconds)
  │
  ├─ No FTS results? → fuzzy fallback (pg_trgm similarity > 0.1 on title)
  │
  └─ Semantic rerank (if embedding provider configured)
       embed_one_cached(query)
       cosine_similarity(query_embedding, chunk_embeddings)
       final_score = 0.6 * lexical_norm + 0.4 * semantic_norm
```

**Freshness decay:** `exp(-age_in_seconds / 7_776_000)` where `7_776_000 = 90 * 86400`. A 90-day-old document scores at `e^-1 ≈ 37%` of a brand-new one. This surfaces recently-updated documents without completely burying old ones.

**Fuzzy fallback:** When the FTS query produces zero results (query too short, unusual spelling), `pg_trgm` trigram similarity kicks in to find near-title-matches. This ensures users always see something rather than an empty page.

**Hybrid scoring weights (60/40):** Lexical search is more precise for exact terminology; semantic search handles synonyms and paraphrasing. The 60/40 split favors precision while still using semantic signals for reranking.

## File Map

```
apps/api/app/
  workers/
    celery_app.py              — Celery config, two queues, 5-min beat schedule
    tasks/sync.py              — dispatch, sync_enumerate, sync_document, sync_finalize tasks
    processor.py               — process_enumerate_job, process_document_job, process_finalize_job
                                 _is_doc_unchanged optimization

  connectors/
    plugin_types.py            — ConnectorManifest, ConnectorPlugin, ConnectorDocumentRef,
                                 ConnectorFetchedDocument, ConnectorCheckpoint interfaces
    registry.py                — register_connector_provider / get_connector_provider / load_connectors
    google_drive/
      enumerate.py             — Google Drive list files (Drive API v3)
      fetch.py                 — Export Google Docs/Sheets to plain text
    slack/
      enumerate.py             — List channels + fetch message history
      fetch.py                 — Assemble thread content

  types/
    document_envelope.py       — CanonicalDocumentEnvelope dataclass + version constants

  services/
    indexer.py                 — ingest_canonical_document: normalize → chunk → embed → FTS

  normalization/
    normalizer.py              — normalize_document: checksum dedup, upsert documents row

  chunking/
    chunk_processor.py         — process_chunks: delete old, chunk, embed, insert

  utils/
    chunker.py                 — chunk_text (sentence-aware, overlapping)
    security.py                — sha256 helper

  ai/
    embedder.py                — embed_batch_cached: DB cache + provider call
    index.py                   — get_embedding_provider, cosine_similarity

  indexing/
    indexer.py                 — update_search_index: write tsvector to documents row

  services/
    search_service.py          — full_text_search: FTS → fuzzy fallback → semantic rerank

  sql/
    indexer.py                 — select_document_hash, upsert_document, insert_document_chunk,
                                 delete_document_chunks, update_document_search_vector
    checkpoints.py             — select_connector_checkpoint, upsert_connector_checkpoint
    sync_jobs.py               — insert_scheduled_job, start_sync_job, set_docs_enqueued,
                                 increment_sync_job_doc_result, complete_sync_job
    ai.py                      — select_embeddings_by_keys, upsert_embedding_cache
```
