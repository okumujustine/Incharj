.PHONY: help setup dev-services api worker web bot db-shell build up down logs generate-keys

SECRETS_RUN = node ./scripts/run-with-secrets.mjs --

help:
	@echo ""
	@echo "  Incharj — Development Commands"
	@echo ""
	@echo "  Setup:"
	@echo "    make setup           Install all dependencies"
	@echo "    make generate-keys   Generate APP_SECRET and ENCRYPTION_KEY values"
	@echo ""
	@echo "  Secrets Bootstrap:"
	@echo "    SECRETS_PROVIDER"
	@echo "    Current provider: infisical"
	@echo "    INFISICAL_CLIENT_ID"
	@echo "    INFISICAL_CLIENT_SECRET"
	@echo "    INFISICAL_PROJECT_ID"
	@echo "    INFISICAL_ENVIRONMENT"
	@echo "    INFISICAL_SECRET_PATH"
	@echo "    INFISICAL_SITE_URL (optional)"
	@echo ""
	@echo "  Development (run each in its own terminal):"
	@echo "    make dev-services    Start postgres + redis via Docker"
	@echo "    make api             Start FastAPI with hot-reload  (:8000)"
	@echo "    make worker          Start Celery worker"
	@echo "    make web             Start Vite dev server          (:3000)"
	@echo "    make bot             Start Slack bot"
	@echo ""
	@echo "  Docker:"
	@echo "    make build           Build all Docker images"
	@echo "    make up              Start all services"
	@echo "    make down            Stop all services"
	@echo "    make logs            Tail all logs"
	@echo ""
	@echo "  Utilities:"
	@echo "    make db-shell        Open psql shell"
	@echo ""

setup:
	@echo "Installing API deps (uv)..."
	cd apps/api && uv sync
	@echo "Installing bot deps (uv)..."
	cd apps/bot && uv sync
	@echo "Installing web deps (npm)..."
	cd apps/web && npm install

generate-keys:
	@echo "APP_SECRET=$$(openssl rand -hex 32)"
	@echo "ENCRYPTION_KEY=$$(python3 -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())')"

dev-services:
	docker compose -f docker-compose.dev.yml up -d postgres redis
	@echo "Postgres :5432  Redis :6379"

api:
	cd apps/api && node ../../scripts/run-with-secrets.mjs -- uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

worker:
	cd apps/api && node ../../scripts/run-with-secrets.mjs -- uv run celery -A app.workers.celery_app worker --loglevel=info -Q sync_orchestration,sync_documents

web:
	cd apps/web && node ../../scripts/run-with-secrets.mjs -- npm run dev

bot:
	cd apps/bot && node ../../scripts/run-with-secrets.mjs -- uv run python main.py

db-shell:
	docker compose -f docker-compose.dev.yml exec postgres psql -U incharj -d incharj_dev

build:
	docker compose -f docker-compose.dev.yml build

up:
	$(SECRETS_RUN) docker compose -f docker-compose.dev.yml up -d

down:
	docker compose -f docker-compose.dev.yml down

logs:
	docker compose -f docker-compose.dev.yml logs -f
