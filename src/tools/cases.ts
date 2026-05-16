import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { InvarianceClient } from '../lib/client.js';
import { jsonResult, parseJsonArg } from '../lib/util.js';

// Cases are workflow instances — they own many runs across time, agents, and
// humans (one loan, one audit, one claim). Wrap multi-run agentic workflows in
// a case so tenant/end-user/outcome data is queryable end-to-end.

export function registerCaseTools(server: McpServer, client: InvarianceClient): void {
  server.tool(
    'invariance_case_create',
    'Create a workflow-instance Case. A case owns many runs across time, agents, and humans (one loan, one audit, one claim). Returns the case; use its id when starting runs with invariance_run_start to link them.',
    {
      workflow_key: z
        .string()
        .max(128)
        .describe('Stable workflow identifier, e.g. "mortgage.refi" or "audit.sox.control".'),
      tenant_id: z
        .string()
        .max(128)
        .optional()
        .describe('Your customer (the platform user / firm). Distinct from the Invariance org running the agent.'),
      end_user_id: z
        .string()
        .max(128)
        .optional()
        .describe('Human the workflow is acting on behalf of (loan applicant, reviewer).'),
      owner: z.string().max(128).optional().describe('Assigned team or human reviewer.'),
      custom_attrs: z
        .string()
        .optional()
        .describe('JSON object string of domain attributes (e.g. {"loan_id":"L_1","amount":250000}).'),
      opened_at: z
        .string()
        .optional()
        .describe('ISO-8601 timestamp when the case opened in the source system. Defaults to now.'),
    },
    async ({ workflow_key, tenant_id, end_user_id, owner, custom_attrs, opened_at }) => {
      const body: Record<string, unknown> = { workflow_key };
      if (tenant_id !== undefined) body.tenant_id = tenant_id;
      if (end_user_id !== undefined) body.end_user_id = end_user_id;
      if (owner !== undefined) body.owner = owner;
      const attrs = parseJsonArg('custom_attrs', custom_attrs);
      if (attrs !== undefined) body.custom_attrs = attrs;
      if (opened_at !== undefined) body.opened_at = opened_at;
      const res = await client.post<{ case: unknown }>('/v1/cases', body);
      return jsonResult(res.case);
    },
  );

  server.tool(
    'invariance_case_get',
    'Get a case by id, including its linked runs (newest first, capped at 100). Use to inspect status, outcome, owner, custom_attrs, and the runs the case has accumulated.',
    { id: z.string().describe('Case id, e.g. "case_abc123".') },
    async ({ id }) => {
      const res = await client.get<{ case: unknown }>(`/v1/cases/${encodeURIComponent(id)}`);
      return jsonResult(res.case);
    },
  );

  server.tool(
    'invariance_case_list',
    'List cases visible to the calling agent (paginated). Filter by tenant_id, end_user_id, workflow_key, status ("open" | "closed"), or outcome.',
    {
      cursor: z.string().optional().describe('opaque pagination token; pass through unchanged'),
      limit: z.number().int().positive().max(200).optional(),
      tenant_id: z.string().optional(),
      end_user_id: z.string().optional(),
      workflow_key: z.string().optional(),
      status: z.enum(['open', 'closed']).optional(),
      outcome: z.string().optional(),
    },
    async (args) => jsonResult(await client.get('/v1/cases', args)),
  );

  server.tool(
    'invariance_case_update',
    'Update a case: change owner, merge custom_attrs (shallow), or transition status. Use invariance_case_close for the common "set outcome + close" path.',
    {
      id: z.string(),
      status: z.enum(['open', 'closed']).optional(),
      outcome: z.string().max(64).nullable().optional().describe('Required when transitioning to "closed" if you want $/outcome rollups.'),
      outcome_value_usd: z.number().nullable().optional().describe('Realized $ value (positive) or loss (negative).'),
      owner: z.string().max(128).nullable().optional(),
      custom_attrs: z.string().optional().describe('JSON object string; shallow-merged with existing attrs.'),
      closed_at: z.string().nullable().optional(),
    },
    async ({ id, status, outcome, outcome_value_usd, owner, custom_attrs, closed_at }) => {
      const body: Record<string, unknown> = {};
      if (status !== undefined) body.status = status;
      if (outcome !== undefined) body.outcome = outcome;
      if (outcome_value_usd !== undefined) body.outcome_value_usd = outcome_value_usd;
      if (owner !== undefined) body.owner = owner;
      const attrs = parseJsonArg('custom_attrs', custom_attrs);
      if (attrs !== undefined) body.custom_attrs = attrs;
      if (closed_at !== undefined) body.closed_at = closed_at;
      const res = await client.patch<{ case: unknown }>(
        `/v1/cases/${encodeURIComponent(id)}`,
        body,
      );
      return jsonResult(res.case);
    },
  );

  server.tool(
    'invariance_case_close',
    'Close a case with an outcome — the common path. Equivalent to invariance_case_update with status="closed" + outcome + outcome_value_usd.',
    {
      id: z.string(),
      outcome: z.string().max(64).describe('e.g. "approved", "denied", "escalated", "auto_resolved".'),
      value_usd: z.number().optional().describe('Realized $ value (positive) or loss (negative).'),
      closed_at: z.string().optional().describe('ISO-8601 close time. Defaults to now.'),
    },
    async ({ id, outcome, value_usd, closed_at }) => {
      const body: Record<string, unknown> = { status: 'closed', outcome };
      if (value_usd !== undefined) body.outcome_value_usd = value_usd;
      if (closed_at !== undefined) body.closed_at = closed_at;
      const res = await client.patch<{ case: unknown }>(
        `/v1/cases/${encodeURIComponent(id)}`,
        body,
      );
      return jsonResult(res.case);
    },
  );
}
