export interface ApiErrorBody {
  error?: { code?: string; message?: string };
}

export class InvarianceApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly body: unknown;

  constructor(status: number, message: string, code?: string, body?: unknown) {
    super(message);
    this.name = 'InvarianceApiError';
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

export function parseApiError(status: number, body: unknown): InvarianceApiError {
  const parsed = body as ApiErrorBody | undefined;
  const message = parsed?.error?.message ?? `HTTP ${status}`;
  const code = parsed?.error?.code;
  return new InvarianceApiError(status, message, code, body);
}
