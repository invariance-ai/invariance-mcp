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
  natural_language?: string;
  compiled_condition?: string | Record<string, unknown> | null;
  definition?: Record<string, unknown> | null;
  agent_id?: string | null;
  severity?: string;
  status: string;
  webhook_url?: string | null;
  owner_id?: string;
  triggers_count?: number;
  last_triggered?: string | number | null;
  created_at?: string | number;
  updated_at?: string;
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
  name: string;
  created_by: string;
  status: string;
  created_at: string;
  closed_at?: string | null;
  root_hash?: string | null;
  close_hash?: string | null;
  receipt_count?: number;
}

export interface Dataset {
  id: string;
  name: string;
  description: string | null;
  agent_id: string | null;
  owner_id: string;
  current_draft_version: number;
  latest_published_version: number;
  row_count: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Evaluation {
  id: string;
  suite_id: string;
  agent_id: string;
  version_label?: string | null;
  status: string;
  total_cases?: number;
  passed_cases?: number;
  failed_cases?: number;
  pass_rate?: number | null;
  avg_score?: number | null;
  duration_ms?: number | null;
  metadata?: Record<string, unknown>;
  owner_id?: string;
  started_at: string;
  completed_at: string | null;
  created_at?: string;
  dataset_id?: string | null;
  source_type?: string;
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
  natural_language: string;
  agent_id?: string;
  severity?: string;
  webhook_url?: string;
}

export interface CreateDatasetInput {
  name: string;
  description: string;
  agent_id?: string;
  metadata?: Record<string, unknown>;
}

export interface ApiError {
  statusCode: number;
  message: string;
  code?: string;
}
