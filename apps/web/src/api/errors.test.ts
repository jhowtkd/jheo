import { describe, it, expect } from 'vitest';
import { humanError } from './errors';

describe('humanError', () => {
  it('maps the no_llm_provider sentinel', () => {
    expect(humanError(new Error('no_llm_provider'))).toEqual({ key: 'errors.no_llm_provider' });
  });

  it('maps the rate_limited sentinel', () => {
    expect(humanError(new Error('rate_limited'))).toEqual({ key: 'errors.rate_limited' });
  });

  it('maps the backend_unavailable sentinel to errors.backend_down', () => {
    expect(humanError(new Error('backend_unavailable'))).toEqual({ key: 'errors.backend_down' });
  });

  it('maps "Failed to load X: <status>" to errors.server with status param', () => {
    expect(humanError(new Error('Failed to load health: 500'))).toEqual({
      key: 'errors.server',
      params: { status: 500 },
      retry: true,
    });
  });

  it('marks 4xx server errors as non-retryable', () => {
    expect(humanError(new Error('Failed to load page: 404'))).toEqual({
      key: 'errors.server',
      params: { status: 404 },
      retry: false,
    });
  });

  it('maps TypeError to errors.network (fetch threw)', () => {
    expect(humanError(new TypeError('Failed to fetch'))).toEqual({
      key: 'errors.network',
      retry: true,
    });
  });

  it('maps SyntaxError "Unexpected end of JSON input" to errors.backend_down', () => {
    expect(humanError(new SyntaxError('Unexpected end of JSON input'))).toEqual({
      key: 'errors.backend_down',
      retry: true,
    });
  });

  it('falls back to errors.generic for unknown errors', () => {
    expect(humanError(new Error('something weird'))).toEqual({ key: 'errors.generic' });
  });

  it('falls back to errors.generic for non-Error values', () => {
    expect(humanError('a string')).toEqual({ key: 'errors.generic' });
    expect(humanError(null)).toEqual({ key: 'errors.generic' });
    expect(humanError(undefined)).toEqual({ key: 'errors.generic' });
  });

  it('never throws — even for unusual inputs', () => {
    expect(() => humanError({ circular: null } as unknown)).not.toThrow();
    expect(() => humanError(Symbol('x'))).not.toThrow();
  });
});
