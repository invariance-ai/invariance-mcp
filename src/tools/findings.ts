import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { InvarianceClient } from '../lib/client.js';
import { jsonResult, registerReadTool, registerWriteTool } from '../lib/util.js';

const statusEnum = z.enum(['open', 'review_requested', 'resolved', 'dismissed']);

export function registerFindingTools(server: McpServer, client: InvarianceClient): void {
  registerReadTool(
    server,
    'invariance_finding_list',
    'List findings (durable, structured issues raised by monitors or agents) visible to the caller, paginated.',
    {
      cursor: z
        .string()
        .optional()
        .describe('opaque pagination token from previous response next_cursor; pass through unchanged'),
      limit: z.number().int().positive().max(200).optional(),
    },
    async ({ cursor, limit }) =>
      jsonResult(await client.get('/v1/findings', { cursor, limit })),
  );

  registerReadTool(
    server,
    'invariance_finding_get',
    'Get a finding by ID.',
    { id: z.string() },
    async ({ id }) => {
      const res = await client.get<{ finding: unknown }>(
        `/v1/findings/${encodeURIComponent(id)}`,
      );
      return jsonResult(res.finding);
    },
  );

  registerWriteTool(
    server,
    'invariance_finding_update',
    'Transition a finding to a new status: "open" (active), "review_requested" (escalated to a human/agent reviewer), "resolved" (fixed), or "dismissed" (intentionally ignored / false positive).',
    {
      id: z.string(),
      status: statusEnum.describe('New status: open | review_requested | resolved | dismissed'),
    },
    async ({ id, status }) => {
      const res = await client.patch<{ finding: unknown }>(
        `/v1/findings/${encodeURIComponent(id)}`,
        { status },
      );
      return jsonResult(res.finding);
    },
  );
}
