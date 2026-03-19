export type ConnectorAuthType = "oauth2" | "api_key" | "none";

export interface ConnectorRetryPolicy {
  maxAttempts: number;
  backoffMs: number;
  strategy: "fixed" | "exponential";
}

export interface ConnectorManifest {
  key: string;
  displayName: string;
  authType: ConnectorAuthType;
  supportsIncremental: boolean;
  supportsAcl: boolean;
  supportedContentTypes: string[];
  maxPageSize: number;
  retryPolicy: ConnectorRetryPolicy;
  capabilities?: {
    supportsWebhooks?: boolean;
    supportsBinaryContent?: boolean;
    supportsDeleteEvents?: boolean;
    supportsPartialContent?: boolean;
    supportsPerDocumentPermissions?: boolean;
  };
}

export interface ConnectorCheckpoint {
  cursor?: string | null;
  modifiedAfter?: string | null;
  [key: string]: unknown;
}

export interface ConnectorDocumentRef {
  externalId: string;
  title: string | null;
  url: string | null;
  kind: string | null;
  ext: string | null;
  authorName: string | null;
  authorEmail: string | null;
  contentType: string | null;
  sourcePath: string | null;
  sourceLastModifiedAt: string | null;
  sourcePermissions: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
}

export interface ConnectorFetchedDocument {
  content: string | null;
  contentType?: string | null;
  sourcePath?: string | null;
  sourcePermissions?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}

export interface ConnectorPluginContext {
  orgId: string;
  connectorId: string;
  credentials: Record<string, unknown>;
}

export interface ConnectorEnumerateInput extends ConnectorPluginContext {
  config: Record<string, unknown>;
  checkpoint: ConnectorCheckpoint | null;
}

export interface ConnectorFetchInput extends ConnectorPluginContext {
  config: Record<string, unknown>;
  ref: ConnectorDocumentRef;
}

export interface ConnectorEnumerationResult {
  refs: ConnectorDocumentRef[];
  nextCheckpoint: ConnectorCheckpoint | null;
}

export interface ConnectorPlugin {
  validateConfig(config: Record<string, unknown> | null | undefined): Record<string, unknown>;
  enumerate(input: ConnectorEnumerateInput): Promise<ConnectorEnumerationResult>;
  fetchDocument(input: ConnectorFetchInput): Promise<ConnectorFetchedDocument>;
  testConnection?(input: ConnectorPluginContext): Promise<void>;
}

export interface ConnectorAuthProvider {
  authorizeUrl(state: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<Record<string, unknown>>;
  refreshCredentials?(credentials: Record<string, unknown>): Promise<Record<string, unknown> | null>;
}

export interface ConnectorProvider {
  manifest: ConnectorManifest;
  plugin: ConnectorPlugin;
  auth: ConnectorAuthProvider;
}
