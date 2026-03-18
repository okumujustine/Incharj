# Getting Started

This guide gets you from zero to a running Incharj instance — database initialized, all services healthy, and your first document indexed and searchable.

---

## Prerequisites

- **Docker Desktop** 4.x or later (includes Docker Compose v2)
- **Node.js 20+** only if you want to run without Docker

---

## Run with Docker (recommended)

### 1. Clone and configure

```bash
git clone https://github.com/okumujustine/Incharj
cd Incharj
cp .env.example .env
```

### 2. Generate secrets

```bash
# APP_SECRET — JWT signing key (48 random bytes)
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

# ENCRYPTION_KEY — AES-GCM key for OAuth credential storage (must be 32 bytes)
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Paste the output values into `.env`.

### 3. Start all services

```bash
docker compose -f docker-compose.dev.yml up
```

First run downloads images and installs dependencies. Subsequent starts are fast.

### 4. Verify everything is up

| Service | URL | What to check |
|---|---|---|
| Frontend | http://localhost:3000 | Login page loads |
| API | http://localhost:8000/health | `{ "ok": true }` |
| Docs | http://localhost:4173 | This documentation |
| PostgreSQL | localhost:5432 | (internal — no browser check) |
| Redis | localhost:6379 | (internal — no browser check) |

The database schema is created automatically on first startup (`db.ts` calls `initializeDatabase()` which runs the DDL in `sql/schema.ts`). No migration step needed.

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string, e.g. `postgres://user:pass@localhost:5432/incharj` |
| `REDIS_URL` | Yes | Redis connection string, e.g. `redis://localhost:6379` |
| `APP_SECRET` | Yes | JWT signing secret (48+ random bytes, base64url) |
| `ENCRYPTION_KEY` | Yes | AES-GCM key for OAuth credential storage (exactly 32 bytes, base64url) |
| `FRONTEND_URL` | Yes | Used for OAuth redirect URIs, e.g. `http://localhost:3000` |
| `GOOGLE_CLIENT_ID` | Optional | Google Drive connector |
| `GOOGLE_CLIENT_SECRET` | Optional | Google Drive connector |
| `NOTION_CLIENT_ID` | Optional | Notion connector |
| `NOTION_CLIENT_SECRET` | Optional | Notion connector |
| `SLACK_CLIENT_ID` | Optional | Slack connector |
| `SLACK_CLIENT_SECRET` | Optional | Slack connector |

Connectors with missing credentials simply cannot be created — the rest of the system works fine without them.

---

## Setting up OAuth apps

You only need to configure the connectors you plan to use.

### Google Drive

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → Create a new project (or use existing)
2. **APIs & Services → Enable APIs** → enable **Google Drive API**
3. **APIs & Services → OAuth consent screen**
   - User Type: **External**
   - Fill in app name, support email
   - Scopes: add `https://www.googleapis.com/auth/drive.readonly`
   - Test users: add the Google accounts you'll connect
4. **APIs & Services → Credentials → Create credentials → OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Authorized redirect URIs: `http://localhost:3000/oauth/google_drive/callback`
   - (For production: `https://yourdomain.com/oauth/google_drive/callback`)
5. Copy **Client ID** → `GOOGLE_CLIENT_ID`, **Client secret** → `GOOGLE_CLIENT_SECRET`

### Notion

