# Backend

The backend is a Fastify 5 TypeScript application in `backend/src/`.

## Directory layout

```
backend/src/
├── app.ts                  # Fastify app factory — registers plugins, routes, hooks
├── server.ts               # Entry point — calls buildApp() and listens
├── db.ts                   # PostgreSQL pool, query helper, withTransaction, initializeDatabase
├── config.ts               # Environment variables and derived settings
├── errors.ts               # HTTP error classes (NotFoundError, BadRequestError, …)
│
├── constants/
│   └── auth.ts             # REFRESH_COOKIE name, COOKIE_MAX_AGE
│
├── schemas/                # Zod request validation schemas
│   ├── auth.ts             # registerSchema, loginSchema
│   ├── user.ts             # userUpdateSchema
│   ├── org.ts              # orgCreateSchema, orgUpdateSchema, memberRoleSchema, inviteSchema
│   └── connector.ts        # connectorCreateSchema, connectorUpdateSchema
│
├── sql/                    # All SQL — constants and builder functions
│   ├── auth.ts             # Auth & session queries
│   ├── connectors.ts       # Connector queries + getConnectorOr404, buildUpdateConnectorSql
│   ├── documents.ts        # Document queries + buildListDocumentsSql
│   ├── indexer.ts          # Ingest pipeline queries (upsert, chunks, search_vector)
│   ├── invitations.ts      # Invitation lifecycle queries
│   ├── orgs.ts             # Org/member queries + getOrgBySlug, buildUpdateOrgSql
│   ├── schema.ts           # DDL_INITIALIZE — full CREATE TABLE DDL
│   ├── search.ts           # buildFtsQuery, buildFtsCountQuery, buildFuzzyQuery, buildFuzzyCountQuery
│   ├── sync-jobs.ts        # Sync job lifecycle queries + buildSyncJobsListSql
│   └── users.ts            # User queries + buildUpdateUserSql
│
├── routes/                 # Fastify plugin per resource
│   ├── auth.ts
│   ├── users.ts
│   ├── orgs.ts
│   ├── connectors.ts
│   ├── oauth.ts
│   ├── sync.ts
│   ├── documents.ts
│   └── search.ts
│
├── middleware/
│   └── auth.ts             # requireCurrentUser, getCurrentUser, getCurrentMembership, requireRole
│
├── services/
│   ├── auth-service.ts     # registerUser, loginUser, refreshSession, logoutSession
│   ├── indexer.ts          # ingestDocument — hash check, upsert, chunk, update search_vector
│   ├── invitation-service.ts
│   └── search-service.ts   # fullTextSearch (FTS → fuzzy fallback)
│
├── connectors/
│   ├── base.ts             # BaseConnector abstract class
│   ├── registry.ts         # getConnector(options), loadConnectors()
│   ├── google-drive.ts
│   ├── notion.ts
│   └── slack.ts
│
├── workers/
│   ├── index.ts            # BullMQ Worker setup + job routing + startup
│   ├── scheduler.ts        # dispatchDueSyncs() — finds due connectors, enqueues to BullMQ
│   ├── processor.ts        # processJob() — marks job running/done/failed in DB
│   └── runner.ts           # runSync(connectorModel) — drives the actual sync
│
├── types/
│   ├── db.ts               # DbUser, DbMembership, DbClient
│   ├── http.ts             # AuthenticatedRequest, AppContext
│   ├── connector.ts        # ConnectorDocument, ConnectorModel, RunResult
│   ├── search.ts           # SearchOptions, SearchResult, SearchResponse
│   ├── indexer.ts          # DocData
│   ├── index.ts            # Re-exports all types
│   └── bcryptjs.d.ts       # Module declaration for bcryptjs
│
└── utils/
    ├── chunker.ts          # chunkText, approximateTokenCount
    ├── http.ts             # HTTP helpers
    ├── security.ts         # sha256, encryptCredentials, decryptCredentials
    └── serialization.ts    # mapUser, mapConnector, mapSyncJob
```

---

## Patterns

### Route plugins

Every route file exports a default Fastify plugin function:

```typescript
export default async function connectorRoutes(api: FastifyInstance) {
  api.get("/orgs/:slug/connectors", { preHandler: requireCurrentUser }, async (request) => {
    // ...
  });
}
```

`app.ts` registers all plugins under the `/api/v1` prefix:

```typescript
app.register(async (api) => {
  api.register(authRoutes);
  api.register(connectorRoutes);
  // ...
}, { prefix: "/api/v1" });
```

### SQL organisation

- **Static queries** (no variable WHERE/SET) → named string constants, e.g. `SQL_SELECT_CONNECTORS_BY_ORG`.
- **Dynamic queries** (variable filters, PATCH SET clauses) → builder functions that accept arrays of filter strings and parameter indices, e.g. `buildUpdateConnectorSql(sets)`, `buildFtsQuery(whereClause, limitParam, offsetParam)`.
- All SQL lives in `sql/` — nothing inline in routes, services, workers, or middleware.

### Request validation

Zod schemas in `schemas/` are called explicitly (`schema.parse(request.body)`) rather than as Fastify schema hooks so that Zod's error messages are preserved.

### Error handling

Custom error classes in `errors.ts` extend `Error` and carry a `statusCode`. The Fastify error handler in `app.ts` maps them to the appropriate HTTP response.

### Database helpers

- `query(sql, values)` — single query using a pooled connection.
- `withTransaction(fn)` — acquires a client, runs `BEGIN`, calls `fn(client)`, commits, releases. Rolls back on error.
