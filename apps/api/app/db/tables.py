from __future__ import annotations

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Double,
    ForeignKey,
    Integer,
    MetaData,
    String,
    Table,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR, UUID
from pgvector.sqlalchemy import Vector

metadata = MetaData()

users = Table(
    "users",
    metadata,
    Column("id", UUID(as_uuid=True), primary_key=True),
    Column("email", String(320), nullable=False, unique=True),
    Column("hashed_password", Text),
    Column("full_name", String(255)),
    Column("avatar_url", Text),
    Column("is_verified", Boolean, nullable=False, default=False),
    Column("is_active", Boolean, nullable=False, default=True),
    Column("created_at", DateTime(timezone=True), nullable=False),
    Column("updated_at", DateTime(timezone=True), nullable=False),
)

organizations = Table(
    "organizations",
    metadata,
    Column("id", UUID(as_uuid=True), primary_key=True),
    Column("slug", String(100), nullable=False, unique=True),
    Column("name", String(255), nullable=False),
    Column("plan", String(50), nullable=False, default="free"),
    Column("settings", JSONB),
    Column("created_at", DateTime(timezone=True), nullable=False),
    Column("updated_at", DateTime(timezone=True), nullable=False),
)

memberships = Table(
    "memberships",
    metadata,
    Column("id", UUID(as_uuid=True), primary_key=True),
    Column("org_id", UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
    Column("user_id", UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
    Column("role", String(50), nullable=False, default="member"),
    Column("joined_at", DateTime(timezone=True), nullable=False),
)

invitations = Table(
    "invitations",
    metadata,
    Column("id", UUID(as_uuid=True), primary_key=True),
    Column("org_id", UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
    Column("invited_by", UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")),
    Column("email", String(320), nullable=False),
    Column("role", String(50), nullable=False, default="member"),
    Column("token", String(128), nullable=False, unique=True),
    Column("accepted_at", DateTime(timezone=True)),
    Column("expires_at", DateTime(timezone=True), nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False),
)

sessions = Table(
    "sessions",
    metadata,
    Column("id", UUID(as_uuid=True), primary_key=True),
    Column("user_id", UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
    Column("refresh_token", Text, nullable=False, unique=True),
    Column("user_agent", Text),
    Column("ip_address", String(45)),
    Column("expires_at", DateTime(timezone=True), nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False),
)

connectors = Table(
    "connectors",
    metadata,
    Column("id", UUID(as_uuid=True), primary_key=True),
    Column("org_id", UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
    Column("created_by", UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")),
    Column("kind", String(50), nullable=False),
    Column("name", String(255), nullable=False),
    Column("status", String(50), nullable=False, default="idle"),
    Column("credentials", Text),
    Column("config", JSONB),
    Column("sync_cursor", Text),
    Column("last_synced_at", DateTime(timezone=True)),
    Column("last_error", Text),
    Column("sync_frequency", String(50), nullable=False, default="24 hours"),
    Column("doc_count", Integer, nullable=False, default=0),
    Column("created_at", DateTime(timezone=True), nullable=False),
    Column("updated_at", DateTime(timezone=True), nullable=False),
)

sync_jobs = Table(
    "sync_jobs",
    metadata,
    Column("id", UUID(as_uuid=True), primary_key=True),
    Column("connector_id", UUID(as_uuid=True), ForeignKey("connectors.id", ondelete="CASCADE"), nullable=False),
    Column("org_id", UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
    Column("triggered_by", String(50), nullable=False),
    Column("status", String(50), nullable=False, default="pending"),
    Column("started_at", DateTime(timezone=True)),
    Column("finished_at", DateTime(timezone=True)),
    Column("docs_enqueued", Integer, nullable=False, default=0),
    Column("docs_processed", Integer, nullable=False, default=0),
    Column("docs_indexed", Integer, nullable=False, default=0),
    Column("docs_skipped", Integer, nullable=False, default=0),
    Column("docs_errored", Integer, nullable=False, default=0),
    Column("error_message", Text),
    Column("meta", JSONB),
    Column("created_at", DateTime(timezone=True), nullable=False),
)

documents = Table(
    "documents",
    metadata,
    Column("id", UUID(as_uuid=True), primary_key=True),
    Column("org_id", UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
    Column("connector_id", UUID(as_uuid=True), ForeignKey("connectors.id", ondelete="CASCADE"), nullable=False),
    Column("external_id", String(512), nullable=False),
    Column("url", Text),
    Column("title", Text),
    Column("kind", String(100)),
    Column("ext", String(20)),
    Column("author_name", String(255)),
    Column("author_email", String(320)),
    Column("content_hash", String(64)),
    Column("checksum", String(64)),
    Column("word_count", Integer),
    Column("mtime", DateTime(timezone=True)),
    Column("source_last_modified_at", DateTime(timezone=True)),
    Column("content_type", String(200)),
    Column("source_path", Text),
    Column("source_permissions", JSONB),
    Column("extraction_status", String(40), nullable=False, default="succeeded"),
    Column("extraction_error_code", String(80)),
    Column("extraction_version", Integer, nullable=False, default=1),
    Column("chunking_version", Integer, nullable=False, default=1),
    Column("indexing_version", Integer, nullable=False, default=1),
    Column("indexed_at", DateTime(timezone=True), nullable=False),
    Column("metadata", JSONB),
    Column("search_vector", TSVECTOR),
)

document_chunks = Table(
    "document_chunks",
    metadata,
    Column("id", UUID(as_uuid=True), primary_key=True),
    Column("document_id", UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False),
    Column("org_id", UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
    Column("chunk_index", Integer, nullable=False),
    Column("content", Text, nullable=False),
    Column("token_count", Integer),
    Column("embedding", Vector()),
    Column("search_vector", TSVECTOR),
    Column("created_at", DateTime(timezone=True), nullable=False),
)

connector_sync_state = Table(
    "connector_sync_state",
    metadata,
    Column("connector_id", UUID(as_uuid=True), ForeignKey("connectors.id", ondelete="CASCADE"), primary_key=True),
    Column("org_id", UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
    Column("checkpoint", JSONB),
    Column("last_sync_job_id", UUID(as_uuid=True), ForeignKey("sync_jobs.id", ondelete="SET NULL")),
    Column("updated_at", DateTime(timezone=True), nullable=False),
)

slack_installations = Table(
    "slack_installations",
    metadata,
    Column("id", UUID(as_uuid=True), primary_key=True),
    Column("org_id", UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
    Column("team_id", String(64), nullable=False, unique=True),
    Column("team_name", String(255)),
    Column("bot_token", Text, nullable=False),
    Column("installed_by_slack_user", String(64)),
    Column("installed_at", DateTime(timezone=True), nullable=False),
)

embedding_cache = Table(
    "embedding_cache",
    metadata,
    Column("cache_key", Text, primary_key=True),
    Column("provider", String(64), nullable=False),
    Column("model", String(120), nullable=False),
    Column("dimensions", Integer, nullable=False),
    Column("embedding", Vector(), nullable=False),
    Column("updated_at", DateTime(timezone=True), nullable=False),
)
