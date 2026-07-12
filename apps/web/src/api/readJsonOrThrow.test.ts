import { describe, it, expect } from 'vitest';
import { readJsonOrThrow } from './readJsonOrThrow.js';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('readJsonOrThrow', () => {
  it('returns parsed JSON on 200', async () => {
    const data = await readJsonOrThrow<{ id: string }>(jsonResponse(200, { id: 'p1' }), 'projects');
    expect(data).toEqual({ id: 'p1' });
  });

  it('throws backend_unavailable on 503', async () => {
    await expect(
      readJsonOrThrow(jsonResponse(503, { error: 'backend_unavailable' }), 'projects'),
    ).rejects.toThrow('backend_unavailable');
  });

  it('throws backend_unavailable on 503 even without body', async () => {
    await expect(
      readJsonOrThrow(new Response('', { status: 503 }), 'projects'),
    ).rejects.toThrow('backend_unavailable');
  });

  it('throws Failed to load <label>: <status> for other errors without error field', async () => {
    await expect(
      readJsonOrThrow(jsonResponse(500, {}), 'health'),
    ).rejects.toThrow('Failed to load health: 500');
  });

  it('throws body.error string when present', async () => {
    await expect(
      readJsonOrThrow(jsonResponse(400, { error: 'rate_limited' }), 'translate'),
    ).rejects.toThrow('rate_limited');
  });
});
