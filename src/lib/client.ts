import { InvarianceApiError, parseApiError } from './errors.js';

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 5_000;

function getTimeoutMs(): number {
  const env = process.env.INVARIANCE_TIMEOUT;
  if (env) {
    const parsed = Number(env);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_TIMEOUT_MS;
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

function backoff(attempt: number, retryAfterSec?: number): number {
  if (retryAfterSec !== undefined && retryAfterSec > 0) {
    return Math.min(retryAfterSec * 1000, MAX_DELAY_MS);
  }
  const exp = BASE_DELAY_MS * 2 ** (attempt - 1);
  const jitter = Math.random() * BASE_DELAY_MS;
  return Math.min(exp + jitter, MAX_DELAY_MS);
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export type Query = Record<string, string | number | boolean | undefined | null>;

export class InvarianceClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(apiKey: string, baseUrl: string) {
    this.baseUrl = baseUrl;
    this.headers = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'invariance-mcp',
    };
  }

  async request<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
    query?: Query,
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }
    const timeoutMs = getTimeoutMs();

    let lastErr: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let response: Response;
      try {
        response = await fetch(url.toString(), {
          method,
          headers: this.headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });
      } catch (err) {
        clearTimeout(timer);
        lastErr = err;
        if (attempt >= MAX_RETRIES) throw err;
        await sleep(backoff(attempt + 1));
        continue;
      } finally {
        clearTimeout(timer);
      }

      if (response.ok) {
        if (response.status === 204) return undefined as T;
        const text = await response.text();
        return text ? (JSON.parse(text) as T) : (undefined as T);
      }

      const text = await response.text();
      let parsed: unknown;
      try {
        parsed = text ? JSON.parse(text) : undefined;
      } catch {
        parsed = { error: { message: text || `HTTP ${response.status}` } };
      }

      if (isRetryable(response.status) && attempt < MAX_RETRIES) {
        const ra = Number(response.headers.get('retry-after')) || undefined;
        await sleep(backoff(attempt + 1, ra));
        continue;
      }

      throw parseApiError(response.status, parsed);
    }
    throw lastErr ?? new InvarianceApiError(0, 'request failed');
  }

  get<T>(path: string, query?: Query): Promise<T> {
    return this.request<T>('GET', path, undefined, query);
  }
  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }
  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }
  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PUT', path, body);
  }
  delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }
}
