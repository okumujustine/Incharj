from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, ORJSONResponse

from app.api.v1.router import api_router
from app.core.config import settings
from app.errors import HttpError


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


@app.exception_handler(HttpError)
async def http_error_handler(request: Request, exc: HttpError) -> JSONResponse:
    return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)


@app.on_event("startup")
async def on_startup() -> None:
    import logging

    from app.connectors.registry import load_connectors
    load_connectors()

    from app.db.pool import get_pool
    pool = await get_pool()

    try:
        from app.sql.schema import DDL_EXTENSIONS, DDL_INITIALIZE
        async with pool.acquire() as conn:
            for ext in DDL_EXTENSIONS:
                await conn.execute(f'CREATE EXTENSION IF NOT EXISTS "{ext}"')
            await conn.execute(DDL_INITIALIZE)
    except Exception as exc:
        logging.getLogger("startup").warning("Schema init skipped: %s", exc)


@app.get("/health")
async def health() -> dict[str, bool]:
    return {"ok": True}


app.include_router(api_router, prefix=settings.api_prefix)
