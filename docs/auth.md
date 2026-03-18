# Authentication

Platform auth (user login) and connector auth (OAuth to external services) are separate concerns. Neither depends on the other.

---

## User auth — token flow

```
POST /auth/login  { email, password }
  │
  ├─► access_token  (JWT, 15 min)     → response body
  └─► refresh_token (opaque, 30 days) → httpOnly cookie

Every request: Authorization: Bearer <access_token>

On 401:
  POST /auth/refresh  ← browser sends cookie automatically
    │
    ├─► new access_token
    └─► rotated refresh_token cookie  (old session row deleted)

POST /auth/logout → cookie cleared + session deleted
```

### Access token (JWT)

Signed with `APP_SECRET` using `HS256` via the `jose` library. The payload contains only what the middleware needs — no roles, no permissions, no org membership:

```json
{
  "sub": "user-uuid",
  "email": "alice@example.com",
  "name": "Alice",
  "iat": 1710000000,
  "exp": 1710000900
}
```

The JWT is short-lived (15 minutes) so a compromised token has a narrow window. It is never stored server-side — the signature verifies it.

Verification in `middleware/auth.ts`:
```ts
const { payload } = await jwtVerify(token, new TextEncoder().encode(APP_SECRET))
// payload.sub is the userId
```

If the signature is invalid or the token is expired, `jwtVerify` throws and the middleware returns 401.

### Refresh token

A cryptographically random opaque string (128-bit, hex-encoded). It is stored in the `sessions` table and in an `httpOnly`, `SameSite=lax` cookie.

```sql
CREATE TABLE sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,  -- SHA-256 of the raw token
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

The raw token is sent to the browser. Only its SHA-256 hash is stored in the database — if the database is compromised, the hashes cannot be reversed to valid tokens.

**Rotation on every use:** When `POST /auth/refresh` is called, the server:
1. Reads the cookie, hashes the token, looks up the session row
2. Checks `expires_at` — returns 401 if expired
3. Deletes the old session row
4. Issues a new access token + new refresh token (new session row)
5. Sets the new token in the cookie

If a refresh token is stolen and used before the legitimate user's next refresh, the attacker gets a new token. But the legitimate user's next refresh request will fail (the old session was deleted), which forces a logout. The stolen token cannot be reused because rotation deleted the session it corresponded to.

---

## Request middleware

All protected routes use the same two-step check:

```ts
// 1. Verify JWT, load user
api.get('/orgs/:slug/connectors', { preHandler: requireCurrentUser }, async (req) => {
  const user = getCurrentUser(req)

  // 2. Verify org membership + role
  const membership = await getCurrentMembership(slug, user.id)
  requireRole(membership, ['owner', 'admin'])
})
```

| Function | What it does |
|---|---|
| `requireCurrentUser` | Verifies JWT, loads user row from DB, attaches to `request.user`. Throws 401 if missing or invalid. |
| `getCurrentUser` | Reads the already-attached user from `request.user`. Throws if called before `requireCurrentUser`. |
| `getCurrentMembership` | Confirms the user is a member of the org in the URL slug. Throws 403 if not. Returns the `memberships` row including the role. |
| `requireRole` | Throws 403 if `membership.role` is not in the allowed list. |

### Why load the user from DB on every request

The JWT contains `sub: userId`. The middleware does a DB lookup on every request to ensure the user still exists and is active. If an account is deleted or deactivated, their JWT remains mathematically valid until it expires — the DB check catches this case.

The lookup is on the primary key (`WHERE id = $1`) with no joins — it's effectively free at the DB level.

### Roles

| Role | Permissions |
|---|---|
| `owner` | Everything, including deleting the org and transferring ownership |
| `admin` | Manage connectors (create, pause, delete, sync), manage members |
| `member` | Read-only: search, browse documents, view connector status |

Roles are enforced per request. There is no caching — a role change takes effect immediately on the next request.

---

## Connector OAuth — credential storage

OAuth tokens from Google, Notion, and Slack are encrypted before storage.

### OAuth flow

```
1. POST /orgs/:slug/connectors
      → creates connectors row with has_credentials = false

