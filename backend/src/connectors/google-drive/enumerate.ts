import type { ConnectorCheckpoint, ConnectorDocumentRef, ConnectorEnumerateInput } from "../plugin-types";
import { createLogger } from "../../utils/logger";
import { SyncErrorCode, SyncPipelineError } from "../../types/sync-errors";
import { readAccessToken } from "./auth";
import { GOOGLE_DRIVE_FILES_URL } from "./constants";
import { buildMimeTypes, parseMaxDocuments } from "./config";

const log = createLogger("google-drive-plugin");

export async function enumerateGoogleDrive(input: ConnectorEnumerateInput) {
  const configData = input.config;
  const accessToken = readAccessToken(input.credentials);

  const activeMimeTypes = buildMimeTypes(configData);
  if (!activeMimeTypes.length) {
    return { refs: [], nextCheckpoint: input.checkpoint };
  }

  const maxDocuments = parseMaxDocuments(configData.max_documents);
  const mimeQuery = activeMimeTypes.map((mimeType) => `mimeType='${mimeType}'`).join(" or ");

  const checkpointModifiedAfter =
    typeof input.checkpoint?.modifiedAfter === "string"
      ? input.checkpoint.modifiedAfter
      : null;

  let queryText = `(${mimeQuery}) and trashed=false`;
  if (checkpointModifiedAfter) {
    queryText += ` and modifiedTime > '${checkpointModifiedAfter}'`;
  }

  const refs: ConnectorDocumentRef[] = [];
  let pageToken: string | undefined =
    typeof input.checkpoint?.cursor === "string" ? input.checkpoint.cursor : undefined;
  let maxSeenMtime = checkpointModifiedAfter;
  const MAX_BINARY_FILE_SIZE = 10 * 1024 * 1024;

  while (true) {
    const remaining = maxDocuments - refs.length;
    if (remaining <= 0) {
      break;
    }

    const params = new URLSearchParams({
      q: queryText,
      fields: "nextPageToken,files(id,name,mimeType,webViewLink,modifiedTime,owners,size)",
      pageSize: String(Math.max(1, Math.min(20, remaining))),
    });
    if (pageToken) params.set("pageToken", pageToken);

    const response = await fetch(`${GOOGLE_DRIVE_FILES_URL}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new SyncPipelineError({
        code: SyncErrorCode.EnumerationFailed,
        stage: "enumeration",
        message: await response.text(),
        retriable: response.status >= 500,
      });
    }

    const data = (await response.json()) as {
      nextPageToken?: string;
      files?: Array<Record<string, unknown>>;
    };

    log.debug({ fileCount: data.files?.length ?? 0 }, "google drive page fetched");

    for (const file of data.files ?? []) {
      const externalId = String(file.id ?? "");
      const mimeType = String(file.mimeType ?? "");
      const fileSize = typeof file.size === "string" ? parseInt(file.size, 10) : 0;
      if (fileSize > MAX_BINARY_FILE_SIZE) {
        continue;
      }

      const modifiedTime = (file.modifiedTime as string | undefined) ?? null;
      if (modifiedTime && (!maxSeenMtime || modifiedTime > maxSeenMtime)) {
        maxSeenMtime = modifiedTime;
      }

      let ext: string | null = null;
      if (mimeType === "application/vnd.google-apps.document") ext = "gdoc";
      else if (mimeType === "application/vnd.google-apps.spreadsheet") ext = "gsheet";
      else if (mimeType === "application/vnd.google-apps.presentation") ext = "gslides";
      else if (typeof file.name === "string" && file.name.includes(".")) {
        ext = file.name.split(".").pop()?.toLowerCase() ?? null;
      }

      const owners = Array.isArray(file.owners) ? file.owners : [];
      const author = owners[0] as Record<string, unknown> | undefined;

      refs.push({
        externalId,
        url: (file.webViewLink as string | undefined) ?? null,
        title: (file.name as string | undefined) ?? null,
        kind: "document",
        ext,
        authorName: (author?.displayName as string | undefined) ?? null,
        authorEmail: (author?.emailAddress as string | undefined) ?? null,
        contentType: mimeType,
        sourcePath: null,
        sourceLastModifiedAt: modifiedTime,
        sourcePermissions: null,
        metadata: {
          mime_type: mimeType,
          size: file.size ?? null,
        },
      });

      if (refs.length >= maxDocuments) {
        return {
          refs,
          nextCheckpoint: {
            modifiedAfter: maxSeenMtime,
            cursor: data.nextPageToken ?? null,
          } as ConnectorCheckpoint,
        };
      }
    }

    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  return {
    refs,
    nextCheckpoint: {
      modifiedAfter: maxSeenMtime,
      cursor: null,
    } as ConnectorCheckpoint,
  };
}
