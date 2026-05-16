import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { InvarianceClient } from '../lib/client.js';
import { jsonResult, parseJsonArg, registerReadTool, registerWriteTool } from '../lib/util.js';

export function registerMonitorTools(server: McpServer, client: InvarianceClient): void {
  registerWriteTool(
    server,
    'invariance_monitor_create',
    'Create a monitor that evaluates an event-shaped predicate against nodes/runs and optionally emits signals, findings, or reviews when matched.',
    {
      body: z.string().describe(
        'CreateMonitorRequest as a JSON object string. Required: name, evaluator. Evaluator is one of two shapes — keyword: {"type":"keyword","field":"output.text","keywords":["refund","chargeback"],"case_sensitive":false} or threshold: {"type":"threshold","field":"metrics.cost_usd","operator":">","value":5}. Optional: severity ("info"|"low"|"medium"|"high"|"critical"), scope ("node"|"session"|"run"|"agent"|"batch"), target ({"kind":"current_run"} | {"kind":"specific_run","run_id":"run_..."} | {"kind":"agent_history","filters":[{"field":"agent_id","operator":"eq","value":"agt_..."}]}), signal_type (string), creates_review (bool), enabled (bool), description (string), schedule ({"kind":"manual"} or {"kind":"interval","every_seconds":300}). Example: {"name":"high-cost-runs","evaluator":{"type":"threshold","field":"metrics.cost_usd","operator":">","value":5},"severity":"high","scope":"run","target":{"kind":"current_run"},"creates_review":true}',
      ),
    },
    async ({ body }) => {
      const parsed = parseJsonArg('body', body);
      const res = await client.post<{ monitor: unknown }>('/v1/monitors', parsed);
      return jsonResult(res.monitor);
    },
  );

  registerReadTool(
    server,
    'invariance_monitor_list',
    'List monitors visible to the calling agent (paginated).',
    {
      cursor: z
        .string()
        .optional()
        .describe('opaque pagination token from previous response next_cursor; pass through unchanged'),
      limit: z.number().int().positive().max(200).optional(),
    },
    async ({ cursor, limit }) =>
      jsonResult(await client.get('/v1/monitors', { cursor, limit })),
  );

  registerReadTool(
    server,
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

  registerWriteTool(
    server,
    'invariance_monitor_update',
    'Patch an existing monitor (partial update; only included fields change).',
    {
      id: z.string(),
      patch: z.string().describe(
        'UpdateMonitorRequest as a JSON object string. All fields optional — include only what you want to change. Fields: name, description, enabled, evaluator (same shape as create), schedule, creates_review, signal_type, scope, target. Example: {"enabled":false,"severity":"critical"} or {"evaluator":{"type":"threshold","field":"metrics.cost_usd","operator":">","value":10}}',
      ),
    },
    async ({ id, patch }) => {
      const body = parseJsonArg('patch', patch);
      const res = await client.patch<{ monitor: unknown }>(
        `/v1/monitors/${encodeURIComponent(id)}`,
        body,
      );
      return jsonResult(res.monitor);
    },
  );

  registerWriteTool(
    server,
    'invariance_monitor_pause',
    'Disable a monitor so it stops firing (preserves the spec; use invariance_monitor_resume to re-enable).',
    { id: z.string() },
    async ({ id }) => {
      const res = await client.patch<{ monitor: unknown }>(
        `/v1/monitors/${encodeURIComponent(id)}`,
        { enabled: false },
      );
      return jsonResult(res.monitor);
    },
  );

  registerWriteTool(
    server,
    'invariance_monitor_resume',
    'Re-enable a paused monitor so it begins firing again.',
    { id: z.string() },
    async ({ id }) => {
      const res = await client.patch<{ monitor: unknown }>(
        `/v1/monitors/${encodeURIComponent(id)}`,
        { enabled: true },
      );
      return jsonResult(res.monitor);
    },
  );

  registerWriteTool(
    server,
    'invariance_monitor_evaluate',
    'Manually evaluate a monitor right now against an explicit input scope (returns the resulting execution plus any signals/findings/reviews produced).',
    {
      id: z.string(),
      input: z
        .string()
        .optional()
        .describe(
          'EvaluateMonitorRequest as a JSON object string. All fields optional. Fields: run_id (string — restrict eval to one run), since (ISO-8601 timestamp — only nodes after this), limit (int — max nodes to consider). Example: {"run_id":"run_abc123","limit":50} or {} to evaluate against the monitor\'s default scope.',
        ),
    },
    async ({ id, input }) => {
      const body = parseJsonArg('input', input) ?? {};
      return jsonResult(
        await client.post(`/v1/monitors/${encodeURIComponent(id)}/evaluate`, body),
      );
    },
  );

  registerReadTool(
    server,
    'invariance_monitor_executions',
    'List past evaluation executions for a monitor (each has status, trigger, matched_node_ids, timing).',
    {
      id: z.string(),
      cursor: z
        .string()
        .optional()
        .describe('opaque pagination token from previous response next_cursor; pass through unchanged'),
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

  registerReadTool(
    server,
    'invariance_monitor_findings',
    'List findings produced by a monitor across all of its executions.',
    {
      id: z.string(),
      cursor: z
        .string()
        .optional()
        .describe('opaque pagination token from previous response next_cursor; pass through unchanged'),
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
