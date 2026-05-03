import { InvarianceApiError, parseApiError } from './errors.js';
import {
  getPublicKey,
  hashKeyRotationPayload,
  hashNodePayload,
  hashRunCreatePayload,
  signEd25519,
  type NodeHashPayload,
} from '@invariance/sdk';

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
  private readonly signingKey: string | undefined;
  private cachedAgentId: string | null = null;
  private readonly runTailHash = new Map<string, string>();

  constructor(apiKey: string, baseUrl: string, signingKey?: string) {
    this.baseUrl = baseUrl;
    this.headers = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'invariance-mcp',
    };
    this.signingKey = signingKey;
  }

  hasSigningKey(): boolean {
    return this.signingKey !== undefined;
  }

  private async getAgentId(): Promise<string> {
    if (this.cachedAgentId !== null) return this.cachedAgentId;
    const me = await this.get<{ agent: { id: string } }>('/v1/agents/me');
    this.cachedAgentId = me.agent.id;
    return this.cachedAgentId;
  }

  /**
   * Sign and POST /v1/runs. Wraps the raw client.post('/v1/runs', body) so
   * tool authors get crypto for free when INVARIANCE_SIGNING_KEY is set.
   */
  async createRun(body: { name?: string; metadata?: Record<string, unknown> }): Promise<unknown> {
    const out: Record<string, unknown> = { ...body };
    if (this.signingKey) {
      const timestamp = Date.now();
      const hash = hashRunCreatePayload({
        agent_id: await this.getAgentId(),
        name: body.name ?? '',
        metadata: body.metadata ?? {},
        replay_seed: null,
        parent_handoff_token: null,
        timestamp,
      });
      out.timestamp = timestamp;
      out.signature = signEd25519(hash, this.signingKey);
    }
    return this.post<{ run: unknown }>('/v1/runs', out);
  }

  /** Sign and POST /v1/nodes. Mirrors the SDK's per-node Ed25519 chain. */
  async writeNodes(runId: string, nodes: Record<string, unknown>[]): Promise<unknown[]> {
    const body: Record<string, unknown>[] = nodes.map((n) => ({ run_id: runId, ...n }));
    if (this.signingKey) {
      const agentId = await this.getAgentId();
      const tail = this.runTailHash.get(runId);
      let prev: string[] = tail ? [tail] : [];
      for (const node of body) {
        const id = (node['id'] as string | undefined) ?? randomNodeId();
        const timestamp = (node['timestamp'] as number | undefined) ?? Date.now();
        const payload: NodeHashPayload = {
          id,
          run_id: runId,
          agent_id: agentId,
          parent_id: (node['parent_id'] as string | null | undefined) ?? null,
          action_type: String(node['action_type'] ?? ''),
          input: node['input'] ?? null,
          output: node['output'] ?? null,
          error: node['error'] ?? null,
          metadata: (node['metadata'] as Record<string, unknown> | undefined) ?? {},
          custom_fields: (node['custom_fields'] as Record<string, unknown> | undefined) ?? {},
          timestamp,
          duration_ms: (node['duration_ms'] as number | null | undefined) ?? null,
          previous_hashes: prev,
        };
        const hash = hashNodePayload(payload);
        node['id'] = id;
        node['timestamp'] = timestamp;
        node['previous_hashes'] = prev;
        node['signature'] = signEd25519(hash, this.signingKey);
        prev = [hash];
      }
      const last = prev[0];
      if (last !== undefined) this.runTailHash.set(runId, last);
    }
    const res = await this.post<{ data: unknown[] }>('/v1/nodes', body);
    return res.data;
  }

  /** Signed key rotation. See `agents.rotateKey` in @invariance/sdk. */
  async rotateAgentKey(newPrivateKey: string, prevPublicKey: string | null = null): Promise<unknown> {
    const newPublicKey = getPublicKey(newPrivateKey);
    const me = await this.get<{ agent: { id: string } }>('/v1/agents/me');
    const timestamp = Date.now();
    const hash = hashKeyRotationPayload({
      agent_id: me.agent.id,
      new_public_key: newPublicKey,
      prev_public_key: prevPublicKey,
      timestamp,
    });
    const signature = signEd25519(hash, newPrivateKey);
    return this.put('/v1/agents/me/key', {
      public_key: newPublicKey,
      prev_public_key: prevPublicKey,
      timestamp,
      signature,
    });
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

function randomNodeId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += (bytes[i] ?? 0).toString(16).padStart(2, '0');
  return `node_${hex}`;
}
