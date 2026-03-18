# Project Overview

Incharj is a multi-tenant document intelligence platform. It connects to external sources (Google Drive, Notion, Slack), syncs and indexes their content into PostgreSQL, and exposes a hybrid full-text + fuzzy search API across all indexed documents.

## What it does

1. **Connect** — Users authenticate external services via OAuth and create connectors
2. **Sync** — A background worker processes jobs from a Redis queue and indexes documents into PostgreSQL
3. **Search** — A hybrid search engine (FTS + trigram similarity) finds documents across all connectors
4. **Browse** — A files page lists all indexed documents with connector/kind filters and pagination

## Tech stack

| Layer | Technology |
|---|---|
| Backend API | Fastify 5 (TypeScript) |
| Background worker | Node.js + BullMQ (Redis-backed job queue) |
| Job queue | Redis 7 |
| Database | PostgreSQL 16 (pg_trgm, pgcrypto, unaccent) |
| Auth | JWT (jose) + bcryptjs + httpOnly refresh cookie |
| Frontend | React 18, React Router 6, TanStack Query, Zustand |
| Styling | Tailwind CSS (light theme default, dark toggle via CSS variables) |
| Runtime | Docker (dev + prod), Node 20 |

## Repository layout

```
.
├── backend/          Node.js/TypeScript API + background worker
├── frontend/         React SPA
├── docs/             This documentation
├── docker-compose.dev.yml
├── docker-compose.yml
├── nginx.conf
└── Makefile
```

## Key design decisions

- **BullMQ + Redis for job queue** — Sync jobs are enqueued into a Redis-backed BullMQ queue. The dispatch worker runs every 30 seconds to enqueue due syncs; a separate sync worker (concurrency=1) processes them.
- **Raw SQL** — All queries live in `backend/src/sql/`. No ORM. Each query is a named constant or builder function — easy to read, easy to tune.
- **Hybrid search** — Full-text search first (stemming, weighting, time decay, GIN indexes). Stop words short-circuit immediately. Falls back to trigram similarity on title if FTS returns zero results.
- **Per-document transaction isolation** — Each document ingestion runs in its own PostgreSQL transaction so one failure doesn't abort the whole sync.
- **Incremental sync** — Connectors receive `last_synced_at` (as ISO string) in their config and filter at the source API level (e.g. Google Drive `modifiedTime >` filter).
- **Content hash** — SHA-256 of `title::content` is compared before re-indexing, so unchanged documents are skipped and title-only renames trigger a re-index.
- **Encrypted credentials** — OAuth tokens from external providers are AES-GCM encrypted at rest using `ENCRYPTION_KEY`.
