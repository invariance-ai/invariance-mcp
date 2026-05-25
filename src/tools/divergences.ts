import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { InvarianceClient } from '../lib/client.js';
import { jsonResult, registerReadTool, registerWriteTool } from '../lib/util.js';

const kindEnum = z.enum([
  'intent',
  'policy',
  'workflow',
  'context',
  'outcome',
  'behavior_drift',
  'memory_consistency',
]);
const severityEnum = z.enum(['info', 'low', 'medium', 'high', 'critical']);
const statusEnum = z.enum(['open', 'accepted', 'dismissed', 'converted_to_monitor']);

export function registerDivergenceTools(server: McpServer, client: InvarianceClient): void {
  registerReadTool(
    server,
    'invariance_divergence_list',
    'List divergences (expected-vs-observed gaps) visible to the caller. Filter by run, kind, severity, status.',
    {
      cursor: z
        .string()
        .optional()
        .describe('opaque pagination token from previous response next_cursor; pass through unchanged'),
      limit: z.number().int().positive().max(200).optional(),
      run_id: z.string().optional(),
      kind: kindEnum.optional(),
      severity: severityEnum.optional(),
      status: statusEnum.optional(),
    },
    async (args) => jsonResult(await client.get('/v1/divergences', args)),
  );

  registerReadTool(
    server,
    'invariance_divergence_get',
    'Get a divergence by ID.',
    { id: z.string() },
    async ({ id }) => {
      const res = await client.get<{ divergence: unknown }>(
        `/v1/divergences/${encodeURIComponent(id)}`,
      );
      return jsonResult(res.divergence);
    },
  );

  registerWriteTool(
    server,
    'invariance_divergence_update',
    'Transition a divergence status: open | accepted | dismissed | converted_to_monitor.',
    { id: z.string(), status: statusEnum },
    async ({ id, status }) => {
      const res = await client.patch<{ divergence: unknown }>(
        `/v1/divergences/${encodeURIComponent(id)}`,
        { status },
      );
      return jsonResult(res.divergence);
    },
  );
}
