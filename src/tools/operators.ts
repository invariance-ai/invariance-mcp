import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { InvarianceClient } from '../lib/client.js';
import { jsonResult, registerReadTool, registerWriteTool } from '../lib/util.js';

const operatorType = z
  .enum(['agent', 'human'])
  .describe(
    'Whether this operator is an autonomous agent (e.g. a Claude Code instance, a coding bot, an autonomous worker) or a human (e.g. a teammate whose meetings/notes/screen-recordings should feed the company brain).',
  );

export function registerOperatorTools(server: McpServer, client: InvarianceClient): void {
  registerReadTool(
    server,
    'invariance_operator_me',
    'Show the operator identity associated with the current credentials. An "operator" is the unified actor model — every Claude Code session, autonomous agent, AND human teammate is an operator. Use this to confirm which operator context the MCP server is acting as (e.g. before recording session events, attaching runs, or writing notes to the company brain).',
    {},
    async () => jsonResult(await client.get('/v1/operators/me')),
  );

  registerWriteTool(
    server,
    'invariance_operator_create',
    "Create a new operator in one of the caller's projects. Operators are the actors whose work shows up in the company brain — create operator_type='agent' for an autonomous worker (Claude Code, a scripted agent, a coding bot) and operator_type='human' for a teammate whose screen recordings, microphone capture, meetings, and Granola notes you want to ingest. Requires a user-session JWT bearer.",
    {
      name: z.string().describe('Operator display name (visible in the dashboard).'),
      project_id: z.string().describe('Project ID the operator will live under. The caller must be a member.'),
      operator_type: operatorType,
    },
    async ({ name, project_id, operator_type }) => {
      const body = { name, project_id, operator_type };
      return jsonResult(await client.post('/v1/operators', body));
    },
  );

  registerReadTool(
    server,
    'invariance_operator_list',
    "List operators inside one of the caller's projects. Filter by operator_type to find all human teammates or all autonomous agents. Requires a user-session JWT bearer.",
    {
      project_id: z.string().describe('Project ID. The caller must be a member.'),
      operator_type: operatorType.optional(),
    },
    async ({ project_id, operator_type }) =>
      jsonResult(await client.get('/v1/operators', { project_id, operator_type })),
  );

  registerReadTool(
    server,
    'invariance_operator_get',
    'Fetch a single operator by ID. Requires a user-session JWT bearer.',
    { id: z.string().describe('Operator ID.') },
    async ({ id }) => {
      const res = await client.get<{ operator: unknown }>(
        `/v1/operators/${encodeURIComponent(id)}`,
      );
      return jsonResult(res.operator);
    },
  );
}
