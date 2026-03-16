import { config } from "../config";
import { BaseConnector, type ConnectorDocument } from "./base";
import { registerConnector } from "./registry";
import { createLogger } from "../utils/logger";

const log = createLogger("google-drive");

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const GOOGLE_DRIVE_EXPORT_URL =
  "https://www.googleapis.com/drive/v3/files/{file_id}/export";
const GOOGLE_DRIVE_DOWNLOAD_URL =
  "https://www.googleapis.com/drive/v3/files/{file_id}?alt=media";

const SUPPORTED_MIME_TYPES = [
  "application/vnd.google-apps.document",
  "application/vnd.google-apps.spreadsheet",
  "application/vnd.google-apps.presentation",
  "application/pdf",
  "text/plain",
  "text/markdown"
] as const;

const EXPORT_MIME_TYPES: Record<string, string> = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.spreadsheet": "text/csv",
  "application/vnd.google-apps.presentation": "text/plain"
};

@registerConnector("google_drive")
export class GoogleDriveConnector extends BaseConnector {
  authorizeUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: config.googleClientId,
      redirect_uri: `${config.frontendUrl}/oauth/google_drive/callback`,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/drive.readonly openid email",
      access_type: "offline",
      prompt: "consent",
      state
    });
    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(code: string, redirectUri: string) {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.googleClientId,
        client_secret: config.googleClientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code"
      })
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return (await response.json()) as Record<string, unknown>;
  }

  async refreshCredentials() {
    const refreshToken = this.credentials.refresh_token;
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
        grant_type: "refresh_token"
      })
    });
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as Record<string, unknown>;
    this.credentials = { ...this.credentials, ...data };
    return this.credentials;
  }

  async *listDocuments(cursor?: string | null): AsyncGenerator<ConnectorDocument> {
    const accessToken = String(this.credentials.access_token ?? "");
    let pageToken = cursor ?? undefined;
    const mimeQuery = SUPPORTED_MIME_TYPES.map(
      (mimeType) => `mimeType='${mimeType}'`
    ).join(" or ");
    let query = `(${mimeQuery}) and trashed=false`;
    const lastSyncedAt =
      typeof this.config.last_synced_at === "string"
        ? this.config.last_synced_at
        : undefined;
    if (lastSyncedAt) {
      query += ` and modifiedTime > '${lastSyncedAt}'`;
    }

    while (true) {
      const params = new URLSearchParams({
        q: query,
        fields: "nextPageToken,files(id,name,mimeType,webViewLink,modifiedTime,owners,size)",
        pageSize: "20"
      });
      if (pageToken) {
        params.set("pageToken", pageToken);
      }

      const response = await fetch(`${GOOGLE_DRIVE_FILES_URL}?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = (await response.json()) as {
        nextPageToken?: string;
        files?: Array<Record<string, unknown>>;
      };

      log.debug({ fileCount: data.files?.length ?? 0 }, "google drive page fetched");

      const MAX_BINARY_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
      for (const file of data.files ?? []) {
        const mimeType = String(file.mimeType ?? "");
        const fileSize = typeof file.size === "string" ? parseInt(file.size, 10) : 0;
        if (fileSize > MAX_BINARY_FILE_SIZE) {
          log.debug({ externalId: file.id, fileSize }, "skipping large file");
          continue;
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

        yield {
          external_id: String(file.id),
          url: (file.webViewLink as string | undefined) ?? null,
          title: (file.name as string | undefined) ?? null,
          kind: "document",
          ext,
          author_name: (author?.displayName as string | undefined) ?? null,
          author_email: (author?.emailAddress as string | undefined) ?? null,
          mtime: (file.modifiedTime as string | undefined) ?? null,
          metadata: {
            mime_type: mimeType,
            size: file.size ?? null
          }
        };
      }

      pageToken = data.nextPageToken;
      if (!pageToken) {
        break;
      }
    }
  }

  async fetchContent(
    externalId: string,
    metadata: Record<string, unknown>
  ): Promise<string | null> {
    const accessToken = String(this.credentials.access_token ?? "");
    const mimeType = String(metadata.mime_type ?? "");

    let response: Response;
    if (EXPORT_MIME_TYPES[mimeType]) {
      const params = new URLSearchParams({ mimeType: EXPORT_MIME_TYPES[mimeType] });
      response = await fetch(
        GOOGLE_DRIVE_EXPORT_URL.replace("{file_id}", externalId) +
          `?${params.toString()}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );
    } else {
      response = await fetch(
        GOOGLE_DRIVE_DOWNLOAD_URL.replace("{file_id}", externalId),
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );
    }

    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(await response.text());
    }

    // Stream with a 2MB cap to avoid OOM on large exports
    const MAX_CONTENT_BYTES = 2 * 1024 * 1024;
    const reader = response.body?.getReader();
    if (!reader) return null;

    const decoder = new TextDecoder("utf-8", { fatal: false });
    let result = "";
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.length;
      result += decoder.decode(value, { stream: true });
      if (totalBytes >= MAX_CONTENT_BYTES) {
        await reader.cancel();
        break;
      }
    }
    result += decoder.decode();

    return result.trim() ? result : null;
  }
}
