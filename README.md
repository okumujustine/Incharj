# Incharj

## Setup

```bash
cp .env.example .env
```

Fill in the required values in `.env`:

```bash
# Generate APP_SECRET
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

# Generate ENCRYPTION_KEY (must be 32 bytes)
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Add OAuth credentials for the providers you want to use (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, etc.).

```bash
docker compose -f docker-compose.dev.yml up
```

| Service  | URL                   |
| -------- | --------------------- |
| Frontend | http://localhost:3000 |
| API      | http://localhost:8000 |
| Postgres | localhost:5432        |

## Local dev (without Docker)

Requires Node 20+ and a running PostgreSQL instance with `pg_trgm` and `pgcrypto` extensions.

```bash
# Backend API
cd backend && npm install && npm run dev

# Background worker (separate terminal)
cd backend && npm run worker

# Frontend
cd frontend && npm install && npm run dev
```

## Useful commands

```bash
cd backend && npm run typecheck   # type-check without building
cd backend && npm run build       # production build
cd frontend && npm run build      # production build
```
