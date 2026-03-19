# Search

The search engine lives in `backend/src/services/search-service.ts`. It receives a plain-text query from the API and returns ranked, paginated results with highlighted snippets. It never calls an external service — everything runs inside PostgreSQL.

---

## Three-tier strategy

```
query string
     │
     ▼
 ┌─────────────────────────────────────────────┐
 │ Tier 1 — Stop word guard                    │
 │                                             │
 │  websearch_to_tsquery('english', q) = ''?   │
 │  → yes: return { total: 0, results: [] }    │
 │          (no DB query at all)               │
 └──────────────────┬──────────────────────────┘
                    │ no
                    ▼
 ┌─────────────────────────────────────────────┐
 │ Tier 2 — Full-text search (FTS)             │
 │                                             │
 │  GIN index on search_vector                 │
 │  ts_rank_cd + time decay scoring            │
 │  ts_headline snippet extraction             │
 └──────────────────┬──────────────────────────┘
                    │ total = 0
                    ▼
 ┌─────────────────────────────────────────────┐
 │ Tier 3 — Fuzzy fallback                     │
 │                                             │
 │  similarity(title, q) > 0.1                 │
 │  GIN trgm index on title                    │
 │  Catches typos, partial words               │
 └─────────────────────────────────────────────┘
```

---

## Tier 1 — Stop word guard

English stop words (`the`, `a`, `is`, `of`, `and`, …) are stripped by PostgreSQL's `english` text search dictionary. They produce an empty tsquery:

```sql
SELECT websearch_to_tsquery('english', 'the')::text;
-- → ''

SELECT websearch_to_tsquery('english', 'the product roadmap')::text;
-- → 'product' & 'roadmap'   (stop words removed, meaningful words kept)
```

Before hitting the search tables, the service checks this:

```sql
SELECT (websearch_to_tsquery('english', $1)::text = '') AS is_empty
```

If `is_empty = true`, the service returns immediately:
```ts
return { query: options.query, total: 0, results: [], limit, offset }
```

**Why this matters**: without the guard, an empty tsquery returns 0 FTS results, which triggers the fuzzy fallback. The fuzzy fallback runs `similarity(title, q)` across every document row — a full table scan that takes 30–60+ seconds on large datasets. The guard short-circuits before any of that.

---

## Tier 2 — Full-text search

### The SQL structure

The FTS query is built by `buildFtsQuery()` in `sql/search.ts`. Simplified:

```sql
WITH tsq AS (
  SELECT websearch_to_tsquery('english', $2) AS q
),

-- Step 1: for each document, find the best matching chunk
-- The LATERAL join is pre-filtered by the GIN index on chunk search_vector
candidates AS (
  SELECT
    d.id,
    d.title,
    d.url,
    d.kind,
    d.ext,
    d.mtime,
    d.connector_id,
    dc_best.content  AS best_chunk_content,

    -- Combined weighted tsvector:
    -- title gets weight 'A' (highest), chunk body gets weight 'B'
    setweight(d.search_vector, 'A')
      || setweight(to_tsvector('english', coalesce(dc_best.content, '')), 'B')
    AS sv,

    (SELECT q FROM tsq) AS q

  FROM documents d

  -- Lateral join: find the highest-scoring chunk for this document
  LEFT JOIN LATERAL (
    SELECT dc.content
    FROM document_chunks dc
    WHERE dc.document_id = d.id
      AND dc.search_vector @@ (SELECT q FROM tsq)   -- GIN index hit
    ORDER BY ts_rank_cd(dc.search_vector, (SELECT q FROM tsq)) DESC
    LIMIT 1
  ) dc_best ON true

  WHERE d.org_id = $1                         -- always scoped to org
    AND (
      d.search_vector @@ (SELECT q FROM tsq)  -- document title matches
      OR dc_best.content IS NOT NULL           -- OR at least one chunk matches
    )
    -- ... additional filters (connector_id, kind, mtime range)
),

-- Step 2: score each candidate
ranked AS (
  SELECT
    *,
    ts_rank_cd(sv, q, 32)                        -- cover density rank
    * exp(
        -extract(epoch from (now() - mtime))
        / (90.0 * 86400)                         -- 90-day time decay
      )
    AS score
  FROM candidates
  ORDER BY score DESC
  LIMIT $3 OFFSET $4
)

-- Step 3: generate highlighted snippet
SELECT
  r.*,
  ts_headline(
    'english',
    left(r.best_chunk_content, 5000),  -- cap at 5KB to keep ts_headline fast
    r.q,
    'StartSel=<<, StopSel=>>, MaxFragments=2, MaxWords=40, MinWords=15'
  ) AS snippet
FROM ranked r;
```

