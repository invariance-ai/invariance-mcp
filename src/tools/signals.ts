import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { InvarianceClient } from '../lib/client.js';
import { jsonResult, parseJsonArg } from '../lib/util.js';

const severityEnum = z.enum(['low', 'medium', 'high', 'critical']);

export function registerSignalTools(server: McpServer, client: InvarianceClient): void {
  server.tool(
    'invariance_signal_emit',
    'Emit a manual signal',
    {
      severity: severityEnum,
      title: z.string(),
      message: z.string().optional(),
      type: z.string().optional(),
      data: z.string().optional().describe('Arbitrary signal payload as a JSON string'),
      run_id: z.string().optional(),
      node_id: z.string().optional(),
    },
    async ({ severity, title, message, type, data, run_id, node_id }) => {
      const body: Record<string, unknown> = { severity, title };
      if (message !== undefined) body.message = message;
      if (type !== undefined) body.type = type;
      const d = parseJsonArg('data', data);
      if (d !== undefined) body.data = d;
      if (run_id !== undefined) body.run_id = run_id;
      if (node_id !== undefined) body.node_id = node_id;
      const res = await client.post<{ signal: unknown }>('/v1/signals', body);
      return jsonResult(res.signal);
    },
  );

  server.tool(
    'invariance_signal_list',
    'List signals',
    { cursor: z.string().optional(), limit: z.number().int().positive().max(200).optional() },
    async ({ cursor, limit }) =>
      jsonResult(await client.get('/v1/signals', { cursor, limit })),
  );

  server.tool(
    'invariance_signal_get',
    'Get a signal by ID',
    { id: z.string() },
    async ({ id }) => {
      const res = await client.get<{ signal: unknown }>(
        `/v1/signals/${encodeURIComponent(id)}`,
      );
      return jsonResult(res.signal);
    },
  );

  server.tool(
    'invariance_signal_acknowledge',
    'Acknowledge a signal',
    { id: z.string() },
    async ({ id }) => {
      const res = await client.patch<{ signal: unknown }>(
        `/v1/signals/${encodeURIComponent(id)}/acknowledge`,
      );
      return jsonResult(res.signal);
    },
  );

  server.tool(
    'invariance_signal_resolve',
    'Resolve a signal',
    { id: z.string() },
    async ({ id }) => {
      const res = await client.patch<{ signal: unknown }>(
        `/v1/signals/${encodeURIComponent(id)}/resolve`,
      );
      return jsonResult(res.signal);
    },
  );
}
