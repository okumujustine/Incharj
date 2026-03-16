# Connectors

A connector is a typed integration with an external data source. Each connector handles OAuth authorisation, document listing, content fetching, and credential refresh.

## Location

```
backend/src/connectors/
├── base.ts          — BaseConnector abstract class
├── registry.ts      — getConnector(), loadConnectors()
├── google-drive.ts
├── notion.ts
└── slack.ts
```

---

## `BaseConnector`

All connectors extend this abstract class:

```typescript
abstract class BaseConnector {
  connectorId: string;
  orgId: string;
  credentials: Record<string, unknown>;
  config: Record<string, unknown>;

  abstract authorizeUrl(state: string): string;
  abstract exchangeCode(code: string, redirectUri: string): Promise<Record<string, unknown>>;
  abstract refreshCredentials(): Promise<Record<string, unknown> | null>;
  abstract listDocuments(cursor?: string | null): AsyncGenerator<ConnectorDocument>;
  abstract fetchContent(externalId: string, metadata: Record<string, unknown>): Promise<string | null>;
}
```

### `ConnectorDocument` (from `types/connector.ts`)

```typescript
interface ConnectorDocument {
  external_id: string;
  url?: string | null;
  title?: string | null;
  kind?: string | null;
  ext?: string | null;
  author_name?: string | null;
  author_email?: string | null;
  mtime?: string | null;
  metadata?: Record<string, unknown> | null;
}
```

`fetchContent` is called separately so listing can be parallelised or rate-limited independently from content fetching.

---

## Registry

`registry.ts` maintains a map of `kind → connector class`. `getConnector(options)` instantiates the right class. `loadConnectors()` is called at startup (and by the worker) to register all built-in connectors.

```typescript
getConnector({
  kind: "google_drive",
  connectorId: "uuid",
  orgId: "uuid",
  credentials: { access_token: "…", refresh_token: "…" },
  config: { last_synced_at: "2024-01-01T00:00:00Z" },
})
```

---

## Incremental sync

The worker passes `last_synced_at` from the connector row into the config object. Each connector reads `this.config.last_synced_at` and filters at the source API level:

- **Google Drive**: `modifiedTime > '${lastSyncedAt}'` query parameter
- **Notion**: `filter.last_edited_time.after` parameter
- **Slack**: message timestamps

If `last_synced_at` is undefined (first sync), the connector fetches all available documents.

---

## OAuth flow

1. Frontend calls `GET /connectors/:id/oauth/authorize` → API calls `connector.authorizeUrl(state)` → returns the provider's consent URL.
2. User approves → provider redirects to `GET /connectors/:id/oauth/callback?code=…&state=…`.
3. API calls `connector.exchangeCode(code, redirectUri)` → returns a credentials object.
4. Credentials are encrypted with AES-GCM (`encryptCredentials`) and stored in `connectors.credentials`.

---

## Credential refresh

At the start of each sync run, `runner.ts` calls `connector.refreshCredentials()`. If the method returns a new credentials object (e.g. a refreshed Google access token), the worker writes the new encrypted credentials back to the database after the sync completes.

---

## Adding a new connector

1. Create `backend/src/connectors/my-source.ts` extending `BaseConnector`.
2. Implement all five abstract methods.
3. Register it in `registry.ts`:
   ```typescript
   connectorRegistry.set("my_source", MySourceConnector);
   ```
4. Add the kind string to the connector create schema in `schemas/connector.ts`.

No other changes are required — the worker, OAuth routes, and indexer are connector-agnostic.
