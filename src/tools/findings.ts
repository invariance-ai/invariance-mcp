import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { InvarianceClient } from '../lib/client.js';
import { jsonResult } from '../lib/util.js';

const statusEnum = z.enum(['open', 'review_requested', 'resolved', 'dismissed']);

export function registerFindingTools(server: McpServer, client: InvarianceClient): void {
  server.tool(
    'invariance_finding_list',
    'List findings',
    { cursor: z.string().optional(), limit: z.number().int().positive().max(200).optional() },
    async ({ cursor, limit }) =>
      jsonResult(await client.get('/v1/findings', { cursor, limit })),
  );

  server.tool(
    'invariance_finding_get',
    'Get a finding by ID',
    { id: z.string() },
    async ({ id }) => {
      const res = await client.get<{ finding: unknown }>(
        `/v1/findings/${encodeURIComponent(id)}`,
      );
      return jsonResult(res.finding);
    },
  );

  server.tool(
    'invariance_finding_update',
    "Update a finding's status",
    { id: z.string(), status: statusEnum },
    async ({ id, status }) => {
      const res = await client.patch<{ finding: unknown }>(
        `/v1/findings/${encodeURIComponent(id)}`,
        { status },
      );
      return jsonResult(res.finding);
    },
  );
}
