import type { ParsedMarkdown } from '../generation/schema.js';

export type PublishStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface PublishRequest {
  content: ParsedMarkdown;
  config: unknown;
  signal?: AbortSignal;
  termIds?: Record<string, number[]>;
}

export interface PublishResult {
  externalId?: string;
  externalUrl?: string;
  raw: { status: number; headers: Record<string, string>; body: string };
}

export interface Publisher {
  type: 'wordpress' | 'http' | 'agent';
  publish(req: PublishRequest, fetchFn: typeof fetch): Promise<PublishResult>;
}
