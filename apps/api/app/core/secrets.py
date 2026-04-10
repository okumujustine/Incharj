from __future__ import annotations

import logging
import os

log = logging.getLogger(__name__)


def load_infisical() -> None:
    """Fetch secrets from Infisical and inject into os.environ.

    Uses the same env var interface as scripts/run-with-secrets.mjs so local
    dev (Makefile) and Docker (SDK) behave identically.

    Required env vars:
        INFISICAL_CLIENT_ID
        INFISICAL_CLIENT_SECRET
        INFISICAL_PROJECT_ID
        INFISICAL_ENVIRONMENT
        INFISICAL_SECRET_PATH
    Optional:
        INFISICAL_SITE_URL  (defaults to https://app.infisical.com)

    Falls back silently if credentials are absent (plain .env usage).
    Call before any settings are imported.
    """
    client_id = os.environ.get("INFISICAL_CLIENT_ID", "").strip()
    client_secret = os.environ.get("INFISICAL_CLIENT_SECRET", "").strip()

    if not client_id or not client_secret:
        log.debug("Infisical credentials not set — using local environment")
        return

    project_id = os.environ.get("INFISICAL_PROJECT_ID", "").strip()
    environment = os.environ.get("INFISICAL_ENVIRONMENT", "dev").strip()
    secret_path = os.environ.get("INFISICAL_SECRET_PATH", "/").strip()
    site_url = os.environ.get("INFISICAL_SITE_URL", "https://app.infisical.com").strip()

    if not project_id:
        raise RuntimeError("INFISICAL_PROJECT_ID is required when using Infisical")

    try:
        from infisical_sdk import InfisicalSDKClient

        client = InfisicalSDKClient(host=site_url)
        client.auth.universal_auth.login(
            client_id=client_id,
            client_secret=client_secret,
        )
        result = client.secrets.list_secrets(
            project_id=project_id,
            environment_slug=environment,
            secret_path=secret_path,
            expand_secret_references=True,
        )
        injected = 0
        for secret in result.secrets:
            if secret.secretKey not in os.environ:
                os.environ[secret.secretKey] = secret.secretValue
                injected += 1

        log.info(
            "Infisical: loaded %d secret(s) (env=%s path=%s, %d already set)",
            injected,
            environment,
            secret_path,
            len(result.secrets) - injected,
        )
    except Exception as exc:
        log.error("Failed to load secrets from Infisical: %s", exc)
        raise
