import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { InvarianceClient } from '../lib/client.js';
import { jsonResult, parseJsonArg } from '../lib/util.js';

export function registerNodeTools(server: McpServer, client: InvarianceClient): void {
  server.tool(
    'invariance_node_write',
    'Append a single node (one unit of work) to an open Invariance run. Use this to record tool calls, LLM calls, logs, context attachments, or handoffs as they happen.',
    {
      run_id: z.string(),
      action_type: z.string().describe(
        'Free-form verb describing what happened. Conventional values used by the SDK helpers: "tool_call" (a tool/function invocation; pair with type:"tool_call" and custom_fields.tool_name/status), "llm_call" (a model inference call), "log" (human-legible breadcrumb; input.message holds the text), "context" (structured state attached to the run, e.g. user_id), "handoff" (delegation to another agent; set handoff_from/to/reason). Custom verbs are allowed; monitors can select on this field.',
      ),
      type: z
        .string()
        .optional()
        .describe(
          'Declared custom node type registered via invariance_node_type_register / defineNodeType. Narrows the shape of custom_fields and is selectable by monitors via on.node({type}).',
        ),
      input: z.string().optional().describe('Node input payload as a JSON-encoded string (any JSON value: object, array, string, number).'),
      output: z.string().optional().describe('Node output payload as a JSON-encoded string (any JSON value).'),
      error: z.string().optional().describe('Error payload as a JSON-encoded string. Example: {"type":"TimeoutError","message":"upstream took >30s"}'),
      metadata: z.string().optional().describe('Free-form metadata as a JSON object string. Example: {"model":"claude-opus-4-7","temperature":0.2}'),
      custom_fields: z.string().optional().describe('Typed custom fields as a JSON object string. For type="tool_call": {"tool_name":"search","status":"success","tool_input":{...},"tool_output":{...},"latency_ms":120}'),
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
      const data = await client.writeNodes(run_id, [node]);
      return jsonResult(data[0]);
    },
  );

  server.tool(
    'invariance_node_list',
    'List nodes for a run in append order (paginated).',
    {
      run_id: z.string(),
      cursor: z
        .string()
        .optional()
        .describe('opaque pagination token from previous response next_cursor; pass through unchanged'),
      limit: z.number().int().positive().max(500).optional(),
    },
    async ({ run_id, cursor, limit }) =>
      jsonResult(
        await client.get(`/v1/runs/${encodeURIComponent(run_id)}/nodes`, { cursor, limit }),
      ),
  );
}
