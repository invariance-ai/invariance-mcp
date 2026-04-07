import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InvarianceClient } from '../lib/client.js';
import { InvarianceApiError } from '../lib/errors.js';

describe('InvarianceClient', () => {
  let client: InvarianceClient;

  beforeEach(() => {
    client = new InvarianceClient('test-api-key', 'https://api.example.com');
  });

  it('constructs correct URL for whoami', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'u1', email: 'test@test.com' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await client.whoami();

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.example.com/v1/auth/me',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-api-key',
        }),
      }),
    );

    vi.unstubAllGlobals();
  });

  it('constructs URL with query params for listTraces', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ items: [], hasMore: false }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await client.listTraces({ limit: 10, status: 'error' });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    const url = new URL(calledUrl);
    expect(url.pathname).toBe('/v1/traces');
    expect(url.searchParams.get('limit')).toBe('10');
    expect(url.searchParams.get('status')).toBe('error');

    vi.unstubAllGlobals();
  });

  it('omits undefined query params', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ items: [], hasMore: false }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await client.listTraces({ limit: 5 });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    const url = new URL(calledUrl);
    expect(url.searchParams.has('status')).toBe(false);
    expect(url.searchParams.has('cursor')).toBe(false);

    vi.unstubAllGlobals();
  });

  it('throws InvarianceApiError on non-OK response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: () =>
        Promise.resolve({ message: 'Invalid API key', statusCode: 401 }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(client.whoami()).rejects.toThrow(InvarianceApiError);

    vi.unstubAllGlobals();
  });

  it('handles non-JSON error responses', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      json: () => Promise.reject(new Error('not json')),
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(client.whoami()).rejects.toThrow(InvarianceApiError);

    vi.unstubAllGlobals();
  });

  it('encodes path parameters', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'tr/special' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await client.getTrace('tr/special');

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('tr%2Fspecial');

    vi.unstubAllGlobals();
  });
});
