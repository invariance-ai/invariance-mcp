import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { InvarianceClient } from '../lib/client.js';
import { jsonResult, registerReadTool, registerWriteTool } from '../lib/util.js';

const statusEnum = z.enum([
  'suggested',
  'accepted',
  'shadow',
  'active_monitor',
  'rejected',
]);
const modeEnum = z.enum(['suggested', 'shadow', 'active_monitor']);

export function registerGuardrailTools(server: McpServer, client: InvarianceClient): void {
  registerReadTool(
    server,
    'invariance_guardrail_list',
    'List per-agent guardrails. Filter by status or recipe_id.',
    {
      cursor: z
        .string()
        .optional()
        .describe('opaque pagination token from previous response next_cursor; pass through unchanged'),
      limit: z.number().int().positive().max(200).optional(),
      status: statusEnum.optional(),
      recipe_id: z.string().optional(),
    },
    async (args) => jsonResult(await client.get('/v1/guardrails', args)),
  );

  registerReadTool(
    server,
    'invariance_guardrail_get',
    'Get a guardrail by ID.',
    { id: z.string() },
    async ({ id }) => {
      const res = await client.get<{ guardrail: unknown }>(
        `/v1/guardrails/${encodeURIComponent(id)}`,
      );
      return jsonResult(res.guardrail);
    },
  );

  registerWriteTool(
    server,
    'invariance_guardrail_create',
    'Create a guardrail (from a recipe or finding). Required: title. Optional: recipe_id, finding_id, rule, mode, status.',
    {
      title: z.string(),
      recipe_id: z.string().nullable().optional(),
      finding_id: z.string().nullable().optional(),
      rule: z.string().optional(),
      mode: modeEnum.optional(),
      status: statusEnum.optional(),
      agent_id: z.string().optional(),
    },
    async (args) => {
      const body: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(args)) {
        if (v !== undefined) body[k] = v;
      }
      const res = await client.post<{ guardrail: unknown }>('/v1/guardrails', body);
      return jsonResult(res.guardrail);
    },
  );

  registerWriteTool(
    server,
    'invariance_guardrail_update',
    'Patch a guardrail (mode, status, monitor_id).',
    {
      id: z.string(),
      mode: modeEnum.optional(),
      status: statusEnum.optional(),
      monitor_id: z.string().nullable().optional(),
    },
    async ({ id, ...rest }) => {
      const body: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rest)) {
        if (v !== undefined) body[k] = v;
      }
      const res = await client.patch<{ guardrail: unknown }>(
        `/v1/guardrails/${encodeURIComponent(id)}`,
        body,
      );
      return jsonResult(res.guardrail);
    },
  );

  registerWriteTool(
    server,
    'invariance_guardrail_promote',
    'Promote a guardrail to a new lifecycle status: suggested → accepted → shadow → active_monitor → rejected.',
    { id: z.string(), to: statusEnum },
    async ({ id, to }) => {
      const res = await client.post<{ guardrail: unknown }>(
        `/v1/guardrails/${encodeURIComponent(id)}/promote`,
        { to },
      );
      return jsonResult(res.guardrail);
    },
  );
}
