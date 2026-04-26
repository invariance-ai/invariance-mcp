import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { InvarianceClient } from '../lib/client.js';
import { jsonResult, parseJsonArg } from '../lib/util.js';

const severityEnum = z.enum(['low', 'medium', 'high', 'critical']);

export function registerSignalTools(server: McpServer, client: InvarianceClient): void {
  server.tool(
    'invariance_signal_emit',
    'Emit a manual signal (alert/notification) — typically attached to a run/node and used to flag noteworthy events for review or downstream automation.',
    {
      severity: severityEnum,
      title: z.string().describe('Short headline for the signal (shown in dashboards).'),
      message: z.string().optional().describe('Longer human-readable description.'),
      type: z.string().optional().describe('Free-form signal category, e.g. "policy_violation", "cost_spike", "pii_leak".'),
      data: z
        .string()
        .optional()
        .describe(
          'Arbitrary signal payload as a JSON-encoded string (any JSON value). Example: {"observed_cost_usd":7.42,"threshold":5}',
        ),
      run_id: z.string().optional().describe('Run this signal is associated with.'),
      node_id: z.string().optional().describe('Specific node this signal is attached to (within run_id).'),
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
    'List signals visible to the calling agent (paginated, newest first).',
    {
      cursor: z
        .string()
        .optional()
        .describe('opaque pagination token from previous response next_cursor; pass through unchanged'),
      limit: z.number().int().positive().max(200).optional(),
    },
    async ({ cursor, limit }) =>
      jsonResult(await client.get('/v1/signals', { cursor, limit })),
  );

  server.tool(
    'invariance_signal_get',
    'Get a signal by ID.',
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
    'Acknowledge a signal — moves status from "open" to "acknowledged" (someone has seen it). Use invariance_signal_resolve to mark fully resolved.',
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
    'Resolve a signal — moves status to "resolved" (the underlying issue has been addressed).',
    { id: z.string() },
    async ({ id }) => {
      const res = await client.patch<{ signal: unknown }>(
        `/v1/signals/${encodeURIComponent(id)}/resolve`,
      );
      return jsonResult(res.signal);
    },
  );
}
