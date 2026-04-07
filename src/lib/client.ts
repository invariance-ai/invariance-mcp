import { parseApiError } from './errors.js';
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
} from '../types/index.js';

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

    const response = await fetch(url.toString(), {
      method,
      headers: this.headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw await parseApiError(response);
    }

    return (await response.json()) as T;
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
    limit?: number;
  }): Promise<PaginatedResponse<Dataset>> {
    return this.get<PaginatedResponse<Dataset>>('/v1/datasets', {
      limit: params.limit,
    });
  }

  // ---- Evaluations ----

  async listEvals(params: {
    limit?: number;
    dataset_id?: string;
  }): Promise<PaginatedResponse<Evaluation>> {
    return this.get<PaginatedResponse<Evaluation>>('/v1/evals', {
      limit: params.limit,
      dataset_id: params.dataset_id,
    });
  }
}
