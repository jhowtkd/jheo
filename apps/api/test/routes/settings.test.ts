import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import { buildServer } from '../../src/server.js';
import { prisma } from '../../src/db.js';
import { encrypt } from '../../src/crypto.js';

let app: Awaited<ReturnType<typeof buildServer>>;
let canRunDb = false;

beforeAll(async () => {
  app = await buildServer();
  await app.ready();
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    canRunDb = true;
  } catch {
    canRunDb = false;
  }
});
afterAll(async () => {
  await app.close();
});

describe('routes/settings', () => {
  it('rejects missing value', async () => {
    const r = await app.inject({
      method: 'PUT',
      url: '/api/settings/openai_api_key',
      payload: {},
    });
    expect(r.statusCode).toBe(400);
  });

  it.runIf(canRunDb)('round-trips an encrypted value', async () => {
    const secret = process.env.JHEO_SECRET_KEY ?? '';
    expect(secret.length).toBeGreaterThan(0);
    const plaintext = `sk-test-${crypto.randomBytes(6).toString('hex')}`;

    const putRes = await app.inject({
      method: 'PUT',
      url: '/api/settings/openai_api_key',
      payload: { value: plaintext },
    });
    expect(putRes.statusCode).toBe(200);

    const row = await prisma.setting.findUnique({ where: { key: 'openai_api_key' } });
    expect(row).not.toBeNull();
    expect(encrypt(plaintext, secret)).toBe(row!.valueCiphertext); // enc is deterministic enough that ciphertexts match OR
    // At minimum, decrypt must round-trip:
    const { decrypt } = await import('../../src/crypto.js');
    expect(decrypt(row!.valueCiphertext, secret)).toBe(plaintext);

    // List hides values
    const list = await app.inject({ method: 'GET', url: '/api/settings' });
    expect(list.statusCode).toBe(200);
    expect(list.json().find((s: { key: string; value?: string }) => s.key === 'openai_api_key')).toEqual({
      key: 'openai_api_key',
    });

    // Delete works
    const del = await app.inject({ method: 'DELETE', url: '/api/settings/openai_api_key' });
    expect(del.statusCode).toBe(200);
    const after = await prisma.setting.findUnique({ where: { key: 'openai_api_key' } });
    expect(after).toBeNull();
  });
});