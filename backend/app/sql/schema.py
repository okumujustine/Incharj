DDL_EXTENSIONS = ["pgcrypto", "pg_trgm", "unaccent"]

DDL_INITIALIZE = """
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(320) UNIQUE NOT NULL,
      hashed_password TEXT,
      full_name VARCHAR(255),
      avatar_url TEXT,
      is_verified BOOLEAN NOT NULL DEFAULT false,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS ix_users_email ON users(email);

    CREATE TABLE IF NOT EXISTS organizations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slug VARCHAR(100) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      plan VARCHAR(50) NOT NULL DEFAULT 'free',
      settings JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS ix_organizations_slug ON organizations(slug);

    CREATE TABLE IF NOT EXISTS memberships (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role VARCHAR(50) NOT NULL DEFAULT 'member',
      joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT uq_membership_org_user UNIQUE (org_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS ix_memberships_org_id ON memberships(org_id);
    CREATE INDEX IF NOT EXISTS ix_memberships_user_id ON memberships(user_id);

    CREATE TABLE IF NOT EXISTS invitations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
      email VARCHAR(320) NOT NULL,
      role VARCHAR(50) NOT NULL DEFAULT 'member',
      token VARCHAR(128) UNIQUE NOT NULL,
      accepted_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '7 days',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT uq_invitation_org_email UNIQUE (org_id, email)
    );
    CREATE INDEX IF NOT EXISTS ix_invitations_org_id ON invitations(org_id);

    CREATE TABLE IF NOT EXISTS sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      refresh_token TEXT UNIQUE NOT NULL,
      user_agent TEXT,
      ip_address VARCHAR(45),
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS ix_sessions_user_id ON sessions(user_id);

    CREATE TABLE IF NOT EXISTS connectors (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      kind VARCHAR(50) NOT NULL,
      name VARCHAR(255) NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'idle',
      credentials TEXT,
      config JSONB,
      sync_cursor TEXT,
      last_synced_at TIMESTAMPTZ,
      last_error TEXT,
      sync_frequency VARCHAR(50) NOT NULL DEFAULT '1 hour',
      doc_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS ix_connectors_org_id ON connectors(org_id);

    CREATE TABLE IF NOT EXISTS sync_jobs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      connector_id UUID NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
      org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      triggered_by VARCHAR(50) NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ,
      docs_enqueued INTEGER NOT NULL DEFAULT 0,
      docs_processed INTEGER NOT NULL DEFAULT 0,
      docs_indexed INTEGER NOT NULL DEFAULT 0,
      docs_skipped INTEGER NOT NULL DEFAULT 0,
      docs_errored INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      meta JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS ix_sync_jobs_connector_id ON sync_jobs(connector_id);
    CREATE INDEX IF NOT EXISTS ix_sync_jobs_org_id ON sync_jobs(org_id);

    CREATE TABLE IF NOT EXISTS documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      connector_id UUID NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
      external_id VARCHAR(512) NOT NULL,
      url TEXT,
      title TEXT,
      kind VARCHAR(100),
      ext VARCHAR(20),
      author_name VARCHAR(255),
      author_email VARCHAR(320),
      content_hash VARCHAR(64),
      checksum VARCHAR(64),
      word_count INTEGER,
      mtime TIMESTAMPTZ,
      source_last_modified_at TIMESTAMPTZ,
      content_type VARCHAR(200),
      source_path TEXT,
      source_permissions JSONB,
      extraction_status VARCHAR(40) NOT NULL DEFAULT 'succeeded',
      extraction_error_code VARCHAR(80),
      extraction_version INTEGER NOT NULL DEFAULT 1,
      chunking_version INTEGER NOT NULL DEFAULT 1,
      indexing_version INTEGER NOT NULL DEFAULT 1,
      indexed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      metadata JSONB,
      search_vector tsvector,
      CONSTRAINT uq_document_connector_external UNIQUE (connector_id, external_id)
    );
    CREATE INDEX IF NOT EXISTS ix_documents_org_id ON documents(org_id);
    CREATE INDEX IF NOT EXISTS ix_documents_connector_id ON documents(connector_id);
    CREATE INDEX IF NOT EXISTS ix_documents_title_trgm ON documents USING GIN (title gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS ix_documents_search_vector ON documents USING GIN (search_vector);

    CREATE TABLE IF NOT EXISTS document_chunks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      token_count INTEGER,
      embedding vector,
      search_vector tsvector,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT uq_chunk_doc_idx UNIQUE (document_id, chunk_index)
    );
    CREATE INDEX IF NOT EXISTS ix_document_chunks_document_id ON document_chunks(document_id);
    CREATE INDEX IF NOT EXISTS ix_document_chunks_org_id ON document_chunks(org_id);
    CREATE INDEX IF NOT EXISTS ix_chunks_content_trgm ON document_chunks USING GIN (content gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS ix_chunks_search_vector ON document_chunks USING GIN (search_vector);

    CREATE TABLE IF NOT EXISTS entities (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      kind VARCHAR(100) NOT NULL,
      name VARCHAR(500) NOT NULL,
      aliases TEXT[],
      metadata JSONB,
      CONSTRAINT uq_entity_org_kind_name UNIQUE (org_id, kind, name)
    );
    CREATE INDEX IF NOT EXISTS ix_entities_org_id ON entities(org_id);

    CREATE TABLE IF NOT EXISTS document_entities (
      document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
      mentions INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (document_id, entity_id)
    );

    CREATE TABLE IF NOT EXISTS relationships (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      subject_id UUID NOT NULL,
      subject_type VARCHAR(100) NOT NULL,
      predicate VARCHAR(255) NOT NULL,
      object_id UUID NOT NULL,
      object_type VARCHAR(100) NOT NULL,
      weight DOUBLE PRECISION NOT NULL DEFAULT 1.0,
      source VARCHAR(50) NOT NULL DEFAULT 'extracted',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS ix_relationships_org_id ON relationships(org_id);

    CREATE TABLE IF NOT EXISTS workflow_definitions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      trigger VARCHAR(100) NOT NULL,
      trigger_config JSONB,
      steps JSONB,
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS ix_workflow_definitions_org_id ON workflow_definitions(org_id);

    CREATE TABLE IF NOT EXISTS workflow_runs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workflow_id UUID NOT NULL REFERENCES workflow_definitions(id) ON DELETE CASCADE,
      org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      status VARCHAR(50) NOT NULL,
      triggered_by VARCHAR(100),
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ,
      output JSONB,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS ix_workflow_runs_workflow_id ON workflow_runs(workflow_id);
    CREATE INDEX IF NOT EXISTS ix_workflow_runs_org_id ON workflow_runs(org_id);

    CREATE TABLE IF NOT EXISTS connector_sync_state (
      connector_id UUID PRIMARY KEY REFERENCES connectors(id) ON DELETE CASCADE,
      org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      checkpoint JSONB,
      last_sync_job_id UUID REFERENCES sync_jobs(id) ON DELETE SET NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS ix_connector_sync_state_org_id ON connector_sync_state(org_id);

    CREATE TABLE IF NOT EXISTS embedding_cache (
      cache_key TEXT PRIMARY KEY,
      provider VARCHAR(64) NOT NULL,
      model VARCHAR(120) NOT NULL,
      dimensions INTEGER NOT NULL,
      embedding vector NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS ix_embedding_cache_updated_at ON embedding_cache(updated_at);

    ALTER TABLE sync_jobs ADD COLUMN IF NOT EXISTS docs_enqueued INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE sync_jobs ADD COLUMN IF NOT EXISTS docs_processed INTEGER NOT NULL DEFAULT 0;

    ALTER TABLE documents ADD COLUMN IF NOT EXISTS checksum VARCHAR(64);
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS source_last_modified_at TIMESTAMPTZ;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS content_type VARCHAR(200);
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS source_path TEXT;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS source_permissions JSONB;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS extraction_status VARCHAR(40) NOT NULL DEFAULT 'succeeded';
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS extraction_error_code VARCHAR(80);
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS extraction_version INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS chunking_version INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS indexing_version INTEGER NOT NULL DEFAULT 1;

    UPDATE documents SET checksum = content_hash WHERE checksum IS NULL;

    ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS embedding vector;
    ALTER TABLE embedding_cache ADD COLUMN IF NOT EXISTS embedding vector;

    -- Migrate existing JSONB embeddings to vector type
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'document_chunks'
          AND column_name = 'embedding'
          AND data_type = 'jsonb'
      ) THEN
        ALTER TABLE document_chunks ALTER COLUMN embedding TYPE vector USING embedding::text::vector;
      END IF;
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'embedding_cache'
          AND column_name = 'embedding'
          AND data_type = 'jsonb'
      ) THEN
        ALTER TABLE embedding_cache ALTER COLUMN embedding TYPE vector USING embedding::text::vector;
      END IF;
    END $$;
"""
