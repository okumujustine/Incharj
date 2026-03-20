import { SyncErrorCode, SyncPipelineError } from "../../types/sync-errors";

export function readAccessToken(credentials: Record<string, unknown>): string {
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
