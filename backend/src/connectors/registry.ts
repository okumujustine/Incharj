import type { ConnectorProvider } from "./plugin-types";

const providerRegistry = new Map<string, ConnectorProvider>();

export function registerConnectorProvider(provider: ConnectorProvider): ConnectorProvider {
  providerRegistry.set(provider.manifest.key, provider);
  return provider;
}

export function getConnectorProvider(kind: string): ConnectorProvider {
  const registered = providerRegistry.get(kind);
  if (registered) return registered;
  throw new Error(`No connector provider registered for kind: ${kind}`);
}

export async function loadConnectors() {
  await Promise.all([
    import("./google-drive")
  ]);
}
