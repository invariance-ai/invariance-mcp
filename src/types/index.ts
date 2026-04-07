export interface UserInfo {
  id: string;
  email: string;
  name: string;
  organization: {
    id: string;
    name: string;
    plan: string;
  };
}

export interface Trace {
  id: string;
  name: string;
  status: string;
  startTime: string;
  endTime?: string;
  duration?: number;
  spanCount: number;
  metadata?: Record<string, unknown>;
}

export interface Span {
  id: string;
  traceId: string;
  parentSpanId?: string;
  name: string;
  startTime: string;
  endTime?: string;
  duration?: number;
  status: string;
  attributes?: Record<string, unknown>;
  events?: SpanEvent[];
}

export interface SpanEvent {
  name: string;
  timestamp: string;
  attributes?: Record<string, unknown>;
}

export interface TraceDetail extends Trace {
  spans: Span[];
}

export interface Monitor {
  id: string;
  name: string;
  description?: string;
  status: string;
  type: string;
  config?: Record<string, unknown>;
  lastRunAt?: string;
}

export interface MonitorRunResult {
  id: string;
  monitorId: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  results?: Record<string, unknown>;
  signalsGenerated: number;
}

export interface Signal {
  id: string;
  monitorId: string;
  traceId?: string;
  severity: string;
  message: string;
  detectedAt: string;
  metadata?: Record<string, unknown>;
}

export interface Session {
  id: string;
  agentId?: string;
  startTime: string;
  endTime?: string;
  status: string;
  traceIds: string[];
  metadata?: Record<string, unknown>;
}

export interface Dataset {
  id: string;
  name: string;
  description?: string;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Evaluation {
  id: string;
  datasetId: string;
  name: string;
  status: string;
  score?: number;
  createdAt: string;
  completedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface QueryResult {
  answer: string;
  sources?: Array<{
    type: string;
    id: string;
    relevance: number;
  }>;
}

export interface DocSearchResult {
  title: string;
  content: string;
  url: string;
  relevance: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  cursor?: string;
  hasMore: boolean;
  total?: number;
}

export interface CreateMonitorInput {
  name: string;
  description: string;
  query: string;
  schedule?: string;
  threshold?: number;
}

export interface CreateDatasetInput {
  name: string;
  description: string;
  items?: unknown[];
}

export interface ApiError {
  statusCode: number;
  message: string;
  code?: string;
}
