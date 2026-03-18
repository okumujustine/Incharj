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

**Access token** — JWT signed with `APP_SECRET` (`jose`). Payload: `{ sub: userId, email, name }`. Verified on every protected request in `middleware/auth.ts`.

**Refresh token** — opaque random string stored in the `sessions` table and in an httpOnly, `sameSite=lax` cookie. Rotated on every use — if a refresh token is stolen and used, the legitimate user's next request will fail and they'll be logged out.

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
| `requireCurrentUser` | Verifies JWT, loads user from DB, attaches to `request.user`. Throws 401 if missing or invalid. |
| `getCurrentMembership` | Confirms the user is a member of the org in the URL slug. Throws 403 if not. |
| `requireRole` | Throws 403 if membership role is not in the allowed list. |

**Roles**: `owner` (full access) · `admin` (connectors + members) · `member` (read only)

---

## Connector OAuth — credential storage

OAuth tokens from Google, Notion, and Slack are encrypted before storage:

```
exchangeCode(code) → { access_token, refresh_token, ... }
       │
encryptCredentials()   ← AES-GCM, key from ENCRYPTION_KEY env var
       │
stored in connectors.credentials  (TEXT column, base64-encoded ciphertext)
       │
decryptCredentials()   ← only called in worker/runner.ts at sync start
```

Credentials are never logged or returned via the API. The only place they are decrypted is `runner.ts`, immediately before the connector uses them to call the external API.

---

## Passwords

Stored as bcrypt hashes (via `bcryptjs`). Plain text never touches the database or logs.
