import type { EmbeddingProvider } from "../types";
import { createLogger } from "../../utils/logger";

const log = createLogger("ai-openai");

interface OpenAIEmbeddingsResponse {
  data: Array<{ embedding: number[]; index: number }>;
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = "openai";
  readonly model: string;
  readonly dimensions: number;
  readonly cacheNamespace: string;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly maxAttempts: number;
  private readonly retryBaseDelayMs: number;
  private readonly batchSize: number;

  constructor(options: {
    apiKey: string;
    model: string;
    dimensions: number;
    baseUrl?: string;
    maxAttempts: number;
    retryBaseDelayMs: number;
    batchSize: number;
  }) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.dimensions = options.dimensions;
    this.cacheNamespace = `${this.name}:${this.model}:${this.dimensions}`;
    this.baseUrl = options.baseUrl ?? "https://api.openai.com/v1";
    this.maxAttempts = Math.max(1, options.maxAttempts);
    this.retryBaseDelayMs = Math.max(50, options.retryBaseDelayMs);
    this.batchSize = Math.max(1, options.batchSize);
  }

  async embedOne(text: string): Promise<number[]> {
    const [embedding] = await this.embedBatch([text]);
    return embedding ?? [];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const allEmbeddings: number[][] = [];
    for (let start = 0; start < texts.length; start += this.batchSize) {
      const batch = texts.slice(start, start + this.batchSize);
      const embeddings = await this.embedBatchWithRetry(batch);
      allEmbeddings.push(...embeddings);
    }

    return allEmbeddings;
  }

  private async embedBatchWithRetry(texts: string[]): Promise<number[][]> {
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt < this.maxAttempts) {
      attempt += 1;
      try {
        return await this.embedBatchOnce(texts);
      } catch (error) {
        const err = error instanceof Error ? error : new Error("Embedding request failed");
        lastError = err;
        if (attempt >= this.maxAttempts) {
          break;
        }

        const status = (err as Error & { status?: number }).status;
        const retriable = typeof status === "number"
          ? status === 429 || status >= 500
          : true;
        if (!retriable) {
          break;
        }

        const backoffMs = this.retryBaseDelayMs * 2 ** (attempt - 1);
        log.warn({ attempt, maxAttempts: this.maxAttempts, backoffMs, err }, "embedding batch retrying");
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }

    throw lastError ?? new Error("Embedding request failed");
  }

  private async embedBatchOnce(texts: string[]): Promise<number[][]> {

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
        dimensions: this.dimensions,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      const error = new Error(`Embedding API failed (${response.status}): ${body}`) as Error & { status?: number };
      error.status = response.status;
      throw error;
    }

    const payload = (await response.json()) as OpenAIEmbeddingsResponse;
    return payload.data.sort((a, b) => a.index - b.index).map((item) => item.embedding);
  }
}
