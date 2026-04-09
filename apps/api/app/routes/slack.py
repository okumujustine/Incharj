from __future__ import annotations

import hashlib
import hmac
import time
from typing import Any

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.core.config import settings
from app.db.pool import get_pool
from app.db.tables import connectors as connectors_t, slack_installations
from app.errors import BadRequestError, NotFoundError
from app.middleware.auth import get_current_membership, get_current_user
from app.services.search_service import full_text_search
from app.utils.security import encrypt_credentials

router = APIRouter()

# ---------------------------------------------------------------------------
# Signature verification
# ---------------------------------------------------------------------------

def _verify_slack_signature(body: bytes, timestamp: str, signature: str) -> bool:
    """Verify the request came from Slack using HMAC-SHA256."""
    if not settings.slack_signing_secret:
        return False
    # Reject requests older than 5 minutes to prevent replay attacks.
    try:
        if abs(time.time() - int(timestamp)) > 300:
            return False
    except (ValueError, TypeError):
        return False

    base = f"v0:{timestamp}:{body.decode('utf-8')}"
    expected = "v0=" + hmac.new(
        settings.slack_signing_secret.encode("utf-8"),
        base.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


# ---------------------------------------------------------------------------
# Block Kit formatting
# ---------------------------------------------------------------------------

def _format_results_as_blocks(query: str, results: list[dict[str, Any]]) -> list[dict]:
    blocks: list[dict] = [
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f":mag: *Results for* `{query}`",
            },
        },
        {"type": "divider"},
    ]

    if not results:
        blocks.append({
            "type": "section",
            "text": {"type": "mrkdwn", "text": "_No results found. Try different keywords._"},
        })
        return blocks

    for r in results[:5]:
        title = r.get("title") or "Untitled"
        url = r.get("url")
        snippet = (r.get("snippet") or "").replace("<<", "*").replace(">>", "*").strip()
        connector = r.get("connector_name") or r.get("connector_kind") or "Unknown"

        title_text = f"*<{url}|{title}>*" if url else f"*{title}*"
        source_line = f"_{connector}_"
        body = f"{title_text}  ·  {source_line}"
        if snippet:
            # Trim snippet to keep the message readable in Slack
            short = snippet[:200] + ("…" if len(snippet) > 200 else "")
            body += f"\n>{short}"

        blocks.append({"type": "section", "text": {"type": "mrkdwn", "text": body}})

    blocks.append({"type": "divider"})
    blocks.append({
        "type": "context",
        "elements": [
            {"type": "mrkdwn", "text": f"Powered by *Incharj* · {len(results)} result(s)"},
        ],
    })
    return blocks


# ---------------------------------------------------------------------------
# Slash command background handler
# ---------------------------------------------------------------------------

async def _run_search_and_reply(
    org_id: str,
    query: str,
    response_url: str,
) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await full_text_search(conn, {
            "org_id": org_id,
            "query": query,
            "limit": 5,
            "offset": 0,
        })

    blocks = _format_results_as_blocks(query, result.get("results", []))

    async with httpx.AsyncClient() as client:
        await client.post(
            response_url,
            json={"response_type": "ephemeral", "blocks": blocks},
            timeout=10.0,
        )


# ---------------------------------------------------------------------------
# Slash command endpoint
# ---------------------------------------------------------------------------

@router.post("/slack/commands")
async def slack_command(request: Request, background_tasks: BackgroundTasks) -> JSONResponse:
    body = await request.body()
    timestamp = request.headers.get("X-Slack-Request-Timestamp", "")
    signature = request.headers.get("X-Slack-Signature", "")

    if not _verify_slack_signature(body, timestamp, signature):
        return JSONResponse({"error": "Invalid signature"}, status_code=401)

    form = await request.form()
    team_id = form.get("team_id", "")
    query = (form.get("text") or "").strip()
    response_url = form.get("response_url", "")

    if not query:
        return JSONResponse({
            "response_type": "ephemeral",
            "text": "Usage: `/incharj <your search query>`",
        })

    # Look up the org for this Slack workspace.
    pool = await get_pool()
    row = await pool.fetchrow(
        select(slack_installations.c.org_id, slack_installations.c.bot_token)
        .where(slack_installations.c.team_id == team_id)
    )
    if row is None:
        return JSONResponse({
            "response_type": "ephemeral",
            "text": (
                ":warning: This Slack workspace isn't connected to Incharj yet. "
                "An admin can connect it from *Settings → Integrations* in the Incharj app."
            ),
        })

    org_id = str(row["org_id"])

    # Acknowledge immediately — Slack requires a response within 3 seconds.
    # The actual search runs in the background and POSTs to response_url.
    background_tasks.add_task(_run_search_and_reply, org_id, query, response_url)

    return JSONResponse({
        "response_type": "ephemeral",
        "text": f":hourglass: Searching for *{query}*…",
    })


# ---------------------------------------------------------------------------
# Slack OAuth install
# ---------------------------------------------------------------------------

_SLACK_SCOPES = ",".join([
    "commands",
    "chat:write",
    "app_mentions:read",
    "channels:history",
    "channels:read",
    "groups:history",
    "groups:read",
    "users:read",
    "im:history",
])


