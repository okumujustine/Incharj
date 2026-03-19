# Core: Connectors (Plugin Layer)

The connector layer is a provider-based plugin system.

Source modules:
- `backend/src/connectors/plugin-types.ts`
- `backend/src/connectors/registry.ts`
- `backend/src/connectors/google-drive.ts`
- `backend/src/connectors/notion.ts`
- `backend/src/connectors/slack.ts`

---

## Provider contract

Each provider registers three parts:

1. `manifest`
   - Connector metadata and retry policy
   - Capability flags
2. `plugin`
   - `validateConfig(...)`
   - `enumerate(...)`
   - `fetchDocument(...)`
3. `auth`
   - `authorizeUrl(state)`
   - `exchangeCode(code, redirectUri)`
   - optional `refreshCredentials(credentials)`

This contract is typed by `ConnectorProvider` in `plugin-types.ts`.

---

## Manifest responsibilities

`ConnectorManifest` defines stable behavior expected by orchestration:

- `key`, `displayName`, `authType`
- `supportsIncremental`, `supportsAcl`
- `supportedContentTypes`, `maxPageSize`
- `retryPolicy`: `{ maxAttempts, backoffMs, strategy }`
- optional capability flags under `capabilities`

The worker uses manifest retry policy directly when enqueuing `sync-document` jobs.

---

## Data boundaries

Connector output is split into two typed parts:

- `ConnectorDocumentRef` from `enumerate(...)`
  - Stable metadata and source identity
  - Includes `sourcePermissions` and `metadata`
- `ConnectorFetchedDocument` from `fetchDocument(...)`
  - Primary text payload (`content`)
  - Optional content-type/path/permissions enrichment

These two outputs are transformed into one canonical envelope by the orchestration layer.

---

## Registry behavior

`registry.ts` is the single source of truth:

- `registerConnectorProvider(provider)`
- `getConnectorProvider(kind)`
- `loadConnectors()` for provider side-effect registration

No legacy connector base class path remains.
