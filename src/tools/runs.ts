import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { InvarianceClient } from '../lib/client.js';
import { jsonResult, parseJsonArg } from '../lib/util.js';

export function registerRunTools(server: McpServer, client: InvarianceClient): void {
  server.tool(
    'invariance_run_start',
    'Start a new Invariance run',
    {
      name: z.string().optional().describe('Run name'),
      metadata: z.string().optional().describe('Run metadata as a JSON object string'),
    },
    async ({ name, metadata }) => {
      const body: Record<string, unknown> = {};
      if (name !== undefined) body.name = name;
      const meta = parseJsonArg('metadata', metadata);
      if (meta !== undefined) body.metadata = meta;
      const res = await client.post<{ run: unknown }>('/v1/runs', body);
      return jsonResult(res.run);
    },
  );

  server.tool(
    'invariance_run_get',
    'Get details of an Invariance run',
    { id: z.string().describe('Run ID') },
    async ({ id }) => {
      const res = await client.get<{ run: unknown }>(`/v1/runs/${encodeURIComponent(id)}`);
      return jsonResult(res.run);
    },
  );

  server.tool(
    'invariance_run_list',
    'List Invariance runs (paginated)',
    {
      cursor: z.string().optional(),
      limit: z.number().int().positive().max(200).optional(),
    },
    async ({ cursor, limit }) =>
      jsonResult(await client.get('/v1/runs', { cursor, limit })),
  );

  server.tool(
    'invariance_run_finish',
    'Mark a run as completed',
    { id: z.string() },
    async ({ id }) => {
      const res = await client.patch<{ run: unknown }>(
        `/v1/runs/${encodeURIComponent(id)}`,
        { status: 'completed' },
      );
      return jsonResult(res.run);
    },
  );

  server.tool(
    'invariance_run_fail',
    'Mark a run as failed',
    {
      id: z.string(),
      error: z.string().optional().describe('Error description (stored in metadata.error)'),
    },
    async ({ id, error }) => {
      const body: Record<string, unknown> = { status: 'failed' };
      if (error !== undefined) body.metadata = { error };
      const res = await client.patch<{ run: unknown }>(
        `/v1/runs/${encodeURIComponent(id)}`,
        body,
      );
      return jsonResult(res.run);
    },
  );

  server.tool(
    'invariance_run_verify',
    'Verify the proof chain for a run',
    { id: z.string() },
    async ({ id }) =>
      jsonResult(await client.get(`/v1/runs/${encodeURIComponent(id)}/verify`)),
  );

  server.tool(
    'invariance_run_metrics',
    'Aggregate metrics for a run (token counts, cost, latency)',
    { id: z.string() },
    async ({ id }) =>
      jsonResult(await client.get(`/v1/runs/${encodeURIComponent(id)}/metrics`)),
  );
}