### Understanding `ts_rank_cd`

`ts_rank_cd` is **cover density ranking**. The third argument `32` is a normalization flag: divide rank by the document length (in words). Without normalization, a 10,000-word document that mentions "roadmap" once would outscore a 200-word document where "roadmap" appears prominently just because the long doc has more total term matches.

The scoring rewards:
- **Proximity**: terms appearing close together score higher than scattered matches
- **Weight**: a match in the title (`'A'` weight) contributes 4× more than a body match (`'B'` weight)
- **Density**: more unique matching terms relative to document length → higher score

### Time decay

```
score_final = ts_rank_cd(sv, q, 32) × exp(−age_in_seconds / (90 × 86400))
```

| Document age | Decay multiplier |
|---|---|
| Today | 1.00 (no decay) |
| 30 days | 0.72 |
| 90 days | 0.37 |
| 180 days | 0.14 |
| 1 year | 0.02 |

A document from a year ago would need to be ~50× more relevant than a new document to outscore it. This keeps search results fresh without completely hiding old content.

To disable time decay (e.g. for testing), remove the `* exp(...)` clause from the score calculation.

### `websearch_to_tsquery` syntax

Users can write natural language queries. The function parses:

| Input | Parsed as |
|---|---|
| `product roadmap` | `'product' & 'roadmap'` (both required) |
| `"product roadmap"` | `'product' <-> 'roadmap'` (phrase, must be adjacent) |
| `roadmap OR milestone` | `'roadmap' \| 'mileston'` |
| `roadmap NOT finance` | `'roadmap' & !'financ'` |
| `product road*` | `'product' & 'road':*` (prefix match) |

Words are also stemmed: `running` → `run`, `products` → `product`.

### Snippet generation

`ts_headline()` is the PostgreSQL function that finds and marks matching terms in text:

```
Options used:
  StartSel=<<        — delimiter before each match
  StopSel=>>         — delimiter after each match
  MaxFragments=2     — up to 2 separate excerpts per result
  MaxWords=40        — each excerpt is up to 40 words
  MinWords=15        — minimum window around a match

Input cap: left(content, 5000)
```

The 5 KB cap is important. `ts_headline` is not designed to process full documents — it parses the entire input to find good extraction windows. On a 50 KB document it can take several hundred milliseconds. By capping at 5 KB (approximately the first chunk), it stays under 5 ms.

The `<<` / `>>` delimiters are rendered as highlighted spans in the frontend.

### Count query

The count query runs in parallel with the main query:

```ts
const [results, countResult] = await Promise.all([
  db.query(buildFtsQuery(whereClause, limitParam, offsetParam), values),
  db.query(buildFtsCountQuery(whereClause), countValues),
])
```

`buildFtsCountQuery` uses the same CTE and WHERE clause but omits `ts_rank_cd`, `ts_headline`, and the LATERAL join for chunk content — it only needs to know which documents match, not how well. This makes it significantly cheaper than the main query.

---

## Tier 3 — Fuzzy fallback

When FTS returns 0 results (the query has no matches in the index), the fuzzy search runs:

```sql
SELECT
  d.id,
  d.title,
  d.url,
  d.kind,
  d.ext,
  d.mtime,
  d.connector_id,
  similarity(d.title, $2) AS score
FROM documents d
WHERE d.org_id = $1
  AND similarity(d.title, $2) > 0.1
  -- ... additional filters
ORDER BY score DESC
LIMIT $3 OFFSET $4
```

### Why title-only

The obvious extension would be to also check `similarity(chunk.content, q)`. The reason it isn't done:

`similarity()` inside a subquery over `document_chunks` cannot use a GIN index. PostgreSQL must compute the trigram similarity between the query and every chunk's content — a sequential scan. With 1.2 million chunks (1,000 documents × ~1,200 chunks average), this runs for 30–90 seconds.

