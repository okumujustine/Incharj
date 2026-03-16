# API Reference

Base URL: `/api/v1`

All endpoints that require authentication expect a valid `Authorization: Bearer <access_token>` header. Endpoints that scope data to an organisation require the caller to be a member of that org.

---

## Auth

### `GET /auth/me`
Returns the authenticated user.

**Auth required**: yes

**Response**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "full_name": "Jane Doe",
  "avatar_url": null,
  "is_verified": false
}
```

---

### `POST /auth/register`
Creates a new account and returns tokens.

**Body**
```json
{ "email": "user@example.com", "password": "…", "full_name": "Jane Doe" }
```

**Response** `201`
```json
{ "access_token": "…", "token_type": "Bearer", "expires_in": 900 }
```

Sets an httpOnly `refresh_token` cookie.

---

### `POST /auth/login`
Authenticates and returns tokens.

**Body**
```json
{ "email": "user@example.com", "password": "…" }
```

**Response** `200` — same shape as register. Sets `refresh_token` cookie.

---

### `POST /auth/refresh`
Issues a new access token using the `refresh_token` cookie.

**Response** `200` — new token pair. Rotates the refresh token cookie.

---

### `POST /auth/logout`
Invalidates the refresh token. Response `204`.

---

## Users

### `GET /users/me`
Returns the current user profile.

### `PATCH /users/me`
Updates name or avatar.

**Body** (all optional)
```json
{ "full_name": "Jane Doe", "avatar_url": "https://…" }
```

---

## Organizations

### `POST /orgs`
Creates an organization. The caller becomes `owner`.

**Body**
```json
{ "name": "Acme Inc", "slug": "acme" }
```

**Response** `201`

---

### `GET /orgs/:slug`
Returns org details.

### `PATCH /orgs/:slug`
Updates name or settings. Requires `owner` or `admin` role.

### `DELETE /orgs/:slug`
Deletes the org and all data. Requires `owner` role. Response `204`.

---

### `GET /orgs/:slug/members`
Lists members with roles.

### `PATCH /orgs/:slug/members/:userId`
Changes a member's role. Requires `owner` or `admin`.

**Body**: `{ "role": "admin" }`

### `DELETE /orgs/:slug/members/:userId`
Removes a member. Requires `owner` or `admin`. Response `204`.

---

### `POST /orgs/:slug/invitations`
Sends an invitation. Requires `owner` or `admin`.

**Body**: `{ "email": "invite@example.com", "role": "member" }`

### `GET /orgs/:slug/invitations`
Lists pending invitations.

### `DELETE /orgs/:slug/invitations/:invitationId`
Cancels an invitation. Response `204`.

### `POST /invitations/:token/accept`
Accepts an invitation by token (no auth required — token is the secret).

---

## Connectors

### `GET /orgs/:slug/connectors`
Lists all connectors for the org.

**Response**
```json
[
  {
    "id": "uuid",
    "kind": "google_drive",
    "name": "My Drive",
    "status": "idle",
    "sync_frequency": "1 hour",
    "doc_count": 142,
    "last_synced_at": "2024-01-15T10:30:00Z"
  }
]
```

---

### `POST /orgs/:slug/connectors`
Creates a connector. Requires `owner` or `admin`.

**Body**
```json
{
  "kind": "google_drive",
  "name": "My Drive",
  "sync_frequency": "1 hour",
  "config": {}
}
```

---

### `GET /connectors/:connectorId?org=<slug>`
Returns a single connector.

### `PATCH /connectors/:connectorId?org=<slug>`
Updates name, config, or sync_frequency. Requires `owner` or `admin`.

### `DELETE /connectors/:connectorId?org=<slug>`
Deletes the connector and all its documents. Requires `owner` or `admin`. Response `204`.

---

### `POST /connectors/:connectorId/sync?org=<slug>`
Enqueues a manual sync job.

**Response** `202` — sync job object.

---

### `POST /connectors/:connectorId/pause?org=<slug>`
Pauses scheduled syncing.

### `POST /connectors/:connectorId/resume?org=<slug>`
Resumes scheduled syncing.

---

## OAuth

### `GET /connectors/:connectorId/oauth/authorize?org=<slug>`
Returns the OAuth authorisation URL for the connector's provider.

**Response**: `{ "url": "https://accounts.google.com/…" }`

---

### `GET /connectors/:connectorId/oauth/callback?code=…&state=…`
Handles the OAuth redirect, exchanges the code for tokens, encrypts and stores them.

---

## Sync jobs

### `GET /orgs/:slug/sync-jobs`
Lists sync jobs for the org, most recent first.

**Query params**: `connector_id`, `status`, `limit`, `offset`

**Response**
```json
{
  "total": 50,
  "results": [
    {
      "id": "uuid",
      "connector_id": "uuid",
      "triggered_by": "scheduled",
      "status": "done",
      "started_at": "…",
      "finished_at": "…",
      "docs_indexed": 5,
      "docs_skipped": 137,
      "docs_errored": 0
    }
  ]
}
```

---

### `GET /connectors/:connectorId/sync-jobs?org=<slug>`
Lists sync jobs for a specific connector.

---

## Documents

### `GET /orgs/:slug/documents`
Lists indexed documents.

**Query params**: `connector_id`, `kind`, `q` (title search), `limit`, `offset`

---

### `GET /documents/:documentId?org=<slug>`
Returns a document with its chunks.

### `DELETE /documents/:documentId?org=<slug>`
Deletes a document. Requires `owner` or `admin`. Response `204`.

---

## Search

### `GET /orgs/:slug/search?q=<query>`

**Query params**

| Param | Description |
|---|---|
| `q` | Search query (required) |
| `connector_id` | Filter to one connector |
| `kind` | Filter by document kind |
| `date_from` | ISO timestamp — only docs modified after this |
| `date_to` | ISO timestamp — only docs modified before this |
| `limit` | Default `20` |
| `offset` | Default `0` |

**Response**
```json
{
  "query": "product roadmap",
  "total": 12,
  "limit": 20,
  "offset": 0,
  "results": [
    {
      "id": "uuid",
      "title": "Q3 Product Roadmap",
      "url": "https://docs.google.com/…",
      "kind": "doc",
      "ext": null,
      "snippet": "…<mark>product roadmap</mark> for Q3 includes…",
      "score": 0.42,
      "mtime": "2024-01-10T09:00:00Z",
      "connector_kind": "google_drive",
      "connector_name": "My Drive"
    }
  ]
}
```

---

## Error responses

All errors follow this shape:

```json
{ "error": "Not found", "statusCode": 404 }
```

| Status | Meaning |
|---|---|
| 400 | Validation error or bad request |
| 401 | Missing or invalid access token |
| 403 | Insufficient role |
| 404 | Resource not found |
| 500 | Internal server error |
