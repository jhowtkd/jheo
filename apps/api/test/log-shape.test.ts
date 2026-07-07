import { describe, it, expect } from 'vitest';
import { Writable } from 'node:stream';
import pino from 'pino';

// pino calls `stream.write(serializedChunk)` with a single argument (no
// callback). The brief's signature `(chunk, _enc, cb)` matched Node's
// 3-arg Writable.write overload but at runtime the cb came back as
// `undefined`, so `cb()` threw "cb is not a function". Pino uses the
// synchronous "fire-and-forget" write path that Node fully supports —
// the parent's internal queue handles backpressure. The override below
// mirrors Node's own TransportStream.write (see
// node_modules/pino/lib/proto.js: stream.write(s)) and is fully
// sufficient to capture the JSON line.
class Capture extends Writable {
  lines: string[] = [];
  override write(chunk: Buffer | string, _enc?: BufferEncoding, cb?: (err?: Error | null) => void): boolean {
    this.lines.push(typeof chunk === 'string' ? chunk : chunk.toString());
    if (cb) cb();
    return true;
  }
}

describe('pino log shape', () => {
  it('emits { level, time, requestId, route, status, durationMs }', async () => {
    const cap = new Capture();
    const log = pino(
      { level: 'info', formatters: { level: (l) => ({ level: l }), bindings: () => ({}) }, timestamp: () => `,"time":${Date.now()}`, base: undefined },
      cap,
    );
    log.info({ requestId: 'a'.repeat(16), route: '/api/x', status: 200, durationMs: 12 }, 'GET /api/x 200');
    const obj = JSON.parse(cap.lines[0]!);
    expect(obj).toMatchObject({ level: 'info', requestId: 'a'.repeat(16), route: '/api/x', status: 200, durationMs: 12 });
    expect(typeof obj.time).toBe('number');
  });

  it('emits err.message and err.stack on error', () => {
    const cap = new Capture();
    const log = pino(
      { level: 'error', formatters: { level: (l) => ({ level: l }), bindings: () => ({}) }, timestamp: () => `,"time":${Date.now()}`, base: undefined },
      cap,
    );
    const err = new Error('boom');
    log.error({ requestId: 'b'.repeat(16), route: '/api/y', status: 500, durationMs: 5, err }, 'fail');
    const obj = JSON.parse(cap.lines[0]!);
    expect(obj).toMatchObject({ level: 'error', requestId: 'b'.repeat(16), status: 500, durationMs: 5 });
    expect(obj.err.message).toBe('boom');
    expect(typeof obj.err.stack).toBe('string');
  });
});
