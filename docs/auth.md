# Authentication

## Overview

Authentication uses short-lived JWT access tokens plus long-lived refresh tokens stored in an httpOnly cookie. There is no OAuth-based login for the platform itself — users register with email and password.

---

## Token flow

```
POST /auth/register or /auth/login
  │
  ├─► access_token (JWT, 15 min)  → returned in response body
  └─► refresh_token (opaque)      → set as httpOnly cookie (30 days)

Frontend stores access_token in memory.
On 401 → POST /auth/refresh → new access_token + rotated refresh_token cookie.
POST /auth/logout → cookie cleared + session row deleted.
```

---

## Access token (JWT)

- Signed with `APP_SECRET` using `jose`.
- Payload: `{ sub: userId, email, name }`.
- Lifetime: `ACCESS_TOKEN_EXPIRE_MINUTES` (default 15 minutes).
- Sent as `Authorization: Bearer <token>` on every request.

## Refresh token

- Opaque random string stored in `sessions` table.
- Set as an httpOnly, `sameSite=lax` cookie on the `/api/v1/auth` path.
- Lifetime: `REFRESH_TOKEN_EXPIRE_DAYS` (default 30 days).
- **Rotated on every refresh** — old session row deleted, new one inserted.

---

## Middleware

`backend/src/middleware/auth.ts` exports:

| Function | Description |
|---|---|
| `requireCurrentUser` | Fastify preHandler — verifies JWT, loads user from DB, attaches to `request.user`. Throws 401 if missing or invalid. |
| `getCurrentUser(request)` | Reads the already-attached user (call after `requireCurrentUser`). |
| `getCurrentMembership(slug, userId)` | Verifies the user is a member of the org identified by `slug`. Returns the membership row. Throws 403 if not a member. |
| `requireRole(membership, roles)` | Throws 403 if the membership role is not in the allowed list. |

Usage in route files:

```typescript
api.get("/orgs/:slug/connectors", { preHandler: requireCurrentUser }, async (request) => {
  const user = getCurrentUser(request);
  const membership = await getCurrentMembership(slug, user.id);
  requireRole(membership, ["owner", "admin"]);
  // ...
});
```

---

## Password hashing

Passwords are hashed with `bcryptjs` (default cost factor) before storage. Plain text passwords are never stored or logged.

---

## Credential encryption (connector OAuth tokens)

OAuth tokens from external providers (Google, Notion, Slack) are encrypted at rest using AES-GCM:

- Key: `ENCRYPTION_KEY` env var (32 bytes, base64url encoded).
- Helpers: `encryptCredentials(obj)` / `decryptCredentials(ciphertext)` in `utils/security.ts`.
- Stored in `connectors.credentials` as a base64-encoded ciphertext string.
- Decrypted only in the worker's `runner.ts` when a sync begins.

---

## Roles

| Role | Permissions |
|---|---|
| `owner` | Full access including org deletion and owner transfer |
| `admin` | Create/update/delete connectors, manage members |
| `member` | Read access — can view connectors, documents, search |

Roles are checked per-request via `requireRole()` — there is no caching of role decisions.

---

## Sessions table

Each login creates a row in `sessions`. On logout or token refresh the old row is deleted. This allows:

- Listing active sessions (not yet exposed in the API but the data is there).
- Immediate revocation — invalidating a session row makes the refresh token unusable even before it expires.
