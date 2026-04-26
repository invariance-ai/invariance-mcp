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

export type PageOpts = { cursor?: string; limit?: number };
