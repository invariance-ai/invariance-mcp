import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { InvarianceClient } from '../lib/client.js';
import { jsonResult, parseJsonArg, registerReadTool, registerWriteTool } from '../lib/util.js';

export function registerRunTools(server: McpServer, client: InvarianceClient): void {
  registerWriteTool(
    server,
    'invariance_run_start',
    'Start a new Invariance run (the container for a sequence of nodes). The returned run is in status "open" — you must close it later with invariance_run_finish (success) or invariance_run_fail (error).',
    {
      name: z.string().optional().describe('Human-readable run name shown in dashboards.'),
      metadata: z
        .string()
        .optional()
        .describe(
          'Free-form metadata as a JSON object string. Example: {"user_id":"u_42","workspace":"acme","risk_tier":"high"}',
        ),
      case_id: z
        .string()
        .optional()
        .describe(
          'Case (workflow instance) this run belongs to. Server inherits tenant_id/end_user_id from the case. Create one first with invariance_case_create.',
        ),
      tenant_id: z
        .string()
        .optional()
        .describe('Override tenant_id (normally inherited from case). Your customer (the platform user / firm).'),
      end_user_id: z
        .string()
        .optional()
        .describe('Override end_user_id (normally inherited from case). The human the workflow acts on behalf of.'),
    },
    async ({ name, metadata, case_id, tenant_id, end_user_id }) => {
      const body: Record<string, unknown> = {};
      if (name !== undefined) body.name = name;
      const meta = parseJsonArg('metadata', metadata);
      if (meta !== undefined) body.metadata = meta;
      if (case_id !== undefined) body.case_id = case_id;
      if (tenant_id !== undefined) body.tenant_id = tenant_id;
      if (end_user_id !== undefined) body.end_user_id = end_user_id;
      const res = await client.post<{ run: unknown }>('/v1/runs', body);
      return jsonResult(res.run);
    },
  );

  registerReadTool(
    server,
    'invariance_run_get',
    'Get details of an Invariance run (status, metadata, aggregate counts, timestamps).',
    { id: z.string().describe('Run ID, e.g. "run_abc123".') },
    async ({ id }) => {
      const res = await client.get<{ run: unknown }>(`/v1/runs/${encodeURIComponent(id)}`);
      return jsonResult(res.run);
    },
  );

  registerReadTool(
    server,
    'invariance_run_list',
    'List runs visible to the calling agent in reverse-chronological order (paginated).',
    {
      cursor: z
        .string()
        .optional()
        .describe('opaque pagination token from previous response next_cursor; pass through unchanged'),
      limit: z.number().int().positive().max(200).optional(),
    },
    async ({ cursor, limit }) =>
      jsonResult(await client.get('/v1/runs', { cursor, limit })),
  );

  registerWriteTool(
    server,
    'invariance_run_finish',
    'Close a run successfully — sets status to "completed". Use this when the agent finished its work without errors. For failures, use invariance_run_fail instead.',
    { id: z.string() },
    async ({ id }) => {
      const res = await client.patch<{ run: unknown }>(
        `/v1/runs/${encodeURIComponent(id)}`,
        { status: 'completed' },
      );
      return jsonResult(res.run);
    },
  );

  // Symmetric with invariance_run_finish: both are terminal state transitions on
  // the same resource (PATCH /v1/runs/:id with status). destructiveHint is reserved
  // for tools that delete data (e.g. kb_page_delete), not state machine transitions.
  registerWriteTool(
    server,
    'invariance_run_fail',
    'Close a run with failure — sets status to "failed" and stores the optional error string in metadata.error. Use this when the agent aborted due to an exception or unrecoverable error. For successful completion, use invariance_run_finish.',
    {
      id: z.string(),
      error: z.string().optional().describe('Short error description, stored at metadata.error (e.g. exception message).'),
    },
    async ({ id, error }) => {
      const body: Record<string, unknown> = { status: 'failed' };
      if (error !== undefined) body.metadata = { error };
      const res = await client.patch<{ run: unknown }>(
        `/v1/runs/${encodeURIComponent(id)}`,
        body,
      );
      return jsonResult(res.run);
    },
  );

  registerReadTool(
    server,
    'invariance_run_verify',
    'Verify the cryptographic proof chain for a run — recomputes node hashes and Ed25519 signatures end-to-end. Returns {valid, node_count, head_hash, first_invalid_node_id, reason}.',
    { id: z.string() },
    async ({ id }) =>
      jsonResult(await client.get(`/v1/runs/${encodeURIComponent(id)}/verify`)),
  );

  registerReadTool(
    server,
    'invariance_run_metrics',
    'Aggregate metrics for a run: total_input_tokens, total_output_tokens, total_cache_read/write, total_cost_usd, llm_call_count, tool_call_count, error_count, total_latency_ms.',
    { id: z.string() },
    async ({ id }) =>
      jsonResult(await client.get(`/v1/runs/${encodeURIComponent(id)}/metrics`)),
  );
}
