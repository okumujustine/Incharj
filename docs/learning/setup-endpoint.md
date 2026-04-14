THE /setup ENDPOINT — LINE BY LINE
====================================


THE TWO ENDPOINTS IN THIS FILE
--------------------------------

  GET  /setup/status   → tells you if the app has been set up yet
  POST /setup          → actually runs the first-time setup

They work as a pair. The frontend calls GET /setup/status first to decide
whether to show the setup page or the login page.


_is_initialized() — THE GATE CHECK
-------------------------------------

  async def _is_initialized() -> bool:
      engine = get_engine()
      async with engine.connect() as conn:
          result = await conn.execute(select(func.count()).select_from(organizations))
          count = result.scalar()
          return (count or 0) > 0

This runs the SQL equivalent of:

  SELECT COUNT(*) FROM organizations;

  - If count = 0  → no organizations exist → app is NOT initialized → returns False
  - If count > 0  → at least one org exists → app is initialized    → returns True

Two things worth noting:

get_engine() vs get_pool() — this function uses the SQLAlchemy engine directly
instead of the asyncpg connection pool used elsewhere. The reason is this check
runs very early, before setup is called, so it needs a raw low-dependency
connection. The engine is always available; the pool is initialized lazily.

(count or 0) — defensive guard in case the query returns None instead of 0.
Without it, None > 0 would throw a TypeError.


GET /setup/status
------------------

  @router.get("/setup/status")
  async def setup_status() -> dict:
      return {"initialized": await _is_initialized()}

Calls _is_initialized() and wraps the result.

Returns either:
  {"initialized": false}   ← show setup page
  {"initialized": true}    ← show login page

No authentication required — this endpoint is intentionally public. The
frontend needs it before any user exists.


POST /setup — THE MAIN EVENT
------------------------------

  @router.post("/setup", status_code=201)
  async def setup(body: SetupSchema, request: Request) -> JSONResponse:

status_code=201 — 201 means "Created". Something new was created (a user,
an org, a session). 200 means "OK" which is for reads. Using 201 here is
semantically correct.

body: SetupSchema — the Pydantic model. FastAPI validates the incoming JSON
against this schema before your function runs. If email is missing or
malformed, it returns a 422 automatically.

request: Request — kept alongside body because you need the raw request to
read user-agent and the client IP for session tracking.


GUARD AGAINST RUNNING TWICE
-----------------------------

  if await _is_initialized():
      raise ConflictError("This instance is already set up")

ConflictError maps to HTTP 409 Conflict. This is the only protection against
someone calling POST /setup a second time. Once any org exists, this returns
409 and stops.


COLLECTING SESSION METADATA
-----------------------------

  meta = {
      "user_agent": request.headers.get("user-agent"),
      "ip_address": request.client.host if request.client else None,
  }

Grabs two pieces of context from the HTTP request:

  user-agent  — the browser/client identifier (e.g. "Mozilla/5.0 ...")
  ip_address  — the caller's IP. The "if request.client else None" guard
                handles cases where the client object is missing (tests,
                certain proxy setups).

These get stored in the sessions table alongside the refresh token.


CREATING EVERYTHING IN ONE CALL
---------------------------------

  pool = await get_pool()
  async with pool.acquire() as conn:
      result = await register_user(conn, body.model_dump(), meta)

get_pool() returns the asyncpg connection pool.
pool.acquire() checks out one connection for the duration of this block.

body.model_dump() converts the Pydantic model to a plain dict:
  {
      "org_name": "Acme Corp",
      "full_name": "Jane Smith",
      "email": "jane@acme.com",
      "password": "supersecret"
  }

register_user does four things in sequence inside one connection:
  1. INSERT INTO users
  2. INSERT INTO organizations
  3. INSERT INTO memberships  (role = owner)
  4. INSERT INTO sessions     (refresh token)

