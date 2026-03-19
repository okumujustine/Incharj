// pdf-parse is a CJS module with broken ESM type declarations
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse") as (buffer: Buffer) => Promise<{ text: string }>;
import { config } from "../config";
import { registerConnectorProvider } from "./registry";
import type {
  ConnectorCheckpoint,
  ConnectorDocumentRef,
  ConnectorEnumerateInput,
  ConnectorFetchInput,
  ConnectorProvider,
} from "./plugin-types";
import { createLogger } from "../utils/logger";
import { SyncErrorCode, SyncPipelineError } from "../types/sync-errors";

const log = createLogger("google-drive-plugin");

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const GOOGLE_DRIVE_EXPORT_URL =
  "https://www.googleapis.com/drive/v3/files/{file_id}/export";
const GOOGLE_DRIVE_DOWNLOAD_URL =
  "https://www.googleapis.com/drive/v3/files/{file_id}?alt=media";

export const GOOGLE_DRIVE_FILE_TYPES = [
  { id: "google_docs", label: "Google Docs", mimeType: "application/vnd.google-apps.document", ext: "gdoc" },
  { id: "google_sheets", label: "Google Sheets", mimeType: "application/vnd.google-apps.spreadsheet", ext: "gsheet" },
  { id: "google_slides", label: "Google Slides", mimeType: "application/vnd.google-apps.presentation", ext: "gslides" },
  { id: "pdf", label: "PDF", mimeType: "application/pdf", ext: "pdf" },
  { id: "plain_text", label: "Plain Text", mimeType: "text/plain", ext: "txt" },
  { id: "markdown", label: "Markdown", mimeType: "text/markdown", ext: "md" },
  { id: "html", label: "HTML", mimeType: "text/html", ext: "html" },
  { id: "csv", label: "CSV", mimeType: "text/csv", ext: "csv" },
] as const;

const EXPORT_MIME_TYPES: Record<string, string> = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.spreadsheet": "text/csv",
  "application/vnd.google-apps.presentation": "text/plain",
};

function readAccessToken(credentials: Record<string, unknown>): string {
  const token = credentials.access_token;
  if (typeof token !== "string" || !token) {
    throw new SyncPipelineError({
      code: SyncErrorCode.Unauthorized,
      stage: "enumeration",
      message: "Missing Google access token",
      retriable: false,
    });
  }
  return token;
}

function buildMimeTypes(configData: Record<string, unknown>) {
  const enabledIds = Array.isArray(configData.file_types)
    ? (configData.file_types as string[])
    : GOOGLE_DRIVE_FILE_TYPES.map((type) => type.id);
  return GOOGLE_DRIVE_FILE_TYPES
    .filter((type) => enabledIds.includes(type.id))
    .map((type) => type.mimeType);
}

function parseMaxDocuments(configData: Record<string, unknown>): number {
  if (typeof configData.max_documents === "number" && configData.max_documents > 0) {
    return configData.max_documents;
  }
  return Number.POSITIVE_INFINITY;
}

