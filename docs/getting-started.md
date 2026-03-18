# Getting Started

## Prerequisites

- Docker and Docker Compose
- Node 20+ (for local development without Docker)
- Redis 7+ (for the BullMQ job queue — included in Docker setup)

## Running with Docker (recommended)

```bash
cp .env.example .env
# Fill in OAuth credentials and secrets (see Environment Variables below)

docker compose -f docker-compose.dev.yml up
```

Services start at:
- Frontend: http://localhost:3000
- API: http://localhost:8000
- PostgreSQL: localhost:5432
- Redis: localhost:6379

The database schema is created automatically on first API or worker startup via `initializeDatabase()` in `db.ts`. No separate migration step is needed.

## Environment variables

Copy `.env.example` to `.env` and fill in the following:

### Required

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string (e.g. `redis://localhost:6379`) |
| `APP_SECRET` | Secret for JWT signing (any long random string) |
| `ENCRYPTION_KEY` | Key for encrypting OAuth credentials at rest (32 bytes, base64url) |

Generate safe values:
```bash
# APP_SECRET
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

# ENCRYPTION_KEY (32 bytes → base64url)
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

### OAuth credentials (per connector)

| Variable | Description |
|---|---|
| `GOOGLE_CLIENT_ID` | Google OAuth app client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth app client secret |
| `NOTION_CLIENT_ID` | Notion integration client ID |
| `NOTION_CLIENT_SECRET` | Notion integration client secret |
| `SLACK_CLIENT_ID` | Slack app client ID |
| `SLACK_CLIENT_SECRET` | Slack app client secret |

### Optional

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8000` | API server port |
| `FRONTEND_URL` | `http://localhost:3000` | Used for OAuth redirect URIs and CORS |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `15` | JWT access token lifetime |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `30` | Refresh token lifetime |

## Running locally without Docker

```bash
# Start PostgreSQL (must have pg_trgm and pgcrypto extensions) and Redis separately

# Backend API
cd backend
npm install
npm run dev        # API on :8000

# Worker (separate terminal — requires Redis)
cd backend
npm run worker

# Frontend
cd frontend
npm install
npm run dev        # Vite dev server on :5173
```

> The worker connects to Redis via `REDIS_URL`. Make sure Redis is running before starting the worker.

## Useful commands

```bash
# Type-check backend without building
cd backend && npm run typecheck

# Build backend for production
cd backend && npm run build

# Build frontend for production
cd frontend && npm run build
```
