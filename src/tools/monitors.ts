import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { InvarianceClient } from '../lib/client.js';
import { jsonResult, parseJsonArg } from '../lib/util.js';

export function registerMonitorTools(server: McpServer, client: InvarianceClient): void {
  server.tool(
    'invariance_monitor_create',
    'Create a monitor (server-side compiled MonitorSpec body)',
    {
      body: z.string().describe(
        'Monitor body as a JSON object string: { name, evaluator, severity, scope?, target?, signal_type?, creates_review? }',
      ),
    },
    async ({ body }) => {
      const parsed = parseJsonArg('body', body);
      const res = await client.post<{ monitor: unknown }>('/v1/monitors', parsed);
      return jsonResult(res.monitor);
    },
  );

  server.tool(
    'invariance_monitor_list',
    'List monitors',
    { cursor: z.string().optional(), limit: z.number().int().positive().max(200).optional() },
    async ({ cursor, limit }) =>
      jsonResult(await client.get('/v1/monitors', { cursor, limit })),
  );

  server.tool(
    'invariance_monitor_get',
    'Get a monitor by ID',
    { id: z.string() },
    async ({ id }) => {
      const res = await client.get<{ monitor: unknown }>(
        `/v1/monitors/${encodeURIComponent(id)}`,
      );
      return jsonResult(res.monitor);
    },
  );

  server.tool(
    'invariance_monitor_update',
    'Update a monitor (PATCH body as JSON string)',
    { id: z.string(), patch: z.string().describe('UpdateMonitorRequest as a JSON object string') },
    async ({ id, patch }) => {
      const body = parseJsonArg('patch', patch);
      const res = await client.patch<{ monitor: unknown }>(
        `/v1/monitors/${encodeURIComponent(id)}`,
        body,
      );
      return jsonResult(res.monitor);
    },
  );

  server.tool(
    'invariance_monitor_pause',
    'Disable a monitor',
    { id: z.string() },
    async ({ id }) => {
      const res = await client.patch<{ monitor: unknown }>(
        `/v1/monitors/${encodeURIComponent(id)}`,
        { enabled: false },
      );
      return jsonResult(res.monitor);
    },
  );

  server.tool(
    'invariance_monitor_resume',
    'Re-enable a monitor',
    { id: z.string() },
    async ({ id }) => {
      const res = await client.patch<{ monitor: unknown }>(
        `/v1/monitors/${encodeURIComponent(id)}`,
        { enabled: true },
      );
      return jsonResult(res.monitor);
    },
  );

  server.tool(
    'invariance_monitor_evaluate',
    'Manually evaluate a monitor against an input payload',
    {
      id: z.string(),
      input: z.string().optional().describe('EvaluateMonitorRequest as a JSON object string'),
    },
    async ({ id, input }) => {
      const body = parseJsonArg('input', input) ?? {};
      return jsonResult(
        await client.post(`/v1/monitors/${encodeURIComponent(id)}/evaluate`, body),
      );
    },
  );

  server.tool(
    'invariance_monitor_executions',
    'List executions for a monitor',
    {
      id: z.string(),
      cursor: z.string().optional(),
      limit: z.number().int().positive().max(200).optional(),
    },
    async ({ id, cursor, limit }) =>
      jsonResult(
        await client.get(`/v1/monitors/${encodeURIComponent(id)}/executions`, {
          cursor,
          limit,
        }),
      ),
  );

  server.tool(
    'invariance_monitor_findings',
    'List findings produced by a monitor',
    {
      id: z.string(),
      cursor: z.string().optional(),
      limit: z.number().int().positive().max(200).optional(),
    },
    async ({ id, cursor, limit }) =>
      jsonResult(
        await client.get(`/v1/monitors/${encodeURIComponent(id)}/findings`, {
          cursor,
          limit,
        }),
      ),
  );
}