async function enumerateGoogleDrive(input: ConnectorEnumerateInput) {
  const configData = input.config;
  const accessToken = readAccessToken(input.credentials);

  const activeMimeTypes = buildMimeTypes(configData);
  if (!activeMimeTypes.length) {
    return { refs: [], nextCheckpoint: input.checkpoint };
  }

  const maxDocuments = parseMaxDocuments(configData);
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
    const params = new URLSearchParams({
      q: queryText,
      fields: "nextPageToken,files(id,name,mimeType,webViewLink,modifiedTime,owners,size)",
      pageSize: "20",
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

async function fetchGoogleDocument(input: ConnectorFetchInput) {
  const accessToken = readAccessToken(input.credentials);
  const mimeType = input.ref.contentType ?? "";

  let response: Response;
  if (EXPORT_MIME_TYPES[mimeType]) {
    const params = new URLSearchParams({ mimeType: EXPORT_MIME_TYPES[mimeType] });
    response = await fetch(
      GOOGLE_DRIVE_EXPORT_URL.replace("{file_id}", input.ref.externalId) + `?${params.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
  } else {
    response = await fetch(
      GOOGLE_DRIVE_DOWNLOAD_URL.replace("{file_id}", input.ref.externalId),
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
  }

  if (response.status === 404) {
    return {
      content: null,
      contentType: mimeType,
      metadata: { ...input.ref.metadata, fetch_status: 404 },
    };
  }

  if (!response.ok) {
    throw new SyncPipelineError({
      code: SyncErrorCode.FetchFailed,
      stage: "fetch",
      message: await response.text(),
      retriable: response.status >= 500,
    });
  }

  const MAX_CONTENT_BYTES = 2 * 1024 * 1024;
  const reader = response.body?.getReader();
  if (!reader) {
    return { content: null, contentType: mimeType, metadata: input.ref.metadata };
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.length;
    chunks.push(value);
    if (totalBytes >= MAX_CONTENT_BYTES) {
      await reader.cancel();
      break;
    }
  }

  const buffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));

  if (mimeType === "application/pdf") {
    try {
      const parsed = await pdfParse(buffer);
      return {
        content: parsed.text.trim() || null,
        contentType: mimeType,
        metadata: input.ref.metadata,
      };
    } catch (err) {
      throw new SyncPipelineError({
        code: SyncErrorCode.ParseFailed,
        stage: "normalize",
        message: "Failed to parse PDF",
        retriable: false,
        cause: err,
      });
    }
  }

  const text = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  if (!text.trim()) {
    return {
      content: null,
      contentType: mimeType,
      metadata: input.ref.metadata,
    };
  }

  if (mimeType === "text/html") {
    return {
      content: text.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim() || null,
      contentType: mimeType,
      metadata: input.ref.metadata,
    };
  }

  return {
    content: text,
    contentType: mimeType,
    metadata: input.ref.metadata,
  };
}

const googleDriveProvider: ConnectorProvider = {
  manifest: {
    key: "google_drive",
    displayName: "Google Drive",
    authType: "oauth2",
    supportsIncremental: true,
    supportsAcl: false,
    supportedContentTypes: GOOGLE_DRIVE_FILE_TYPES.map((type) => type.mimeType),
    maxPageSize: 20,
    retryPolicy: {
      maxAttempts: 3,
      backoffMs: 2_000,
      strategy: "exponential",
    },
    capabilities: {
      supportsBinaryContent: true,
      supportsDeleteEvents: false,
      supportsWebhooks: false,
      supportsPerDocumentPermissions: false,
    },
  },
  auth: {
    authorizeUrl(state: string) {
      const params = new URLSearchParams({
        client_id: config.googleClientId,
        redirect_uri: `${config.frontendUrl}/oauth/google_drive/callback`,
        response_type: "code",
        scope: "https://www.googleapis.com/auth/drive.readonly openid email",
        access_type: "offline",
        prompt: "consent",
        state,
      });
      return `${GOOGLE_AUTH_URL}?${params.toString()}`;
    },
    async exchangeCode(code: string, redirectUri: string) {
      const response = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: config.googleClientId,
          client_secret: config.googleClientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      return (await response.json()) as Record<string, unknown>;
    },
    async refreshCredentials(credentials: Record<string, unknown>) {
      const refreshToken = credentials.refresh_token;
      if (typeof refreshToken !== "string") {
        return null;
      }

      const response = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: config.googleClientId,
          client_secret: config.googleClientSecret,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
      });
      if (!response.ok) return null;
      const refreshed = (await response.json()) as Record<string, unknown>;
      return { ...credentials, ...refreshed };
    },
  },
  plugin: {
    validateConfig(configData) {
      return (configData ?? {}) as Record<string, unknown>;
    },
    enumerate: enumerateGoogleDrive,
    fetchDocument: fetchGoogleDocument,
  },
};

registerConnectorProvider(googleDriveProvider);
