import { config } from "../../config";
import type { ConnectorProvider } from "../plugin-types";
import { registerConnectorProvider } from "../registry";
import {
  GOOGLE_AUTH_URL,
  GOOGLE_DRIVE_FILE_TYPES,
  GOOGLE_TOKEN_URL,
} from "./constants";
import { validateGoogleConfig } from "./config";
import { enumerateGoogleDrive } from "./enumerate";
import { fetchGoogleDocument } from "./fetch";

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
      return validateGoogleConfig((configData ?? {}) as Record<string, unknown>);
    },
    enumerate: enumerateGoogleDrive,
    fetchDocument: fetchGoogleDocument,
  },
};

registerConnectorProvider(googleDriveProvider);
