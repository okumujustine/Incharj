# Database

## PostgreSQL extensions

| Extension | Purpose |
|---|---|
| `pgcrypto` | `gen_random_uuid()` for UUID primary keys |
| `pg_trgm` | Trigram similarity search + GIN indexes |
| `unaccent` | Accent-insensitive search (available for use in FTS configs) |

The schema is applied automatically on first startup via `initializeDatabase()` in `db.ts` using `CREATE TABLE IF NOT EXISTS` — safe to run on every restart.

---

## Tables

### `users`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | `gen_random_uuid()` |
| `email` | VARCHAR(320) UNIQUE | Login identifier |
| `hashed_password` | TEXT | bcrypt hash |
| `full_name` | VARCHAR(255) | |
| `avatar_url` | TEXT | |
| `is_verified` | BOOLEAN | Email verification flag |
| `is_active` | BOOLEAN | Soft disable |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

### `organizations`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `slug` | VARCHAR(100) UNIQUE | URL-safe identifier |
| `name` | VARCHAR(255) | |
| `plan` | VARCHAR(50) | `free` default |
| `settings` | JSONB | Arbitrary org config |

### `memberships`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `org_id` | UUID FK → organizations | Cascade delete |
| `user_id` | UUID FK → users | Cascade delete |
| `role` | VARCHAR(50) | `owner`, `admin`, `member` |
| `joined_at` | TIMESTAMPTZ | |

Unique constraint: `(org_id, user_id)`.

### `invitations`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `org_id` | UUID FK → organizations | Cascade delete |
| `invited_by` | UUID FK → users | SET NULL on delete |
| `email` | VARCHAR(320) | |
| `role` | VARCHAR(50) | Role granted on acceptance |
| `token` | VARCHAR(128) UNIQUE | Random token sent in invitation link |
| `accepted_at` | TIMESTAMPTZ | NULL until accepted |
| `expires_at` | TIMESTAMPTZ | `now() + 7 days` |

Unique constraint: `(org_id, email)` — one pending invite per email per org.

### `sessions`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `user_id` | UUID FK → users | Cascade delete |
| `refresh_token` | TEXT UNIQUE | Opaque token stored in httpOnly cookie |
| `user_agent` | TEXT | |
| `ip_address` | VARCHAR(45) | IPv4/IPv6 |
| `expires_at` | TIMESTAMPTZ | |

### `connectors`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `org_id` | UUID FK → organizations | |
| `created_by` | UUID FK → users | SET NULL on delete |
| `kind` | VARCHAR(50) | `google_drive`, `notion`, `slack` |
| `name` | VARCHAR(255) | User-supplied label |
| `status` | VARCHAR(50) | `idle`, `running`, `error`, `paused` |
| `credentials` | TEXT | AES-GCM encrypted JSON |
| `config` | JSONB | Connector-specific settings |
| `has_credentials` | BOOLEAN | True once OAuth tokens have been stored |
| `sync_cursor` | TEXT | Pagination cursor (connector-specific) |
| `last_synced_at` | TIMESTAMPTZ | Used for incremental sync filter (passed to connector as ISO string) |
| `last_error` | TEXT | Last error message |
| `sync_frequency` | VARCHAR(50) | PostgreSQL interval string, e.g. `'1 hour'` |
| `doc_count` | INTEGER | Total indexed documents (updated after each sync) |
| `config` | JSONB | Connector-specific settings, e.g. `{ "max_documents": 500 }` to cap docs per sync |

### `sync_jobs`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `connector_id` | UUID FK → connectors | Cascade delete |
| `org_id` | UUID FK → organizations | |
| `triggered_by` | VARCHAR(50) | `manual` or `scheduled` |
| `status` | VARCHAR(50) | `pending`, `running`, `done`, `failed` |
| `started_at` / `finished_at` | TIMESTAMPTZ | |
| `docs_indexed` | INTEGER | New or changed documents written |
| `docs_skipped` | INTEGER | Unchanged documents (hash match) |
| `docs_errored` | INTEGER | Documents that failed individually |
| `error_message` | TEXT | Set when `status = 'failed'` |
| `meta` | JSONB | Reserved for future metadata |

A job with `status = 'done'` and `docs_errored > 0` is displayed as **partial** in the UI.

### `documents`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `org_id` | UUID FK → organizations | |
| `connector_id` | UUID FK → connectors | Cascade delete |
| `external_id` | VARCHAR(512) | Source system document ID |
| `url` | TEXT | Link back to source |
| `title` | TEXT | |
| `kind` | VARCHAR(100) | `doc`, `sheet`, `slide`, `page`, `message`, etc. |
| `ext` | VARCHAR(20) | File extension |
| `author_name` / `author_email` | VARCHAR | |
| `content_hash` | VARCHAR(64) | SHA-256 of content — used for skip-on-unchanged |
| `word_count` | INTEGER | |
| `mtime` | TIMESTAMPTZ | Source modification time |
| `indexed_at` | TIMESTAMPTZ | When Incharj last wrote it |
| `metadata` | JSONB | Connector-specific extra fields |
| `search_vector` | tsvector | Pre-computed FTS vector (title) |

Unique constraint: `(connector_id, external_id)` — upsert key.

### `document_chunks`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `document_id` | UUID FK → documents | Cascade delete |
| `org_id` | UUID FK → organizations | |
| `chunk_index` | INTEGER | 0-based order within document |
| `content` | TEXT | 800-token chunk with 100-token overlap |
| `token_count` | INTEGER | Approximate token count |
| `search_vector` | tsvector | Pre-computed FTS vector |

---

## Indexes

| Index | Table | Columns | Type |
|---|---|---|---|
| `ix_users_email` | users | email | btree |
| `ix_organizations_slug` | organizations | slug | btree |
| `ix_memberships_org_id` | memberships | org_id | btree |
| `ix_memberships_user_id` | memberships | user_id | btree |
| `ix_invitations_org_id` | invitations | org_id | btree |
| `ix_sessions_user_id` | sessions | user_id | btree |
| `ix_connectors_org_id` | connectors | org_id | btree |
| `ix_sync_jobs_connector_id` | sync_jobs | connector_id | btree |
| `ix_sync_jobs_org_id` | sync_jobs | org_id | btree |
| `ix_documents_org_id` | documents | org_id | btree |
| `ix_documents_connector_id` | documents | connector_id | btree |
| `ix_documents_title_trgm` | documents | title | GIN (gin_trgm_ops) |
| `ix_documents_search_vector` | documents | search_vector | GIN — fast FTS on documents |
| `ix_chunks_search_vector` | document_chunks | search_vector | GIN — fast FTS on chunks |
| `ix_document_chunks_document_id` | document_chunks | document_id | btree |
| `ix_document_chunks_org_id` | document_chunks | org_id | btree |

---

## Schema management

The DDL lives in `backend/src/sql/schema.ts` as a single `DDL_INITIALIZE` constant. It is applied via `initializeDatabase()` in `backend/src/db.ts` using `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` — idempotent and safe to re-run on every server start. There is no migration tool; for schema changes add `ALTER TABLE` statements to `DDL_INITIALIZE` or manage them manually.
