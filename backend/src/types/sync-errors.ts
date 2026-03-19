export type SyncStage = "enumeration" | "fetch" | "normalize" | "index" | "checkpoint";

export const SyncErrorCode = {
  ConnectorNotFound: "CONNECTOR_NOT_FOUND",
  InvalidConfig: "INVALID_CONFIG",
  Unauthorized: "UNAUTHORIZED",
  EnumerationFailed: "ENUMERATION_FAILED",
  FetchFailed: "FETCH_FAILED",
  EmptyContent: "EMPTY_CONTENT",
  ParseFailed: "PARSE_FAILED",
  IndexingFailed: "INDEXING_FAILED",
  CheckpointFailed: "CHECKPOINT_FAILED",
  Unknown: "UNKNOWN",
} as const;

export type SyncErrorCodeValue = (typeof SyncErrorCode)[keyof typeof SyncErrorCode];

export class SyncPipelineError extends Error {
  code: SyncErrorCodeValue;
  stage: SyncStage;
  retriable: boolean;

  constructor(options: {
    code: SyncErrorCodeValue;
    message: string;
    stage: SyncStage;
    retriable?: boolean;
    cause?: unknown;
  }) {
    super(options.message);
    this.name = "SyncPipelineError";
    this.code = options.code;
    this.stage = options.stage;
    this.retriable = options.retriable ?? false;
    if (options.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

export function toSyncPipelineError(error: unknown, fallbackStage: SyncStage): SyncPipelineError {
  if (error instanceof SyncPipelineError) return error;
  const message = error instanceof Error ? error.message : "Unknown sync error";
  return new SyncPipelineError({
    code: SyncErrorCode.Unknown,
    stage: fallbackStage,
    message,
    retriable: false,
    cause: error,
  });
}
