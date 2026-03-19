# Core: Orchestration

The orchestration layer coordinates the staged sync flow and job lifecycle.

Source modules:
- `backend/src/workers/scheduler.ts`
- `backend/src/workers/processor.ts`
- `backend/src/workers/index.ts`
- `backend/src/sql/sync-jobs.ts`

---

## Job topology

The worker runs one queue with three sync stages:

1. `sync-enumerate`:
   - Loads connector + credentials
   - Loads checkpoint from `connector_sync_state`
   - Calls `plugin.enumerate(...)`
   - Enqueues N `sync-document` jobs
   - Enqueues one `sync-finalize` job
2. `sync-document`:
   - Calls `plugin.fetchDocument(...)`
   - Builds a `CanonicalDocumentEnvelope`
   - Calls `ingestCanonicalDocument(...)`
   - Updates `docs_indexed/docs_skipped/docs_errored`
3. `sync-finalize`:
   - Polls progress until `docs_processed == docs_enqueued`
   - Completes sync job row
   - Persists checkpoint and credentials
   - Updates connector state (`last_synced_at`, `doc_count`)

Dispatching is done by a repeatable `dispatch` job every 30 seconds.

---

## Typed job payloads

`processor.ts` defines strict payload contracts:

```ts
interface EnumerateJobData {
  syncJobId: string;
  connectorId: string;
}

interface DocumentJobData {
  syncJobId: string;
  connectorId: string;
  ref: ConnectorDocumentRef;
}

interface FinalizeJobData {
  syncJobId: string;
  connectorId: string;
  checkpoint: Record<string, unknown> | null;
  encryptedCredentials: string | null;
}
```

These payloads are the stage boundary contract.

---

## Failure and retry semantics

- `SyncPipelineError` carries:
  - `code`
  - `stage` (`enumeration | fetch | normalize | index | checkpoint`)
  - `retriable`
- Retries are governed by connector manifest retry policy:
  - `maxAttempts`
  - `backoffMs`
  - `strategy` (`fixed | exponential`)
- Non-retriable or exhausted failures are recorded as document errors and do not stop the whole sync.

---

## Why this split matters

- Enumerate stage is connector/network heavy.
- Document stage is content/DB heavy.
- Finalize stage is state consistency heavy.

By splitting them, each stage can scale, retry, and fail independently.
