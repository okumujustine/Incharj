# Core: Indexing

Indexing makes documents queryable by PostgreSQL full-text search.

Source module:
- `backend/src/indexing/indexer.ts`

---

## Behavior

`updateSearchIndex(client, documentId)` runs:

- `SQL_UPDATE_DOCUMENT_SEARCH_VECTOR`

That statement updates the document-level `search_vector` used by FTS ranking.

`finalizeSearchability(...)` currently delegates to `updateSearchIndex(...)` and is reserved for future cross-backend indexing steps.

---

## Position in pipeline

Indexing is stage 3:

1. Normalize
2. Chunk
3. Index
4. Permission attach/validate

At this stage, content and chunks already exist in storage; indexing updates search-facing projections.

---

## Related modules

- Query-time search behavior: `docs/search.md`
- Ingestion facade: `backend/src/services/indexer.ts`
- SQL builders: `backend/src/sql/indexer.ts`
