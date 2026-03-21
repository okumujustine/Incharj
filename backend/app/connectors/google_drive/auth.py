from __future__ import annotations


def read_access_token(credentials: dict) -> str:
    token = credentials.get("access_token")
    if not token:
        raise ValueError("Missing Google access token")
    return str(token)