result comes back as:
  {
      "token_response": {"access_token": "...", "token_type": "bearer", "expires_in": 900},
      "refresh_token": "a3f9b2c1..."
  }


BUILDING THE RESPONSE
----------------------

  response = JSONResponse(content=result["token_response"], status_code=201)
  response.set_cookie(
      key=settings.refresh_cookie_name,
      value=result["refresh_token"],
      httponly=True,
      samesite=settings.cookie_samesite,
      secure=settings.cookie_secure,
      max_age=settings.refresh_token_expire_days * 24 * 3600,
      path="/",
  )

The response does two things at once:

BODY — the access token goes in the JSON body so the frontend can store it
in memory and attach it to requests:
  {"access_token": "eyJhbGci...", "token_type": "bearer", "expires_in": 900}

COOKIE — the refresh token goes in an httponly cookie.

  httponly=True  → JavaScript cannot read this cookie. Prevents XSS attacks
                   from stealing the token.
  samesite       → Controls cross-site sending. "lax" is the typical value.
  secure         → True in production means cookie only sent over HTTPS.
  max_age        → 30 days in seconds. How long the browser keeps the cookie.
  path="/"       → Cookie is sent for all paths, not just /setup.

WHY THE SPLIT: The access token needs to be readable by JavaScript (the
frontend puts it in the Authorization header). The refresh token does NOT
need to be readable by JavaScript — it only needs to be sent automatically
by the browser when calling /auth/refresh. Putting it in httponly means even
if someone injects malicious JS into your page, they cannot steal the refresh
token.


FULL FLOW IN ONE PICTURE
-------------------------

  POST /setup  {org_name, full_name, email, password}
        |
        v
  SetupSchema validates → 422 if invalid
        |
        v
  _is_initialized() → 409 if already set up
        |
        v
  register_user()
    |-- INSERT INTO users
    |-- INSERT INTO organizations
    |-- INSERT INTO memberships  (role = owner)
    └── INSERT INTO sessions     (refresh token)
        |
        v
  Response 201
    |-- body:   {access_token, token_type, expires_in}
    └── cookie: refresh_token (httponly, secure)

After this completes the user is fully logged in and the system is ready.
GET /setup/status will now return {"initialized": true} forever.


CAN setup/status EVER GO BACK TO FALSE?
-----------------------------------------

Short answer: yes — but only through direct database manipulation, not
through normal app usage.

Remember the check is simply:
  SELECT COUNT(*) FROM organizations;

So {"initialized": false} comes back if that count drops to 0.

Here is every scenario where that could happen:

1. MANUAL DATABASE DELETE (most likely)
   Someone runs:
     DELETE FROM organizations;
   or drops and recreates the database entirely. The app has no
   endpoint that does this, so it would have to be done directly
   against PostgreSQL.

2. CASCADE DELETE
   The organizations table has CASCADE DELETE relationships. If
   something deletes the last organization row (e.g. a future
   "delete org" endpoint), the count drops to 0 and setup/status
   returns false again. There is no such endpoint today but it is
   worth knowing.

3. FRESH ENVIRONMENT
   A new deployment against a fresh database (e.g. a new staging
   environment, a Docker volume that was wiped). The table exists
   but has zero rows, so initialized is false again.

4. TEST TEARDOWN
   Integration tests that truncate the database between runs will
   also see initialized: false at the start of each test.

WHAT HAPPENS IF IT GOES FALSE AGAIN?
   - GET /setup/status returns {"initialized": false}
   - POST /setup would succeed again and create a brand new org and owner
   - The 409 guard only fires if an org already exists
   - Any users, documents, connectors from the previous setup still exist
     in the database if you only deleted the organization row — but they
     would be orphaned (no org to belong to)

THE RISK:
   There is no "re-setup" protection beyond the organization count. If
   someone deletes all orgs, the app happily accepts a new POST /setup
   and creates a fresh owner. The old data is not cleaned up. This is
   worth hardening in the future — for example by checking for existing
   users too, not just organizations.
