import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

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