export interface EmbeddingProvider {
  readonly name: string;
  readonly model: string;
  readonly dimensions: number;
  readonly cacheNamespace: string;
  embedOne(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}
