import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createGzip, createBrotliCompress } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

/**
 * Minimal response-compression plugin — replaces @fastify/compress without
 * taking on the dependency. Honours the standard `Accept-Encoding` request
 * header and compresses any payload the route handler returns as a string
 * or Buffer (the typical JSON response case). Binary passthrough otherwise.
 *
 * Tuned for the bulk of our endpoints (templates/projects/channels lists
 * and generation output, which can be many KB).
 */
const COMPRESSIBLE_TYPES = [
  'application/json',
  'text/plain',
  'text/markdown',
  'text/html',
  'application/javascript',
  'text/css',
];
const MIN_BYTES = 1024; // don't bother compressing tiny payloads

export async function responseCompressionPlugin(app: FastifyInstance): Promise<void> {
  app.addHook('onSend', async (req: FastifyRequest, reply: FastifyReply, payload) => {
    const accept = (req.headers['accept-encoding'] ?? '') as string;
    const contentType = (reply.getHeader('content-type') ?? '') as string;
    const baseType = String(contentType).split(';')[0]?.trim().toLowerCase();
    if (!baseType || !COMPRESSIBLE_TYPES.includes(baseType)) return payload;
    // buffer must be big enough to benefit; tiny JSON gets bigger not smaller.
    const size =
      typeof payload === 'string'
        ? Buffer.byteLength(payload)
        : Buffer.isBuffer(payload)
          ? payload.byteLength
          : 0;
    if (size < MIN_BYTES) return payload;

    const useBrotli = /\bbr\b/.test(accept) && typeof createBrotliCompress === 'function';
    const useGzip = !useBrotli && /\bgzip\b/.test(accept);

    let compressed: Buffer;
    let encoding: string;
    if (useBrotli) {
      compressed = await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        const src = Readable.from([
          Buffer.isBuffer(payload) ? payload : Buffer.from(payload as string),
        ]);
        const dst = createBrotliCompress();
        src.pipe(dst);
        dst.on('data', (c) => chunks.push(c));
        dst.on('end', () => resolve(Buffer.concat(chunks)));
        dst.on('error', reject);
      });
      encoding = 'br';
    } else if (useGzip) {
      compressed = await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        const src = Readable.from([
          Buffer.isBuffer(payload) ? payload : Buffer.from(payload as string),
        ]);
        const dst = createGzip();
        src.pipe(dst);
        dst.on('data', (c) => chunks.push(c));
        dst.on('end', () => resolve(Buffer.concat(chunks)));
        dst.on('error', reject);
      });
      encoding = 'gzip';
    } else {
      return payload;
    }

    reply.header('content-encoding', encoding);
    reply.removeHeader('content-length');
    reply.header('Vary', 'Accept-Encoding');
    return compressed;
  });

  // Suppress unused-imports warnings when tree-shaken.
  void pipeline;
}
