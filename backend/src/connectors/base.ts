import type { ConnectorDocument } from "../types/connector";

export type { ConnectorDocument };

export abstract class BaseConnector {
  connectorId: string;
  orgId: string;
  credentials: Record<string, unknown>;
  config: Record<string, unknown>;

  constructor(options: {
    connectorId: string;
    orgId: string;
    credentials: Record<string, unknown>;
    config?: Record<string, unknown> | null;
  }) {
    this.connectorId = options.connectorId;
    this.orgId = options.orgId;
    this.credentials = options.credentials;
    this.config = options.config ?? {};
  }

  abstract authorizeUrl(state: string): string;
  abstract exchangeCode(
    code: string,
    redirectUri: string
  ): Promise<Record<string, unknown>>;
  abstract refreshCredentials(): Promise<Record<string, unknown> | null>;
  abstract listDocuments(cursor?: string | null): AsyncGenerator<ConnectorDocument>;
  abstract fetchContent(
    externalId: string,
    metadata: Record<string, unknown>
  ): Promise<string | null>;
}
