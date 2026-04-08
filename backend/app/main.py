import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, ORJSONResponse
from pgvector.asyncpg import register_vector
from sqlalchemy import event

from app.api.v1.router import api_router
from app.connectors.registry import load_connectors
from app.core.config import settings
from app.db.engine import get_engine
from app.db.pool import get_pool
from app.errors import HttpError
from app.sql.schema import DDL_EXTENSIONS, DDL_INITIALIZE


app = FastAPI(
    title="Incharj API",
    version="1.0.0",
    default_response_class=ORJSONResponse,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url, "http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(exc_class_or_status_code=HttpError)
async def http_error_handler(request: Request, exc: HttpError) -> JSONResponse:
    return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)


@event.listens_for(get_engine().sync_engine, "connect")
def _register_pgvector(dbapi_conn, _record):
    dbapi_conn.run_until_complete(register_vector(dbapi_conn))


@app.on_event("startup")
async def on_startup() -> None:
    load_connectors()

    pool = await get_pool()
    try:
        async with pool.acquire() as conn:
            for ext in DDL_EXTENSIONS:
                await conn.execute(stmt_or_sql=f'CREATE EXTENSION IF NOT EXISTS "{ext}"')
            await conn.execute(stmt_or_sql=DDL_INITIALIZE)
    except Exception as exc:
        logging.getLogger(name="startup").warning(msg="Schema init skipped: %s", args= exc)


@app.get("/health")
async def health() -> dict[str, bool]:
    return {"ok": True}


app.include_router(api_router, prefix=settings.api_prefix)
