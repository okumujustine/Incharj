import { ABSOLUTE_CONNECTOR_DOC_CAP, GOOGLE_DRIVE_FILE_TYPES } from "./constants";

export function parseMaxDocuments(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.min(Math.floor(value), ABSOLUTE_CONNECTOR_DOC_CAP);
  }
  return ABSOLUTE_CONNECTOR_DOC_CAP;
}

export function normalizeFileTypes(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return GOOGLE_DRIVE_FILE_TYPES.map((type) => type.id);
  }

  const allowed = new Set<string>(GOOGLE_DRIVE_FILE_TYPES.map((type) => type.id));
  const selected = value
    .filter((item): item is string => typeof item === "string")
    .filter((item) => allowed.has(item));

  return selected.length ? selected : GOOGLE_DRIVE_FILE_TYPES.map((type) => type.id);
}

export function buildMimeTypes(configData: Record<string, unknown>) {
  const enabledIds = normalizeFileTypes(configData.file_types);
  return GOOGLE_DRIVE_FILE_TYPES
    .filter((type) => enabledIds.includes(type.id))
    .map((type) => type.mimeType);
}

export function validateGoogleConfig(configData: Record<string, unknown>): Record<string, unknown> {
  return {
    ...configData,
    file_types: normalizeFileTypes(configData.file_types),
    max_documents: parseMaxDocuments(configData.max_documents),
  };
}
