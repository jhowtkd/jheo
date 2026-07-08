import { JWT } from 'google-auth-library';
import type { ServiceAccountJson } from './gsc-config.js';

const GSC_READONLY_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

export type GscConnectionTestFailure = {
  ok: false;
  code: 'permission_denied' | 'site_not_found' | 'api_error';
  message: string;
  clientEmail: string;
};

export type GscConnectionTestResult = { ok: true } | GscConnectionTestFailure;

export async function getGscAccessToken(sa: ServiceAccountJson): Promise<string> {
  const client = new JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: [GSC_READONLY_SCOPE],
  });
  const token = await client.getAccessToken();
  if (!token.token) {
    throw new Error('Failed to obtain GSC access token');
  }
  return token.token;
}

export async function testGscConnection(
  siteUrl: string,
  sa: ServiceAccountJson,
): Promise<GscConnectionTestResult> {
  const clientEmail = sa.client_email;
  try {
    const accessToken = await getGscAccessToken(sa);
    const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
    });

    if (res.ok) {
      return { ok: true };
    }

    if (res.status === 403) {
      return {
        ok: false,
        code: 'permission_denied',
        message: `Add ${clientEmail} as user in GSC Settings → Users and permissions`,
        clientEmail,
      };
    }

    if (res.status === 404) {
      return {
        ok: false,
        code: 'site_not_found',
        message: 'Check siteUrl format (trailing slash for URL-prefix or sc-domain: prefix)',
        clientEmail,
      };
    }

    return {
      ok: false,
      code: 'api_error',
      message: `GSC API error: ${res.status} ${res.statusText}`,
      clientEmail,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'GSC connection test failed';
    return {
      ok: false,
      code: 'api_error',
      message,
      clientEmail,
    };
  }
}