`similarity(d.title, q)` over the `documents` table uses `ix_documents_title_trgm` (a GIN `gin_trgm_ops` index). The index maps trigrams to row IDs, making the scan fast even on large datasets.

Title-only fuzzy catches the most common cases:
- Typos in document names: `roadmpa` → matches "Q3 Roadmap"
- Partial names: `road` → matches "Product Roadmap"
- Non-English words that the English stemmer doesn't recognise

### Trigram similarity

The `pg_trgm` extension breaks strings into 3-character n-grams and measures how many they share:

```
"roadmap" → {roa, oad, adm, dma, map}
"roadmpa" → {roa, oad, adm, dmp, mpa}

shared: {roa, oad, adm}  →  3 / (5 + 5 - 3) = 0.43
```

Threshold `> 0.1` is intentionally low to catch partial matches. The `ORDER BY score DESC` puts the best matches first.

### Fuzzy does not generate snippets

In fuzzy mode there is no `ts_headline`. The `snippet` field in the response returns the document title. This is intentional — there is no guarantee a fuzzy title match corresponds to any particular location in the body content.

---

## Filters

Both FTS and fuzzy use the same filter builder. Filters are injected into the parameterised WHERE clause:

| API parameter | SQL condition |
|---|---|
| `org` (always) | `d.org_id = $1` |
| `connector_id` | `d.connector_id = $N` |
| `kind` | `d.kind = $N` — `document`, `page`, `message`, `spreadsheet`, `presentation` |
| `date_from` | `d.mtime >= $N` |
| `date_to` | `d.mtime <= $N` |

Filters work in both FTS and fuzzy mode because they are applied on the `documents` table before ranking.

---

## Pagination

```
GET /orgs/:slug/search?q=roadmap&limit=20&offset=40
```

- Default `limit = 20`, `offset = 0`
- The response always includes `total` (the count query result) so the frontend can calculate total pages: `Math.ceil(total / limit)`
- In the frontend, `useSearch()` manages `page` state and computes `offset = (page - 1) * pageSize`

---

## Search vector maintenance

`search_vector` columns are **never** computed at query time. They are written by the indexer:

- `documents.search_vector` = `to_tsvector('english', title)` — updated after every upsert
- `document_chunks.search_vector` = `to_tsvector('english', content)` — set at chunk insert time

The `'english'` dictionary applies:
1. Stop word removal
2. Snowball stemming
3. Position recording

GIN indexes on both columns:

```sql
-- document-level: used in the outer WHERE and the setweight combine
CREATE INDEX ix_documents_search_vector
  ON documents USING GIN (search_vector);

-- chunk-level: used in the LATERAL join pre-filter
CREATE INDEX ix_chunks_search_vector
  ON document_chunks USING GIN (search_vector);

-- title trigrams: used in fuzzy fallback
CREATE INDEX ix_documents_title_trgm
  ON documents USING GIN (title gin_trgm_ops);
```

If these indexes are missing (e.g. after restoring from a dump), search still works but will be very slow. Recreate them with `CREATE INDEX CONCURRENTLY` to avoid locking.

---

## Full API shape

```
GET /api/v1/orgs/:slug/search
  ?q=<query>
  [&connector_id=<uuid>]
  [&kind=document|page|message|spreadsheet|presentation]
  [&date_from=<ISO timestamp>]
  [&date_to=<ISO timestamp>]
  [&limit=<number>]     default: 20
  [&offset=<number>]    default: 0
```

**Response:**

```json
{
  "query": "product roadmap",
  "total": 47,
  "limit": 20,
  "offset": 0,
  "results": [
    {
      "id": "b3a1c2d4-...",
      "title": "Q3 Product Roadmap",
      "url": "https://docs.google.com/document/d/1abc.../edit",
      "kind": "document",
      "ext": null,
      "snippet": "…the <<product roadmap>> for Q3 includes three…  …updated the <<roadmap>> after the all-hands…",
      "score": 0.387,
      "mtime": "2024-03-10T09:00:00.000Z",
      "connector_kind": "google_drive",
      "connector_name": "Company Drive"
    }
  ]
}
```

**Error responses:**

| Status | Cause |
|---|---|
| `400` | Missing `q` parameter |
| `401` | Missing or expired access token |
| `403` | Caller is not a member of the org |
