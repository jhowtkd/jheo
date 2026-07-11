import { describe, it, expect, vi } from 'vitest';
import { sendBackendUnavailable } from './backendUnavailable.js';

describe('sendBackendUnavailable', () => {
  it('writes 503 JSON with backend_unavailable and Retry-After', () => {
    const writeHead = vi.fn();
    const end = vi.fn();
    sendBackendUnavailable({ headersSent: false, writeHead, end }, 5);
    expect(writeHead).toHaveBeenCalledWith(503, {
      'Content-Type': 'application/json',
      'Retry-After': '5',
    });
    expect(end).toHaveBeenCalledWith(JSON.stringify({ error: 'backend_unavailable' }));
  });

  it('no-ops when headers were already sent', () => {
    const writeHead = vi.fn();
    const end = vi.fn();
    sendBackendUnavailable({ headersSent: true, writeHead, end }, 5);
    expect(writeHead).not.toHaveBeenCalled();
    expect(end).not.toHaveBeenCalled();
  });
});
