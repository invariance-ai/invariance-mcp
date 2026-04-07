import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InvarianceClient } from '../lib/client.js';
import { InvarianceApiError } from '../lib/errors.js';

describe('InvarianceClient', () => {
  let client: InvarianceClient;

  beforeEach(() => {
    client = new InvarianceClient('test-api-key', 'https://api.example.com');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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
  });

  it('throws InvarianceApiError on non-OK response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      headers: new Headers(),
      json: () =>
        Promise.resolve({ message: 'Invalid API key', statusCode: 401 }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(client.whoami()).rejects.toThrow(InvarianceApiError);
  });

  it('handles non-JSON error responses', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      statusText: 'Unprocessable Entity',
      headers: new Headers(),
      json: () => Promise.reject(new Error('not json')),
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(client.whoami()).rejects.toThrow(InvarianceApiError);
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
  });

  // ── Retry tests ──

  it('retries on 429 and succeeds', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Headers({ 'Retry-After': '0' }),
        json: () =>
          Promise.resolve({ message: 'Rate limited', statusCode: 429 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'u1', email: 'test@test.com' }),
      });
    vi.stubGlobal('fetch', mockFetch);

    const result = await client.whoami();

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ id: 'u1', email: 'test@test.com' });
  });

  it('retries on 500 and succeeds', async () => {
    vi.useFakeTimers();
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Headers(),
        json: () =>
          Promise.resolve({ message: 'Server error', statusCode: 500 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'u1', email: 'test@test.com' }),
      });
    vi.stubGlobal('fetch', mockFetch);

    const promise = client.whoami();
    await vi.advanceTimersByTimeAsync(2000);

    const result = await promise;

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ id: 'u1', email: 'test@test.com' });
    vi.useRealTimers();
  });

  it('does not retry on 400', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      headers: new Headers(),
      json: () =>
        Promise.resolve({ message: 'Bad request', statusCode: 400 }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(client.whoami()).rejects.toThrow(InvarianceApiError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('does not retry on 404', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: new Headers(),
      json: () =>
        Promise.resolve({ message: 'Not found', statusCode: 404 }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(client.whoami()).rejects.toThrow(InvarianceApiError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('gives up after max retries on persistent 500', async () => {
    vi.useFakeTimers();
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Headers(),
        json: () =>
          Promise.resolve({ message: 'Server error', statusCode: 500 }),
      });
    });
    vi.stubGlobal('fetch', mockFetch);

    let rejected = false;
    let rejectedError: unknown;
    const promise = client.whoami().catch((e: unknown) => {
      rejected = true;
      rejectedError = e;
    });

    // Advance through the 3 retry delays: 1s, 2s, 4s
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(4000);
    await vi.advanceTimersByTimeAsync(100);

    await promise;

    expect(rejected).toBe(true);
    expect(rejectedError).toBeInstanceOf(InvarianceApiError);
    // 1 initial + 3 retries = 4 calls
    expect(callCount).toBe(4);
    vi.useRealTimers();
  });

  // ── New method tests ──

  it('createMonitor posts to /v1/monitors', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ id: 'm1', name: 'Test', status: 'active' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await client.createMonitor({
      name: 'Test',
      natural_language: 'Alert when traces fail repeatedly',
      severity: 'high',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.example.com/v1/monitors',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('createDataset posts to /v1/datasets', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ id: 'd1', name: 'Test', row_count: 0 }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await client.createDataset({ name: 'Test', description: 'desc' });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.example.com/v1/datasets',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('getMonitor gets /v1/monitors/:id', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'm1', name: 'Test' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await client.getMonitor('m1');

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toBe('https://api.example.com/v1/monitors/m1');
  });

  it('getEval gets /v1/evals/runs/:id', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'e1', name: 'Test' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await client.getEval('e1');

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toBe('https://api.example.com/v1/evals/runs/e1');
  });
});
