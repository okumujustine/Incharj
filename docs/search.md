# Search

Search is implemented in `backend/src/services/search-service.ts` using SQL builders from `backend/src/sql/search.ts`.

## Strategy

```
query received
     │
     ▼
websearch_to_tsquery() produces empty string?
     │
    yes ──► return { total: 0, results: [] }   (stop words, e.g. "the")
     │
    no
     │
     ▼
 ftSearch()          ← search_vector @@ tsq, ts_rank_cd, time decay (GIN index)
     │
  total > 0? ──yes──► return FTS results
     │
    no
     │
     ▼
 fuzzySearch()       ← similarity(title, q) > 0.1  (GIN trgm index on title)
     │
     ▼
 return fuzzy results
```

FTS is always tried first. Fuzzy search only runs if FTS finds nothing.

---

## Stop word short-circuit

Before running any database query, `search-service.ts` checks whether `websearch_to_tsquery('english', q)` produces an empty tsquery:

```sql
SELECT (websearch_to_tsquery('english', $1)::text = '') AS is_empty
```

If `is_empty` is true (common English stop words like "the", "a", "is"), the service returns an empty result immediately without hitting the main search tables. This prevents a very slow full fuzzy scan that would otherwise be triggered as a fallback.

---

## Full-text search (FTS)

**SQL builder**: `buildFtsQuery(whereClause, limitParam, offsetParam)`

### How it works

1. The query is parsed with `websearch_to_tsquery('english', $2)` — supports natural language syntax: `"product roadmap" NOT finance`, `roadmap OR milestone`.
2. The LATERAL join pre-filters `document_chunks` by `dc.search_vector @@ tsq.q` (uses the GIN index `ix_chunks_search_vector`) before ranking, so only matching chunks are considered.
3. A combined tsvector is constructed:
   - Title → weighted `'A'` (highest)
   - Best matching chunk content → weighted `'B'`
4. Documents are filtered by `d.search_vector @@ tsq.q` (uses `ix_documents_search_vector` GIN index).
5. **Score** = `ts_rank_cd(sv, q, 32) × time_decay`
   - `ts_rank_cd` uses cover density ranking (penalises scattered term matches)
   - Time decay: `exp(−age_seconds / (90 days × 86400))` — a 90-day half-life so recent documents score higher for equal relevance
6. **Snippet** is generated with `ts_headline()` using `<<` / `>>` delimiters (rendered as highlighted text in the UI). Input is capped at 5KB to prevent slow headline generation on large documents.

### Count query

`buildFtsCountQuery(whereClause)` runs a lighter query (no ranking, no headline) that counts matching documents. Run in parallel with the main query via `Promise.all`.

---

## Fuzzy search

**SQL builder**: `buildFuzzyQuery(whereClause, limitParam, offsetParam)`

### How it works

Uses the `pg_trgm` extension's `similarity()` function on **document titles only**:

```sql
similarity(d.title, $2) AS raw_score
```

Only documents where the title similarity exceeds `0.1` are included. This uses the `ix_documents_title_trgm` GIN index and remains fast at scale.

> **Note**: Fuzzy search does not scan chunk content. Scanning chunk content inside a subquery cannot use a GIN index and would be extremely slow on large datasets. Title-only fuzzy catches the most common case (typos/partial matches in document names).

Score threshold of 0.1 keeps noise out while still catching partial matches and typos (e.g. `roadmap` vs `roadmpa`).

Snippet is the raw title — no `ts_headline` in fuzzy mode.

---

## Filters

Both FTS and fuzzy share the same filter builder (`buildFilters()` in `search-service.ts`):

| Filter | SQL |
|---|---|
| `orgId` | `d.org_id = $1` (always applied) |
| `connectorId` | `d.connector_id = $N` |
| `kind` | `d.kind = $N` |
| `fromDate` | `d.mtime >= $N` |
| `toDate` | `d.mtime <= $N` |

The WHERE clause string and the `values[]` array are passed into the builder functions so the SQL stays parameterised.

---

## Pagination

Both search modes support `limit` / `offset`. Defaults: `limit=20`, `offset=0`. The response includes `total` (exact count) for UI pagination (20 results per page in the frontend).

---

## API

```
GET /api/v1/orgs/:slug/search?q=<query>[&connector_id=…][&kind=…][&date_from=…][&date_to=…][&limit=…][&offset=…]
```

See `docs/api.md` for the full response shape.

---

## Search vector maintenance

`search_vector` columns on `documents` and `document_chunks` are populated during indexing, not at query time:

- `documents.search_vector` is updated after each upsert via a dedicated SQL statement: `to_tsvector('english', coalesce(title, ''))`.
- `document_chunks.search_vector` is set on chunk insert: `to_tsvector('english', content)`.

Both columns are indexed with GIN indexes (`ix_documents_search_vector`, `ix_chunks_search_vector`), keeping queries fast — no runtime `to_tsvector()` calls at query time.
