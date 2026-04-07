import { InvarianceApiError, parseApiError } from './errors.js';
import type {
  UserInfo,
  Trace,
  TraceDetail,
  Monitor,
  MonitorRunResult,
  Signal,
  Session,
  Dataset,
  Evaluation,
  QueryResult,
  DocSearchResult,
  PaginatedResponse,
  CreateMonitorInput,
  CreateDatasetInput,
} from '../types/index.js';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

function getTimeoutMs(): number {
  const envTimeout = process.env.INVARIANCE_TIMEOUT;
  if (envTimeout) {
    const parsed = Number(envTimeout);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 30_000;
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

export class InvarianceClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(apiKey: string, baseUrl: string) {
    this.baseUrl = baseUrl;
    this.headers = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'invariance-mcp/0.1.0',
    };
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string | number | undefined>,
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const timeoutMs = getTimeoutMs();

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        response = await fetch(url.toString(), {
          method,
          headers: this.headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });
      } catch (error) {
        clearTimeout(timer);
        if (attempt < MAX_RETRIES && error instanceof Error && error.name === 'AbortError') {
          await this.delay(BASE_DELAY_MS * Math.pow(2, attempt));
          continue;
        }
        throw error;
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        if (attempt < MAX_RETRIES && isRetryable(response.status)) {
          const retryAfter = response.headers.get('Retry-After');
          let delayMs = BASE_DELAY_MS * Math.pow(2, attempt);
          if (response.status === 429 && retryAfter) {
            const retrySeconds = Number(retryAfter);
            if (!Number.isNaN(retrySeconds)) {
              delayMs = retrySeconds * 1000;
            }
          }
          await this.delay(delayMs);
          continue;
        }
        throw await parseApiError(response);
      }

      return (await response.json()) as T;
    }

    // This should be unreachable, but satisfies TypeScript
    throw new InvarianceApiError(0, 'Max retries exceeded');
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private get<T>(
    path: string,
    query?: Record<string, string | number | undefined>,
  ): Promise<T> {
    return this.request<T>('GET', path, undefined, query);
  }

  private post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  // ---- User ----

  async whoami(): Promise<UserInfo> {
    return this.get<UserInfo>('/v1/auth/me');
  }

  // ---- Traces ----

  async listTraces(params: {
    limit?: number;
    status?: string;
    cursor?: string;
  }): Promise<PaginatedResponse<Trace>> {
    return this.get<PaginatedResponse<Trace>>('/v1/traces', {
      limit: params.limit,
      status: params.status,
      cursor: params.cursor,
    });
  }

  async getTrace(traceId: string): Promise<TraceDetail> {
    return this.get<TraceDetail>(`/v1/traces/${encodeURIComponent(traceId)}`);
  }

  // ---- Query ----

  async query(prompt: string): Promise<QueryResult> {
    return this.post<QueryResult>('/v1/query', { prompt });
  }

  // ---- Monitors ----

  async listMonitors(params: {
    limit?: number;
    status?: string;
  }): Promise<PaginatedResponse<Monitor>> {
    return this.get<PaginatedResponse<Monitor>>('/v1/monitors', {
      limit: params.limit,
      status: params.status,
    });
  }

  async runMonitor(monitorId: string): Promise<MonitorRunResult> {
    return this.post<MonitorRunResult>(
      `/v1/monitors/${encodeURIComponent(monitorId)}/run`,
    );
  }

  async createMonitor(input: CreateMonitorInput): Promise<Monitor> {
    return this.post<Monitor>('/v1/monitors', input);
  }

  async getMonitor(monitorId: string): Promise<Monitor> {
    return this.get<Monitor>(
      `/v1/monitors/${encodeURIComponent(monitorId)}`,
    );
  }

  // ---- Signals ----

  async listSignals(params: {
    limit?: number;
  }): Promise<PaginatedResponse<Signal>> {
    return this.get<PaginatedResponse<Signal>>('/v1/signals', {
      limit: params.limit,
    });
  }

  // ---- Sessions ----

  async getSession(sessionId: string): Promise<Session> {
    return this.get<Session>(
      `/v1/sessions/${encodeURIComponent(sessionId)}`,
    );
  }

  // ---- Docs ----

  async searchDocs(query: string): Promise<DocSearchResult[]> {
    return this.get<DocSearchResult[]>('/v1/docs/search', { q: query });
  }

  // ---- Datasets ----

  async listDatasets(params: {
    agent_id?: string;
  }): Promise<Dataset[]> {
    return this.get<Dataset[]>('/v1/datasets', {
      agent_id: params.agent_id,
    });
  }

  async createDataset(input: CreateDatasetInput): Promise<Dataset> {
    return this.post<Dataset>('/v1/datasets', input);
  }

  // ---- Evaluations ----

  async listEvals(params: {
    suite_id?: string;
    agent_id?: string;
    status?: string;
    dataset_id?: string;
  }): Promise<Evaluation[]> {
    return this.get<Evaluation[]>('/v1/evals/runs', {
      suite_id: params.suite_id,
      agent_id: params.agent_id,
      status: params.status,
      dataset_id: params.dataset_id,
    });
  }

  async getEval(evalId: string): Promise<Evaluation> {
    return this.get<Evaluation>(
      `/v1/evals/runs/${encodeURIComponent(evalId)}`,
    );
  }
}