2. GET /connectors/:id/oauth/authorize
      → backend calls connector.authorizeUrl(state)
      → returns consent URL to frontend
      → frontend stores { connector_id, org_slug } in localStorage keyed by state param

3. User approves at Google / Notion / Slack

4. GET /oauth/<kind>/callback?code=...&state=...
      → backend reads state from localStorage map (sent back in query)
      → backend calls connector.exchangeCode(code, redirectUri)
      → receives { access_token, refresh_token, expiry_date, ... }

5. encryptCredentials(credentials, ENCRYPTION_KEY)
      → stored in connectors.credentials (base64-encoded AES-GCM ciphertext)
      → has_credentials = true
```

### AES-GCM encryption

`encryptCredentials` in `utils/security.ts`:

```
key         = base64url decode ENCRYPTION_KEY (must be 32 bytes)
iv          = 12 random bytes (unique per encryption, stored prepended to ciphertext)
ciphertext  = AES-256-GCM encrypt(JSON.stringify(credentials), key, iv)
stored      = base64(iv + ciphertext + authTag)
```

AES-GCM provides both confidentiality and integrity. The auth tag means tampered ciphertext is detected at decrypt time rather than silently decrypted to garbage.

`decryptCredentials` reverses this: strips the IV from the front, decrypts, JSON parses. It is called exactly once per sync job, in `runner.ts`, immediately before the connector uses the credentials.

Credentials are never:
- Returned by any API endpoint
- Written to logs (the credentials object is never passed to a logger)
- Stored anywhere except `connectors.credentials`

### Token refresh during sync

Before calling `listDocuments()`, the runner calls `connector.refreshCredentials()`:

```ts
// runner.ts
const freshCreds = await connector.refreshCredentials()
if (freshCreds) {
  // Re-encrypt and save the updated tokens
  await db.query(
    'UPDATE connectors SET credentials = $1 WHERE id = $2',
    [encryptCredentials(freshCreds, ENCRYPTION_KEY), connectorId]
  )
}
```

- **Google Drive**: access tokens expire after 1 hour. `refreshCredentials()` calls `POST https://oauth2.googleapis.com/token` with the refresh token. If the refresh token is revoked (user deauthorised the app), it throws — the sync job fails with `status = 'error'`.
- **Notion / Slack**: use long-lived tokens that don't expire. `refreshCredentials()` returns `null` (no action needed).

---

## Passwords

Passwords are hashed with `bcryptjs` before storage. The cost factor defaults to 12 (2¹² = 4096 iterations), which takes ~300 ms on typical hardware — fast enough for login, slow enough to resist brute-force.

```ts
// Registration
const hash = await bcrypt.hash(plainPassword, 12)
await db.query('INSERT INTO users (password_hash, ...) VALUES ($1, ...)', [hash])

// Login
const match = await bcrypt.compare(plainPassword, storedHash)
if (!match) throw new UnauthorizedError('Invalid credentials')
```

Plain text never touches the database or logs. Even the Incharj team cannot recover a user's password — only reset it.

---

## Sessions table — revocation

Because JWT access tokens cannot be revoked (they're stateless), forced logout relies on the refresh token lifecycle:

- **Logout**: `DELETE FROM sessions WHERE id = $1` + cookie cleared. The access token remains valid for its remaining lifetime (up to 15 minutes). This is an accepted tradeoff for stateless auth.
- **Account deletion**: `users.id` has `ON DELETE CASCADE` to `sessions`. Deleting a user row deletes all their sessions — any refresh attempt immediately fails.
- **Expired sessions**: `expires_at < now()` rows are effectively dead. A background cleanup can `DELETE FROM sessions WHERE expires_at < now()` periodically without affecting correctness.

---

## Security summary

| Concern | Mechanism |
|---|---|
| Password storage | bcrypt hash, cost 12 |
| Access token | JWT HS256, 15-min expiry, signed with APP_SECRET |
| Refresh token | Opaque random, SHA-256 hashed in DB, httpOnly cookie, rotated on use |
| OAuth credentials | AES-256-GCM with random IV, stored as base64 ciphertext |
| Multi-tenant isolation | `org_id` on every table, enforced at application layer via `getCurrentMembership` |
| Token lifetime after logout | Up to 15 min (access token expiry) — accepted tradeoff for stateless JWT |
