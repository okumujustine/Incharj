from __future__ import annotations

import logging
from typing import Any

import httpx

from app.connectors.google_drive.auth import read_access_token
from app.connectors.google_drive.config import build_mime_types, parse_max_documents
from app.connectors.google_drive.constants import GOOGLE_DRIVE_FILES_URL
from app.connectors.plugin_types import (
    ConnectorCheckpoint,
    ConnectorDocumentRef,
    ConnectorEnumerateInput,
    ConnectorEnumerationResult,
)

log = logging.getLogger("google-drive-plugin")

MAX_BINARY_FILE_SIZE = 10 * 1024 * 1024


async def enumerate_google_drive(input: ConnectorEnumerateInput) -> ConnectorEnumerationResult:
    config_data = input.config
    access_token = read_access_token(input.credentials)

    active_mime_types = build_mime_types(config_data)
    if not active_mime_types:
        return ConnectorEnumerationResult(refs=[], next_checkpoint=input.checkpoint)

    max_documents = parse_max_documents(config_data.get("max_documents"))
    mime_query = " or ".join(f"mimeType='{m}'" for m in active_mime_types)

    checkpoint_modified_after: str | None = None
    if input.checkpoint and isinstance(input.checkpoint.modified_after, str):
        checkpoint_modified_after = input.checkpoint.modified_after

    query_text = f"({mime_query}) and trashed=false"
    if checkpoint_modified_after:
        query_text += f" and modifiedTime > '{checkpoint_modified_after}'"

    refs: list[ConnectorDocumentRef] = []
    page_token: str | None = (
        input.checkpoint.cursor
        if input.checkpoint and isinstance(input.checkpoint.cursor, str)
        else None
    )
    max_seen_mtime: str | None = checkpoint_modified_after

    # When page_limit is set, fetch exactly one API page and return with the next cursor
    # so the caller can save the cursor and resume on crash.
    page_size = min(input.page_limit or 100, 100)  # Google Drive max pageSize is 100

    async with httpx.AsyncClient() as client:
        while True:
            remaining = max_documents - len(refs)
            if remaining <= 0:
                break

            params: dict[str, str] = {
                "q": query_text,
                "fields": "nextPageToken,files(id,name,mimeType,webViewLink,modifiedTime,owners,size)",
                "pageSize": str(max(1, min(page_size, remaining))),
            }
            if page_token:
                params["pageToken"] = page_token

            response = await client.get(
                GOOGLE_DRIVE_FILES_URL,
                params=params,
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=30.0,
            )

            if response.status_code != 200:
                from app.types.sync_errors import SyncErrorCode, SyncPipelineError
                if response.status_code == 401 or response.status_code == 403:
                    raise SyncPipelineError(
                        code=SyncErrorCode.UNAUTHORIZED,
                        stage="enumeration",
                        message="Google Drive access denied — reconnect the connector to grant the required permissions.",
                        retriable=False,
                    )
                if response.status_code == 400 and page_token:
                    # Page token expired — restart from the beginning without it
                    log.warning("google drive pageToken invalid, restarting enumeration from scratch")
                    page_token = None
                    refs = []
                    continue
                raise SyncPipelineError(
                    code=SyncErrorCode.ENUMERATION_FAILED,
                    stage="enumeration",
                    message=response.text,
                    retriable=response.status_code >= 500,
                )

            data = response.json()
            files: list[dict[str, Any]] = data.get("files", [])
            log.debug("google drive page fetched file_count=%d", len(files))

            for file in files:
                external_id = str(file.get("id", ""))
                mime_type = str(file.get("mimeType", ""))
                file_size = int(file.get("size", 0) or 0)
                if file_size > MAX_BINARY_FILE_SIZE:
                    continue

                modified_time: str | None = file.get("modifiedTime")
                if modified_time and (not max_seen_mtime or modified_time > max_seen_mtime):
                    max_seen_mtime = modified_time

                ext: str | None = None
                if mime_type == "application/vnd.google-apps.document":
                    ext = "gdoc"
                elif mime_type == "application/vnd.google-apps.spreadsheet":
                    ext = "gsheet"
                elif mime_type == "application/vnd.google-apps.presentation":
                    ext = "gslides"
                else:
                    name = str(file.get("name", ""))
                    if "." in name:
                        ext = name.rsplit(".", 1)[-1].lower()

                owners = file.get("owners", []) or []
                author = owners[0] if owners else None

                refs.append(ConnectorDocumentRef(
                    external_id=external_id,
                    url=file.get("webViewLink"),
                    title=file.get("name"),
                    kind="document",
                    ext=ext,
                    author_name=author.get("displayName") if author else None,
                    author_email=author.get("emailAddress") if author else None,
                    content_type=mime_type,
                    source_path=None,
                    source_last_modified_at=modified_time,
                    source_permissions=None,
                    metadata={"mime_type": mime_type, "size": file.get("size")},
                ))

                if len(refs) >= max_documents:
                    return ConnectorEnumerationResult(
                        refs=refs,
                        next_checkpoint=ConnectorCheckpoint(
                            modified_after=max_seen_mtime,
                            cursor=data.get("nextPageToken"),
                        ),
                    )

            next_page_token = data.get("nextPageToken")

            # When page_limit is set, return after one API page so the caller can
            # persist the cursor before fetching the next page.
            if input.page_limit is not None:
                return ConnectorEnumerationResult(
                    refs=refs,
                    next_checkpoint=ConnectorCheckpoint(
                        modified_after=max_seen_mtime,
                        cursor=next_page_token,
                    ),
                )

            page_token = next_page_token
            if not page_token:
                break

    return ConnectorEnumerationResult(
        refs=refs,
        next_checkpoint=ConnectorCheckpoint(modified_after=max_seen_mtime, cursor=None),
    )
