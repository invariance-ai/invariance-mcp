import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import type { ApiError } from '../types/index.js';

export class InvarianceApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'InvarianceApiError';
  }
}

export function apiErrorToMcpError(error: InvarianceApiError): McpError {
  switch (true) {
    case error.statusCode === 401:
      return new McpError(
        ErrorCode.InvalidParams,
        `Authentication failed: ${error.message}. Check your INVARIANCE_API_KEY.`,
      );
    case error.statusCode === 403:
      return new McpError(
        ErrorCode.InvalidParams,
        `Forbidden: ${error.message}`,
      );
    case error.statusCode === 404:
      return new McpError(
        ErrorCode.InvalidParams,
        `Not found: ${error.message}`,
      );
    case error.statusCode === 422:
      return new McpError(
        ErrorCode.InvalidParams,
        `Validation error: ${error.message}`,
      );
    case error.statusCode === 429:
      return new McpError(
        ErrorCode.InternalError,
        `Rate limited: ${error.message}. Please retry after a short delay.`,
      );
    case error.statusCode >= 500:
      return new McpError(
        ErrorCode.InternalError,
        `Invariance API error (${error.statusCode}): ${error.message}`,
      );
    default:
      return new McpError(
        ErrorCode.InternalError,
        `Unexpected error (${error.statusCode}): ${error.message}`,
      );
  }
}

export async function parseApiError(
  response: Response,
): Promise<InvarianceApiError> {
  let body: ApiError | undefined;
  try {
    body = (await response.json()) as ApiError;
  } catch {
    // response body is not JSON
  }

  const message =
    body?.message ?? response.statusText ?? 'Unknown API error';
  return new InvarianceApiError(response.status, message, body?.code);
}

export function handleToolError(error: unknown): never {
  if (error instanceof McpError) {
    throw error;
  }
  if (error instanceof InvarianceApiError) {
    throw apiErrorToMcpError(error);
  }
  if (error instanceof Error) {
    throw new McpError(ErrorCode.InternalError, error.message);
  }
  throw new McpError(ErrorCode.InternalError, 'An unexpected error occurred');
}
