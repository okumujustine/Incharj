# Incharj Python Backend (Migration Scaffold)

This folder is a parallel FastAPI migration target. It does not replace the existing Node backend yet.

## Why this exists
- Preserve existing behavior while migrating incrementally.
- Enable side-by-side validation endpoint by endpoint.

## Current migration mode
- FastAPI route surface is fully ported for the existing `/api/v1` endpoints.
- Each endpoint currently forwards to the Node backend (`legacy_backend_base_url`) for behavior parity.
- This allows immediate adoption of Python API routing without changing business behavior.
- Internal handlers can now be replaced route-by-route behind stable Python paths.

## Tool mapping
- Fastify -> FastAPI
- BullMQ -> Celery (Redis broker)
- Bull Board -> Flower
- pg -> SQLAlchemy + asyncpg
- Zod -> Pydantic v2
- pino -> structlog
- node fetch -> httpx
- custom retries -> tenacity
- SQL bootstrap -> Alembic

## Run locally
```bash
cd backend_py
python -m venv .venv
source .venv/bin/activate
pip install -e .[dev]
uvicorn app.main:app --reload --port 8100
```

## Run worker
```bash
cd backend_py
source .venv/bin/activate
celery -A app.workers.celery_app.celery_app worker -l info
```

## Migration rule
Do not route production traffic here until parity tests pass.