1. Go to [Notion Developers](https://developers.notion.com/) → **New integration** (or use existing)
2. Type: **Public** (required for OAuth — private integrations don't support user OAuth flow)
3. Redirect URI: `http://localhost:3000/oauth/notion/callback`
4. Capabilities: **Read content**
5. Copy **OAuth client ID** → `NOTION_CLIENT_ID`, **OAuth client secret** → `NOTION_CLIENT_SECRET`

### Slack

1. Go to [Slack API](https://api.slack.com/apps) → **Create New App → From scratch**
2. **OAuth & Permissions → Redirect URLs**: add `http://localhost:3000/oauth/slack/callback`
3. **OAuth & Permissions → Bot Token Scopes**: add
   - `channels:history`, `channels:read`
   - `groups:history`, `groups:read`
   - `users:read`
4. **Basic Information** → copy **Client ID** → `SLACK_CLIENT_ID`, **Client Secret** → `SLACK_CLIENT_SECRET`

---

## First run walkthrough

Once the services are up:

### 1. Create an account

Open http://localhost:3000 → click **Sign up** → fill in name, email, password.

This creates a `users` row and a default `organizations` row. You are automatically assigned the `owner` role.

### 2. Connect a data source

In the sidebar → **Connectors** → **Add connector** → choose Google Drive, Notion, or Slack.

The OAuth flow opens the provider's consent screen in a new window. After approving:
- Credentials are encrypted and stored in `connectors.credentials`
- The connector's `has_credentials` flag is set to `true`
- The dispatch worker (running every 30 seconds) picks up the connector and enqueues a sync job

### 3. Watch the first sync

**Connectors** → click the connector → **Sync status** shows the current sync job.

On the first sync:
- `last_synced_at` is `null` → the connector fetches all documents (no date filter)
- Every document is hashed and written to `documents` + `document_chunks`
- `sync_jobs.status` moves from `pending` → `running` → `done`

Large workspaces (thousands of documents) can take several minutes on the first sync.

### 4. Search

Once the sync is done, open the search bar and type. Results should appear immediately.

If no results come back:
- Check `sync_jobs` — did the job complete (`status = 'done'`)?
- Check `docs_errored` — were documents failing to fetch?
- Run `SELECT count(*) FROM documents;` to confirm rows were written

---

## Run without Docker

You need PostgreSQL 16 and Redis 7 running locally. Then:

```bash
# Install all dependencies from root
npm install

# Start the API server
cd backend && npm run dev

# Start the worker (separate terminal)
cd backend && npm run worker

# Start the frontend (separate terminal)
cd frontend && npm run dev

# Start the docs (separate terminal)
cd docs && npm run dev
```

Make sure `DATABASE_URL` and `REDIS_URL` in your `.env` point to your local instances.

---

## Common issues

### Services start but frontend shows a blank page

The frontend Vite dev server has hot-module reloading. If the initial build fails, check the `frontend` container logs:

```bash
docker compose -f docker-compose.dev.yml logs frontend
```

### API returns 500 on login

Usually a missing or malformed `DATABASE_URL`. Check:

```bash
docker compose -f docker-compose.dev.yml logs api
```

If you see `password authentication failed`, the database credentials in `DATABASE_URL` don't match what PostgreSQL was initialised with.

### OAuth redirect URI mismatch

The redirect URI registered in Google/Notion/Slack must match exactly what the backend sends. If `FRONTEND_URL` is set to `http://localhost:3000`, the backend sends:

```
redirect_uri = http://localhost:3000/oauth/google_drive/callback
```

That string must appear verbatim in the OAuth app's allowed redirect URIs.

### Sync job stuck in `pending`

The worker container may not be running. Check:

```bash
docker compose -f docker-compose.dev.yml ps
```

The `worker` service should show `Up`. If it crashed, check its logs — usually a Redis connection issue or an unhandled error on startup.

### GIN indexes missing after restore

If you restored from a dump that skipped indexes, search still works but will be very slow. Recreate them without locking:

```sql
CREATE INDEX CONCURRENTLY ix_documents_search_vector
  ON documents USING GIN (search_vector);

CREATE INDEX CONCURRENTLY ix_chunks_search_vector
  ON document_chunks USING GIN (search_vector);

CREATE INDEX CONCURRENTLY ix_documents_title_trgm
  ON documents USING GIN (title gin_trgm_ops);
```

---

## Verifying the core pipeline

To confirm the full loop is working end-to-end, run these queries against the database:

```sql
-- How many documents have been indexed?
SELECT count(*) FROM documents;

-- How many chunks (the searchable units)?
SELECT count(*) FROM document_chunks;

-- Recent sync job results
SELECT connector_id, status, docs_indexed, docs_skipped, docs_errored, finished_at
FROM sync_jobs
ORDER BY finished_at DESC
LIMIT 5;

-- Does FTS work on a known title word?
SELECT title, ts_rank_cd(search_vector, websearch_to_tsquery('english', 'your_keyword')) AS score
FROM documents
WHERE search_vector @@ websearch_to_tsquery('english', 'your_keyword')
ORDER BY score DESC
LIMIT 5;
```
