import dotenv from "dotenv";
import { createHash } from "node:crypto";

dotenv.config();

const environment = process.env.ENVIRONMENT ?? "development";
const isProduction = environment === "production";

function getEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export const config = {
  port: Number(process.env.PORT ?? 8000),
  environment,
  isProduction,
  databaseUrl: (
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@localhost:5432/incharj"
  ).replace("postgresql+asyncpg://", "postgresql://"),
  redisUrl: process.env.REDIS_URL ?? "redis://redis:6379/0",
  appSecret: getEnv("APP_SECRET", process.env.SECRET_KEY ?? "change-me"),
  encryptionKey: getEnv(
    "ENCRYPTION_KEY",
    process.env.FERNET_KEY ?? "change-me-fernet-key"
  ),
  accessTokenExpireMinutes: Number(
    process.env.ACCESS_TOKEN_EXPIRE_MINUTES ?? 15
  ),
  refreshTokenExpireDays: Number(process.env.REFRESH_TOKEN_EXPIRE_DAYS ?? 30),
  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:5173",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  documentWorkerConcurrency: Number(process.env.DOCUMENT_WORKER_CONCURRENCY ?? 4),
  semanticSearchEnabled: process.env.SEMANTIC_SEARCH_ENABLED === "true",
  embeddingProvider: process.env.EMBEDDING_PROVIDER ?? "openai",
  embeddingModel: process.env.EMBEDDING_MODEL ?? "text-embedding-3-small",
  embeddingDimensions: Number(process.env.EMBEDDING_DIMENSIONS ?? 1536),
  embeddingBatchSize: Number(process.env.EMBEDDING_BATCH_SIZE ?? 64),
  embeddingRequestMaxAttempts: Number(process.env.EMBEDDING_MAX_ATTEMPTS ?? 4),
  embeddingRetryBaseDelayMs: Number(process.env.EMBEDDING_RETRY_BASE_DELAY_MS ?? 300),
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  openaiBaseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
};

export function getFernetKeyBytes(): Buffer {
  try {
    const decoded = Buffer.from(config.encryptionKey, "base64url");
    if (decoded.length === 32) {
      return decoded;
    }
  } catch {
    // Fall through to deterministic derivation.
  }

  return createHash("sha256").update(config.encryptionKey).digest();
}
