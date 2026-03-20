import type { ConnectorFetchInput } from "../plugin-types";
import { SyncErrorCode, SyncPipelineError } from "../../types/sync-errors";
import { readAccessToken } from "./auth";
import {
  EXPORT_MIME_TYPES,
  GOOGLE_DRIVE_DOWNLOAD_URL,
  GOOGLE_DRIVE_EXPORT_URL,
} from "./constants";

// pdf-parse is a CJS module with broken ESM type declarations
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse") as (buffer: Buffer) => Promise<{ text: string }>;

export async function fetchGoogleDocument(input: ConnectorFetchInput) {
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
