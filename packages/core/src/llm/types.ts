export interface LLMRequest {
  prompt: string;
  system?: string;
  config: { model: string; temperature?: number; maxTokens?: number };
  signal?: AbortSignal;
}

export interface LLMResponse {
  text: string;
  usage: { promptTokens: number; completionTokens: number };
  provider: string;
  model: string;
}

export interface LLMProvider {
  complete(req: LLMRequest, fetchFn: typeof fetch): Promise<LLMResponse>;
}

export interface EmbeddingRequest {
  inputs: string[];
  model?: string;
  signal?: AbortSignal;
}

export interface EmbeddingResponse {
  embeddings: number[][];
  model: string;
}

export interface EmbeddingProvider {
  embed(req: EmbeddingRequest, fetchFn: typeof fetch): Promise<EmbeddingResponse>;
}
