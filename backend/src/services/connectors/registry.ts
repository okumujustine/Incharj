import { BaseConnector } from "./base";

type ConnectorCtor = new (options: {
  connectorId: string;
  orgId: string;
  credentials: Record<string, unknown>;
  config?: Record<string, unknown> | null;
}) => BaseConnector;

const registry = new Map<string, ConnectorCtor>();

export function registerConnector(kind: string) {
  return function register<T extends ConnectorCtor>(connectorClass: T): T {
    registry.set(kind, connectorClass);
    return connectorClass;
  };
}

export function getConnector(options: {
  kind: string;
  connectorId: string;
  orgId: string;
  credentials: Record<string, unknown>;
  config?: Record<string, unknown> | null;
}) {
  const ConnectorClass = registry.get(options.kind);
  if (!ConnectorClass) {
    throw new Error(`No connector registered for kind: ${options.kind}`);
  }
  return new ConnectorClass(options);
}

export async function loadConnectors() {
  await Promise.all([
    import("./google-drive"),
    import("./notion"),
    import("./slack")
  ]);
}
