import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { InvarianceClient } from '../lib/client.js';
import { jsonResult, parseJsonArg } from '../lib/util.js';

export function registerNodeTools(server: McpServer, client: InvarianceClient): void {
  server.tool(
    'invariance_node_write',
    'Write a node to an Invariance run',
    {
      run_id: z.string(),
      action_type: z.string().describe('e.g. tool_call, llm_call, log'),
      type: z.string().optional().describe('Declared custom node type (see node_types)'),
      input: z.string().optional().describe('Input as a JSON string'),
      output: z.string().optional().describe('Output as a JSON string'),
      error: z.string().optional().describe('Error as a JSON string'),
      metadata: z.string().optional().describe('Metadata as a JSON object string'),
      custom_fields: z.string().optional().describe('Custom fields as a JSON object string'),
    },
    async ({ run_id, action_type, type, input, output, error, metadata, custom_fields }) => {
      const node: Record<string, unknown> = { run_id, action_type };
      if (type !== undefined) node.type = type;
      const i = parseJsonArg('input', input);
      if (i !== undefined) node.input = i;
      const o = parseJsonArg('output', output);
      if (o !== undefined) node.output = o;
      const e = parseJsonArg('error', error);
      if (e !== undefined) node.error = e;
      const m = parseJsonArg('metadata', metadata);
      if (m !== undefined) node.metadata = m;
      const cf = parseJsonArg('custom_fields', custom_fields);
      if (cf !== undefined) node.custom_fields = cf;
      const res = await client.post<{ data: unknown[] }>('/v1/nodes', [node]);
      return jsonResult(res.data[0]);
    },
  );

  server.tool(
    'invariance_node_list',
    'List nodes for a run',
    {
      run_id: z.string(),
      cursor: z.string().optional(),
      limit: z.number().int().positive().max(500).optional(),
    },
    async ({ run_id, cursor, limit }) =>
      jsonResult(
        await client.get(`/v1/runs/${encodeURIComponent(run_id)}/nodes`, { cursor, limit }),
      ),
  );
}
