# Getting Started

## Prerequisites

- Docker and Docker Compose
- Node 20+ (for running without Docker)

## Run with Docker

```bash
cp .env.example .env
# fill in secrets and OAuth credentials (see below)

docker compose -f docker-compose.dev.yml up
```

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| API | http://localhost:8000 |
| Docs | http://localhost:4173 |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |

The database schema is created automatically on first startup — no migration step needed.

---

## Required environment variables

```bash
# Generate these two values:
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"  # APP_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"  # ENCRYPTION_KEY
```

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `APP_SECRET` | JWT signing secret |
| `ENCRYPTION_KEY` | AES-GCM key for OAuth credential storage (32 bytes, base64url) |
| `GOOGLE_CLIENT_ID` / `SECRET` | Google Drive OAuth app |
| `NOTION_CLIENT_ID` / `SECRET` | Notion integration |
| `SLACK_CLIENT_ID` / `SECRET` | Slack app |
| `FRONTEND_URL` | Used for OAuth redirect URIs (default: `http://localhost:3000`) |

---

## Run without Docker

```bash
# Backend API  (requires PostgreSQL + Redis running locally)
cd backend && npm install && npm run dev

# Worker  (separate terminal)
cd backend && npm run worker

# Frontend
cd frontend && npm install && npm run dev

# Docs
cd docs && npm install && npm run dev
```
