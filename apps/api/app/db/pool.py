from __future__ import annotations

import re
import uuid as _uuid_mod
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator

from sqlalchemy import bindparam, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.ext.asyncio import AsyncConnection

from app.db.engine import dispose_engine, get_engine


def _make_bp(key: str, value: Any) -> Any:
    """Return a typed bindparam. UUID strings get PG_UUID type so PostgreSQL can compare uuid columns."""
    if isinstance(value, str) and len(value) == 36:
        try:
            _uuid_mod.UUID(value)
            return bindparam(key, value=value, type_=PG_UUID(as_uuid=False))
        except ValueError:
            pass
    return bindparam(key, value=value)


def _coerce_sql(sql: str, params: tuple) -> Any:
    named = re.sub(r"\$(\d+)", lambda m: f":p{m.group(1)}", sql)
    bps = [_make_bp(f"p{i+1}", v) for i, v in enumerate(params)]
    return text(named).bindparams(*bps)


class DB:
    """Single-connection wrapper. Accepts SQLAlchemy statements OR raw 'SELECT ... $1' strings."""

    def __init__(self, conn: AsyncConnection) -> None:
        self._conn = conn

    def _coerce(self, stmt_or_sql: Any, params: tuple) -> Any:
        if isinstance(stmt_or_sql, str):
            return _coerce_sql(stmt_or_sql, params)
        return stmt_or_sql

    async def fetchrow(self, stmt_or_sql: Any, *params) -> dict | None:
        result = await self._conn.execute(self._coerce(stmt_or_sql, params))
        row = result.mappings().fetchone()
        return dict(row) if row else None

    async def fetch(self, stmt_or_sql: Any, *params) -> list[dict]:
        result = await self._conn.execute(self._coerce(stmt_or_sql, params))
        return [dict(r) for r in result.mappings().fetchall()]

    async def execute(self, stmt_or_sql: Any, *params) -> None:
        await self._conn.execute(self._coerce(stmt_or_sql, params))

    @asynccontextmanager
    async def transaction(self) -> AsyncIterator[None]:
        if self._conn.in_transaction():
            async with self._conn.begin_nested():
                yield
        else:
            async with self._conn.begin():
                yield

    @asynccontextmanager
    async def acquire(self) -> AsyncIterator["DB"]:
        yield self


class DBPool:
    """Pool-like: opens a fresh connection per call."""

    def _coerce(self, stmt_or_sql: Any, params: tuple) -> Any:
        if isinstance(stmt_or_sql, str):
            return _coerce_sql(stmt_or_sql, params)
        return stmt_or_sql

    async def fetchrow(self, stmt_or_sql: Any, *params) -> dict | None:
        async with get_engine().connect() as conn:
            result = await conn.execute(self._coerce(stmt_or_sql, params))
            row = result.mappings().fetchone()
            await conn.commit()
            return dict(row) if row else None

    async def fetch(self, stmt_or_sql: Any, *params) -> list[dict]:
        async with get_engine().connect() as conn:
            result = await conn.execute(self._coerce(stmt_or_sql, params))
            rows = [dict(r) for r in result.mappings().fetchall()]
            await conn.commit()
            return rows

    async def execute(self, stmt_or_sql: Any, *params) -> None:
        async with get_engine().connect() as conn:
            await conn.execute(self._coerce(stmt_or_sql, params))
            await conn.commit()

    @asynccontextmanager
    async def acquire(self) -> AsyncIterator[DB]:
        async with get_engine().connect() as conn:
            try:
                yield DB(conn)
                await conn.commit()
            except Exception:
                await conn.rollback()
                raise


_pool: DBPool | None = None


async def get_pool() -> DBPool:
    global _pool
    if _pool is None:
        _pool = DBPool()
    return _pool


async def reset_pool() -> None:
    """Call at the start of each Celery task to force a fresh pool on the current event loop."""
    global _pool
    _pool = None
    await dispose_engine()


async def close_pool() -> None:
    global _pool
    _pool = None
    await dispose_engine()
