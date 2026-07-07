import { z } from 'zod';

export const httpUrl = z.string().url().refine(
  (u) => {
    try {
      const p = new URL(u).protocol;
      return p === 'http:' || p === 'https:';
    } catch {
      return false;
    }
  },
  { message: 'URL must be http(s)' },
);
export type HttpUrl = z.infer<typeof httpUrl>;

/**
 * Returns true when a `ZodError` is the result of the URL-protocol check
 * above. Routes can use this to map the failure to the spec's `invalid_url`
 * error code (HTTP 400) rather than a generic Zod-validation 400.
 */
export function isHttpUrlProtocolError(err: z.ZodError): boolean {
  return err.issues.some(
    (i) => i.code === 'custom' && i.message === 'URL must be http(s)',
  );
}
