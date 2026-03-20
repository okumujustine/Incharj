import { config } from "../config";
import { OpenAIEmbeddingProvider } from "./providers/openai";
import type { EmbeddingProvider } from "./types";

let cachedProvider: EmbeddingProvider | null | undefined;

export function getEmbeddingProvider(): EmbeddingProvider | null {
  if (cachedProvider !== undefined) {
    return cachedProvider;
  }

  if (!config.semanticSearchEnabled) {
    cachedProvider = null;
    return cachedProvider;
  }

  if (config.embeddingProvider === "openai" && config.openaiApiKey) {
    cachedProvider = new OpenAIEmbeddingProvider({
      apiKey: config.openaiApiKey,
      model: config.embeddingModel,
      dimensions: config.embeddingDimensions,
      baseUrl: config.openaiBaseUrl,
      maxAttempts: config.embeddingRequestMaxAttempts,
      retryBaseDelayMs: config.embeddingRetryBaseDelayMs,
      batchSize: config.embeddingBatchSize,
    });
    return cachedProvider;
  }

  cachedProvider = null;
  return cachedProvider;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || !b.length || a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let index = 0; index < a.length; index += 1) {
    const av = a[index] ?? 0;
    const bv = b[index] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
