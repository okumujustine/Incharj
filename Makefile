.PHONY: help dev dev-services stop migrate db-shell api-shell worker frontend \
        build up down logs lint test generate-keys

# ── Help ──────────────────────────────────────────────────────────────────────
help:
	@echo ""
	@echo "  Incharj — Development Commands"
	@echo ""
	@echo "  Setup:"
	@echo "    make setup          Install all deps (backend + frontend)"
	@echo "    make generate-keys  Generate SECRET_KEY and FERNET_KEY"
	@echo "    make migrate        No-op (DB schema auto-initializes on startup)"
	@echo ""
	@echo "  Development:"
	@echo "    make dev-services   Start postgres + redis via Docker"
	@echo "    make api            Start TypeScript API with hot-reload"
	@echo "    make worker         Start TypeScript sync worker"
	@echo "    make frontend       Start Vite dev server"
	@echo "    make dev            Start everything (3 terminals required)"
	@echo ""
	@echo "  Docker (production):"
	@echo "    make build          Build all Docker images"
	@echo "    make up             Start all services"
	@echo "    make down           Stop all services"
	@echo "    make logs           Tail all logs"
	@echo ""

# ── Setup ─────────────────────────────────────────────────────────────────────
setup:
	@echo "Installing backend deps..."
	cd backend && npm install
	@echo "Installing frontend deps..."
	cd frontend && npm install
	@echo "Done. Copy .env.example to .env and fill in values."
	@cp -n .env.example .env 2>/dev/null || true

generate-keys:
	@echo "SECRET_KEY=$$(openssl rand -hex 32)"
	@echo "FERNET_KEY=$$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=')"

# ── Development ───────────────────────────────────────────────────────────────
dev-services:
	docker compose -f docker-compose.dev.yml up -d
	@echo "Postgres on :5432, Redis on :6379"

migrate:
	@echo "Database schema now auto-initializes when the TypeScript API starts."

api:
	cd backend && npm run dev

worker:
	cd backend && npm run worker

frontend:
	cd frontend && npm run dev

db-shell:
	docker compose -f docker-compose.dev.yml exec postgres psql -U incharj -d incharj_dev

api-shell:
	cd backend && node -e "console.log('TypeScript backend available')"

# ── Docker production ─────────────────────────────────────────────────────────
build:
	docker compose build

up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f

# ── Quality ───────────────────────────────────────────────────────────────────
lint:
	cd backend && npm run typecheck
	cd frontend && npm run lint

test:
	cd backend && npm run build
