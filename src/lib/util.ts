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

import type { McpServer, ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';

type ZodRawShape = Record<string, import('zod').ZodTypeAny>;
type Handler<S extends ZodRawShape> = ToolCallback<S>;

// Thin wrappers over server.registerTool() that bake in the right MCP annotations
// so agent clients can distinguish read-only inspection tools from state-changing
// ones (Claude Desktop and others surface these as UI hints). All Invariance tools
// hit an external HTTP API, so openWorldHint is always true.

const OPEN_WORLD = { openWorldHint: true } as const;

export function registerReadTool<S extends ZodRawShape>(
  server: McpServer,
  name: string,
  description: string,
  inputSchema: S,
  handler: Handler<S>,
) {
  return server.registerTool(
    name,
    {
      description,
      inputSchema,
      annotations: { readOnlyHint: true, ...OPEN_WORLD },
    },
    handler as never,
  );
}

export function registerWriteTool<S extends ZodRawShape>(
  server: McpServer,
  name: string,
  description: string,
  inputSchema: S,
  handler: Handler<S>,
) {
  return server.registerTool(
    name,
    {
      description,
      inputSchema,
      // destructiveHint=false means "writes/creates state, but not destructive"
      // (per MCP spec). Use registerDestructiveTool for delete/cancel-style.
      annotations: { readOnlyHint: false, destructiveHint: false, ...OPEN_WORLD },
    },
    handler as never,
  );
}

export function registerDestructiveTool<S extends ZodRawShape>(
  server: McpServer,
  name: string,
  description: string,
  inputSchema: S,
  handler: Handler<S>,
) {
  return server.registerTool(
    name,
    {
      description,
      inputSchema,
      annotations: { readOnlyHint: false, destructiveHint: true, ...OPEN_WORLD },
    },
    handler as never,
  );
}
