export function parseJsonArg(name: string, value: string | undefined): unknown {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(value);
  } catch (err) {
    throw new Error(`Invalid JSON in "${name}": ${(err as Error).message}`, { cause: err });
  }
}

export function jsonResult(value: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value) }],
  };
}

export function apiNotAvailableResult(tool: string, detail?: string) {
  return jsonResult({
    error: {
      code: 'API_NOT_AVAILABLE',
      message: `\`${tool}\` is defined but the backend endpoint is not available yet${
        detail ? `: ${detail}` : '.'
      }`,
      retryable: false,
      suggested_fix:
        'Track platform progress at https://invariance.ai/changelog or contact support@invariance.ai.',
    },
  });
}

export type PageOpts = { cursor?: string; limit?: number };
