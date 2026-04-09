from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

_engine: AsyncEngine | None = None
_null_pool: bool = False


def use_null_pool() -> None:
    """Call once in Celery worker context so each asyncio.run() gets fresh connections."""
    global _null_pool, _engine
    _null_pool = True
    _engine = None


def get_engine() -> AsyncEngine:
    global _engine
    if _engine is None:
        _engine = _make_engine()
    return _engine


def _make_engine() -> AsyncEngine:
    from app.core.config import settings

    url = settings.database_url
    if "postgresql://" in url and "+asyncpg" not in url:
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)

    if _null_pool:
        from sqlalchemy.pool import NullPool
        return create_async_engine(url, echo=False, poolclass=NullPool)

    return create_async_engine(url, echo=False, pool_size=5, max_overflow=10, pool_pre_ping=True)


async def dispose_engine() -> None:
    global _engine
    old, _engine = _engine, None
    if old is not None:
        try:
            await old.dispose()
        except Exception:
            pass  # connections from a closed event loop can't be cleanly disposed
