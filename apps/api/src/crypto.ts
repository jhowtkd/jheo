import { createCipheriv, createDecipheriv, randomBytes, createHash, createHmac } from 'node:crypto';

// Per-process cache for the derived AES key. The secret never changes during
// a process's lifetime so re-hashing it on every encrypt/decrypt was pure
// waste at hot paths (every channel get + every publish-job loop iteration).
const keyCache = new Map<string, Buffer>();
function key(raw: string): Buffer {
  let k = keyCache.get(raw);
  if (!k) {
    k = createHash('sha256').update(raw).digest();
    keyCache.set(raw, k);
  }
  return k;
}

/**
 * Generate a Prisma-compatible cuid-shaped id (`c` prefix + 20+ chars).
 *
 * Uses HMAC-SHA256(counter || timestamp || random) with a process-local
 * fingerprint as the key — sufficient for collision-rotation in
 * `createPublishWithRotation`. Does NOT aim to be wire-compatible with the
 * cuid npm package; the schema's `@default(cuid())` still generates primary
 * cuid-style ids, and this is the fallback we rotate to when a collision
 * occurs.
 */
let cuidCounter = 0;
export function createCuid(): string {
  const key = createHash('sha256').update(`jheo:${process.pid}`).digest();
  const ts = Date.now().toString(36);
  const rand = randomBytes(8).toString('hex');
  const input = `${(cuidCounter = (cuidCounter + 1) | 0).toString(36)}:${ts}:${rand}`;
  const h = createHmac('sha256', key).update(input).digest('base64').replace(/[+/=]/g, '').toLowerCase();
  return `c${h.slice(0, 24)}`;
}

export function encrypt(plaintext: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(secret), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64');
}

export function decrypt(payload: string, secret: string): string {
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}