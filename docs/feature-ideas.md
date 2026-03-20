# Feature Ideas: Search, Semantic Retrieval, and RAG

## Context
Current search behavior is hybrid rerank:

1. Lexical retrieval runs first (FTS, then fuzzy fallback).
2. Semantic embeddings rerank lexical candidates.
3. If lexical retrieval returns zero rows, semantic retrieval does not currently run independently.

This means semantic search is active, but not yet used as a standalone retrieval channel.

---

## Problem Statement
Some documents are indexed and embedded but still hard to retrieve when the query has weak lexical overlap.

Example pattern:
- Query terms and document wording differ strongly.
- Lexical stage returns zero rows.
- Rerank stage never executes because there are no candidates to rerank.

---

## Proposed Features

## 1. Semantic-Only Fallback (High Priority)
When lexical retrieval returns zero or very weak results:

1. Embed the query.
2. Compute similarity against chunk embeddings.
3. Return top-k matched chunks/documents.
4. Optionally blend with any weak lexical results.

Expected impact:
- Better recall for paraphrased, intent-based, and conceptual queries.
- Direct fix for "indexed but not found" cases.

Notes:
- Use existing `document_chunks.embedding` field.
- Add a SQL path that selects by similarity and groups best chunk per document.

---

## 2. Hybrid Dual-Channel Retrieval (Known Pattern)
Run lexical and semantic retrieval in parallel, then fuse rankings.

Suggested approach:
1. Lexical channel: current FTS/fuzzy results.
2. Semantic channel: top-k vector similarity results.
3. Fusion: Reciprocal Rank Fusion (RRF) or weighted rank blending.
4. Final rerank: optional lightweight rerank over merged top N.

Expected impact:
- Exact token matches still win where appropriate.
- Semantic matches rescue paraphrase and intent mismatches.
- Better overall precision-recall balance.

---

## 3. Search Mode Controls (Product UX)
Add explicit search modes without breaking default UX.

Proposed API parameter:
- `search_mode=lexical|semantic|hybrid`

Behavior:
- `lexical`: current FTS/fuzzy only.
- `semantic`: vector retrieval only.
- `hybrid`: both channels + fusion (default).

Benefits:
- Easier debugging and relevance tuning.
- Power users can choose mode by task.

---

## 4. RAG Feature (Retrieval-Augmented Generation)
RAG is not the same as semantic search.

- Semantic search: retrieve/rank relevant documents by meaning.
- RAG: retrieve context first, then generate an answer with an LLM.

Proposed RAG pipeline:
1. User asks a natural-language question.
2. Retrieve top chunks (hybrid retrieval preferred).
3. Build prompt with citations/snippets.
4. Generate answer with LLM.
5. Return answer + cited sources + confidence metadata.

Minimum viable RAG endpoint:
- `POST /orgs/:orgSlug/ask`
- Input: `{ question: string, connector_id?: string, top_k?: number }`
- Output: `{ answer, citations, used_chunks, model, latency_ms }`

Safety and quality requirements:
- Require citations for each major claim.
- Decline confidently when retrieval confidence is low.
- Log retrieval evidence for traceability.

---

## 5. Embedding Backfill and Ops
Current manual backfill is available via:
- `POST /connectors/:connectorId/embed?org=:orgSlug`
- `POST /documents/:documentId/embed?org=:orgSlug`
- `POST /orgs/:orgSlug/embed`

Enhancements to consider:
1. Add progress metrics in UI (embedded chunks, skipped chunks, failures).
2. Add background embed queue for long-running org-wide backfills.
3. Add embed versioning to force controlled re-embedding when model changes.

---

## Implementation Plan (Phased)

## Phase 1
1. Add semantic-only fallback when lexical returns zero.
2. Add search response metadata: retrieval path (`lexical`, `semantic_fallback`, `hybrid`).
3. Add basic tests with paraphrase queries.

## Phase 2
1. Add dual-channel retrieval with RRF fusion.
2. Add `search_mode` query param.
3. Add relevance telemetry (hit counts per channel).

## Phase 3
1. Add RAG endpoint with citations.
2. Add answer quality guardrails.
3. Add observability for retrieval context and token/cost usage.

---

## Success Metrics
1. Recall@k improvement for paraphrase queries.
2. Fewer zero-result searches on indexed corpora.
3. Better top-3 relevance on user-evaluated test sets.
4. RAG answer acceptance rate with citation trust.

---

## Open Questions
1. Should semantic fallback trigger only on zero lexical results, or also on low lexical confidence?
2. Should hybrid fusion be static weights or adaptive by query type?
3. Do we migrate to pgvector ANN index for scale, or keep JSON embedding + app-side similarity first?
4. What LLM/model policy should be used for RAG generation?
