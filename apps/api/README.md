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
cd apps/api
python -m venv .venv
source .venv/bin/activate
pip install -e .[dev]
```

Application variables still come from the process environment, but local
development can now populate them through the repo's generic secrets bootstrap
runner.

## Run with Secrets Bootstrap
Provide the bootstrap variables required by the current secrets provider from
your shell, CI, or container runtime. The current provider is Infisical, but the
entrypoint stays the same even if the provider changes later.

```bash
cd apps/api
node ../../scripts/run-with-secrets.mjs -- uv run uvicorn app.main:app --reload --port 8000
```

## Run worker
```bash
cd apps/api
node ../../scripts/run-with-secrets.mjs -- uv run celery -A app.workers.celery_app worker -l info -Q sync_orchestration,sync_documents
```

Use [docs/runtime-configuration.md](../../docs/runtime-configuration.md) as the
variable checklist for both the bootstrap settings and the application variables
that need to exist in the current secrets service. For integrations you are not
using yet, store empty-string values so startup validation still has an explicit
value to read.

## Migration rule
Do not route production traffic here until parity tests pass.
