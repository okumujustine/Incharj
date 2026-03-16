# Project Overview

Incharj is a multi-tenant document intelligence platform. It connects to external sources (Google Drive, Notion, Slack), syncs and indexes their content into PostgreSQL, and exposes a hybrid full-text + fuzzy search API across all indexed documents.

## What it does

1. **Connect** — Users authenticate external services via OAuth and create connectors
2. **Sync** — A background worker polls for due syncs and indexes documents into PostgreSQL
3. **Search** — A hybrid search engine (FTS + trigram similarity) finds documents across all connectors

## Tech stack

| Layer | Technology |
|---|---|
| Backend API | Fastify 5 (TypeScript) |
| Background worker | Node.js polling process |
| Database | PostgreSQL 16 (pg_trgm, pgcrypto, unaccent) |
| Auth | JWT (jose) + bcryptjs + httpOnly refresh cookie |
| Frontend | React 18, React Router 6, TanStack Query, Zustand |
| Styling | Tailwind CSS |
| Runtime | Docker (dev), Node 20 |

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

- **No Redis / no queue broker** — The worker polls PostgreSQL directly using `FOR UPDATE SKIP LOCKED`. Simple, no extra infrastructure.
- **Raw SQL** — All queries live in `backend/src/sql/`. No ORM. Each query is a named constant or builder function — easy to read, easy to tune.
- **Hybrid search** — Full-text search first (stemming, weighting, time decay). Falls back to trigram similarity if FTS returns zero results.
- **Per-document transaction isolation** — Each document ingestion runs in its own PostgreSQL transaction so one failure doesn't abort the whole sync.
- **Incremental sync** — Connectors receive `last_synced_at` in their config and filter at the source API level (e.g. Google Drive `modifiedTime >` filter).
