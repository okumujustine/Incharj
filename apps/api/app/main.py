import logging

from app.core.secrets import load_infisical
load_infisical()  # must run before any settings are imported

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, ORJSONResponse

from app.api.v1.router import api_router
from app.connectors.registry import load_connectors
from app.core.config import settings
from app.db.engine import get_engine
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




@app.on_event("startup")
async def on_startup() -> None:
    load_connectors()

    engine = get_engine()
    try:
        async with engine.connect() as sa_conn:
            raw = await sa_conn.get_raw_connection()
            asyncpg_conn = raw.driver_connection
            for ext in DDL_EXTENSIONS:
                await asyncpg_conn.execute(f'CREATE EXTENSION IF NOT EXISTS "{ext}"')
            await asyncpg_conn.execute(DDL_INITIALIZE)
            await sa_conn.commit()
    except Exception as exc:
        logging.getLogger("startup").warning("Schema init skipped: %s", exc)


app.include_router(api_router, prefix=settings.api_prefix)
