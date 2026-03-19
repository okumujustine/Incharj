# Core Overview

The ingestion core is documented as split modules that match the backend structure.

## Detailed core docs

- [Core: Orchestration](/core-orchestration)
- [Core: Connectors (Plugin Layer)](/core-connectors)
- [Core: Normalization](/core-normalization)
- [Core: Chunking](/core-chunking)
- [Core: Indexing](/core-indexing)
- [Core: Permissions](/core-permissions)

---

## Pipeline map

```
Connector Plugin
  enumerate() + fetchDocument()
        |
        v
Normalization
  sanitize + checksum + dedup + upsert documents
        |
        v
Chunking
  split content + token counts + persist chunks
        |
        v
Indexing
  update document search vectors
        |
        v
Permissions
  resolve ACL metadata (org fallback today)
```

---

## Core code map

```
backend/src/
|- connectors/        plugin contracts, providers, registry
|- normalization/     normalizeDocument()
|- chunking/          processChunks()
|- indexing/          updateSearchIndex()
|- permissions/       resolveDocumentPermissions()
`- workers/           processEnumerate/Document/FinalizeJob()
```

Ingestion facade:

- `backend/src/services/indexer.ts`

This facade coordinates stage modules in a single transaction scope per document.
