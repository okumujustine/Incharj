# Search

Search is implemented in `backend/src/services/search-service.ts` using SQL builders from `backend/src/sql/search.ts`.

## Strategy

```
query received
     │
     ▼
 ftSearch()          ← websearch_to_tsquery, ts_rank_cd, time decay
     │
  total > 0? ──yes──► return FTS results
     │
    no
     │
     ▼
 fuzzySearch()       ← pg_trgm similarity() > 0.1
     │
     ▼
 return fuzzy results
```

FTS is always tried first. Fuzzy search only runs if FTS finds nothing.

---

## Full-text search (FTS)

**SQL builder**: `buildFtsQuery(whereClause, limitParam, offsetParam)`

### How it works

1. The query string is converted to a `tsquery` with `websearch_to_tsquery('english', $2)`.
   - Supports natural language: `"product roadmap" NOT finance`, `roadmap OR milestone`
2. For each document, a combined `tsvector` is built:
   - Title → weighted `'A'` (highest)
   - Best matching chunk → weighted `'B'`
   - "Best chunk" is found with a lateral join ordered by per-chunk `ts_rank_cd`
3. Documents are filtered by `tsq.q @@ sv` (the tsquery must match the vector).
4. **Score** = `ts_rank_cd(sv, q, 32) × time_decay`
   - `ts_rank_cd` uses cover density ranking (penalises scattered term matches)
   - Time decay: `exp(−age_seconds / (90 days × 86400))` — a 90-day half-life so recent documents score higher for equal relevance
5. **Snippet** is generated with `ts_headline()` using `<mark>` / `</mark>` delimiters, up to 2 fragments of 40 words.

### Count query

`buildFtsCountQuery(whereClause)` runs a lighter query (no ranking, no headline) that counts matching documents. Run in parallel with the main query via `Promise.all`.

---

## Fuzzy search

**SQL builder**: `buildFuzzyQuery(whereClause, limitParam, offsetParam)`

### How it works

Uses the `pg_trgm` extension's `similarity()` function:

```sql
GREATEST(
  similarity(d.title, $2),
  max(similarity(dc.content, $2)) over all chunks
) AS raw_score
```

Only documents where the title similarity **or** at least one chunk similarity exceeds `0.1` are included. Score threshold of 0.1 keeps noise out while still catching partial matches and typos (e.g. `roadmap` vs `roadmpa`).

Snippet is the raw best-matching chunk content (no HTML markup — no `ts_headline` in fuzzy mode).

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

Both search modes support `limit` / `offset`. Defaults: `limit=20`, `offset=0`. The response includes `total` (exact count) for UI pagination.

---

## API

```
GET /api/v1/orgs/:slug/search?q=<query>[&connector_id=…][&kind=…][&date_from=…][&date_to=…][&limit=…][&offset=…]
```

See `docs/api.md` for the full response shape.

---

## Search vector maintenance

`search_vector` columns on `documents` and `document_chunks` are populated during indexing, not at query time:

- `SQL_UPDATE_DOCUMENT_SEARCH_VECTOR` — updates `documents.search_vector` to `to_tsvector('english', title)` after upsert.
- Each chunk's `search_vector` is set during `SQL_INSERT_DOCUMENT_CHUNK`.

This keeps search queries fast — no `to_tsvector()` calls at query time.