def _make_state(user_id: str) -> str:
    """Signed state token for CSRF protection: {user_id}:{ts}:{sig}."""
    ts = str(int(time.time()))
    payload = f"{user_id}:{ts}"
    sig = hmac.new(
        settings.app_secret.encode(),
        payload.encode(),
        hashlib.sha256,
    ).hexdigest()[:24]
    return f"{payload}:{sig}"


def _verify_state(state: str, user_id: str, max_age: int = 600) -> bool:
    try:
        uid, ts, sig = state.rsplit(":", 2)
        if uid != user_id:
            return False
        if abs(time.time() - int(ts)) > max_age:
            return False
        payload = f"{uid}:{ts}"
        expected = hmac.new(
            settings.app_secret.encode(),
            payload.encode(),
            hashlib.sha256,
        ).hexdigest()[:24]
        return hmac.compare_digest(expected, sig)
    except Exception:
        return False


@router.get("/slack/oauth/install")
async def slack_install(
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Return the Slack OAuth install URL. The frontend opens this in a new tab."""
    if not settings.slack_client_id:
        raise BadRequestError("Slack integration is not configured on this server")

    state = _make_state(str(current_user["id"]))
    redirect_uri = f"{settings.frontend_url}/slack/oauth/callback"
    url = (
        "https://slack.com/oauth/v2/authorize"
        f"?client_id={settings.slack_client_id}"
        f"&scope={_SLACK_SCOPES}"
        f"&redirect_uri={redirect_uri}"
        f"&state={state}"
    )
    return {"url": url, "state": state}


@router.post("/slack/oauth/callback")
async def slack_oauth_callback(
    body: dict,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """Exchange the Slack OAuth code for a bot token and save the installation.

    The frontend receives ?code=...&state=... from Slack's redirect, then POSTs
    both values here along with the original state for CSRF verification.
    """
    code: str = body.get("code", "")
    state: str = body.get("state", "")

    if not code:
        raise BadRequestError("Missing OAuth code")

    if not _verify_state(state, str(current_user["id"])):
        raise BadRequestError("Invalid or expired state parameter")

    redirect_uri = f"{settings.frontend_url}/slack/oauth/callback"

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://slack.com/api/oauth.v2.access",
            data={
                "client_id": settings.slack_client_id,
                "client_secret": settings.slack_client_secret,
                "code": code,
                "redirect_uri": redirect_uri,
            },
            timeout=15.0,
        )

    data = resp.json()
    if not data.get("ok"):
        raise BadRequestError(f"Slack OAuth failed: {data.get('error', 'unknown')}")

    team_id: str = data["team"]["id"]
    team_name: str = data["team"]["name"]
    bot_token: str = data["access_token"]
    installed_by: str = data.get("authed_user", {}).get("id", "")

    pool = await get_pool()
    from app.sql.orgs import select_user_primary_org
    org_row = await pool.fetchrow(select_user_primary_org(str(current_user["id"])))
    if not org_row:
        raise NotFoundError("No organization found for this user")
    org_id = str(org_row["id"])

    encrypted_token = encrypt_credentials({"bot_token": bot_token})

    # Upsert into slack_installations (OAuth metadata + token per workspace).
    install_stmt = pg_insert(slack_installations).values(
        org_id=org_id,
        team_id=team_id,
        team_name=team_name,
        bot_token=encrypted_token,
        installed_by_slack_user=installed_by,
        installed_at=func.now(),
    ).on_conflict_do_update(
        index_elements=[slack_installations.c.team_id],
        set_={
            "org_id": org_id,
            "team_name": team_name,
            "bot_token": encrypted_token,
            "installed_by_slack_user": installed_by,
            "installed_at": func.now(),
        },
    )
    await pool.execute(install_stmt)

    # Also push the token into the Slack connector row so the indexer picks it up.
    await pool.execute(
        update(connectors_t)
        .where(
            connectors_t.c.org_id == org_id,
            connectors_t.c.kind == "slack",
        )
        .values(credentials=encrypted_token, status="idle", updated_at=func.now())
    )

    return JSONResponse({"ok": True, "team": team_name})


# ---------------------------------------------------------------------------
# Slack installation management (settings page)
# ---------------------------------------------------------------------------

@router.get("/orgs/{slug}/slack")
async def slack_get_installation(
    slug: str,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Return the Slack installation status for an org."""
    membership = await get_current_membership(slug, str(current_user["id"]))
    pool = await get_pool()
    row = await pool.fetchrow(
        select(
            slack_installations.c.team_id,
            slack_installations.c.team_name,
            slack_installations.c.installed_at,
        ).where(slack_installations.c.org_id == membership["org_id"])
    )
    if not row:
        return {"connected": False}
    return {
        "connected": True,
        "team_id": row["team_id"],
        "team_name": row["team_name"],
        "installed_at": row["installed_at"].isoformat() if row["installed_at"] else None,
    }


@router.delete("/orgs/{slug}/slack", status_code=204)
async def slack_disconnect(
    slug: str,
    current_user: dict = Depends(get_current_user),
) -> None:
    """Disconnect the Slack integration for an org."""
    membership = await get_current_membership(slug, str(current_user["id"]))
    from app.middleware.auth import require_role
    require_role(membership, ["owner", "admin"])

    pool = await get_pool()
    await pool.execute(
        delete(slack_installations).where(
            slack_installations.c.org_id == membership["org_id"]
        )
    )
