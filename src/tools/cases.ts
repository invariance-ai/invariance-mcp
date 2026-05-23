import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { InvarianceClient } from '../lib/client.js';
import { jsonResult, parseJsonArg, registerReadTool, registerWriteTool } from '../lib/util.js';

// Cases are workflow instances — they own many runs across time, agents, and
// humans (one loan, one audit, one claim). Wrap multi-run agentic workflows in
// a case so tenant/end-user/outcome data is queryable end-to-end.

export function registerCaseTools(server: McpServer, client: InvarianceClient): void {
  registerWriteTool(
    server,
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
      tags: z
        .array(z.string())
        .optional()
        .describe('Free-form labels for filtering and rollups, e.g. ["urgent","vip"]. Normalized (trimmed/lowercased/deduped) server-side.'),
      opened_at: z
        .string()
        .optional()
        .describe('ISO-8601 timestamp when the case opened in the source system. Defaults to now.'),
    },
    async ({ workflow_key, tenant_id, end_user_id, owner, custom_attrs, tags, opened_at }) => {
      const body: Record<string, unknown> = { workflow_key };
      if (tenant_id !== undefined) body.tenant_id = tenant_id;
      if (end_user_id !== undefined) body.end_user_id = end_user_id;
      if (owner !== undefined) body.owner = owner;
      const attrs = parseJsonArg('custom_attrs', custom_attrs);
      if (attrs !== undefined) body.custom_attrs = attrs;
      if (tags !== undefined) body.tags = tags;
      if (opened_at !== undefined) body.opened_at = opened_at;
      const res = await client.post<{ case: unknown }>('/v1/cases', body);
      return jsonResult(res.case);
    },
  );

  registerReadTool(
    server,
    'invariance_case_get',
    'Get a case by id, including its linked runs (newest first, capped at 100). Use to inspect status, outcome, owner, custom_attrs, and the runs the case has accumulated.',
    { id: z.string().describe('Case id, e.g. "case_abc123".') },
    async ({ id }) => {
      const res = await client.get<{ case: unknown }>(`/v1/cases/${encodeURIComponent(id)}`);
      return jsonResult(res.case);
    },
  );

  registerReadTool(
    server,
    'invariance_case_evidence',
    'Show normalized evidence for a case: the case, linked runs, nodes, workflow events, actors, and outcome. Use this when you need the full workflow execution record instead of only the case row.',
    { id: z.string().describe('Case id, e.g. "case_abc123".') },
    async ({ id }) => jsonResult(await client.get(`/v1/cases/${encodeURIComponent(id)}/evidence`)),
  );

  registerReadTool(
    server,
    'invariance_case_events_list',
    'List semantic workflow events attached to one case. These are the queryable facts over the run/node evidence layer.',
    {
      id: z.string().describe('Case id, e.g. "case_abc123".'),
      cursor: z.string().optional().describe('opaque pagination token; pass through unchanged'),
      limit: z.number().int().positive().max(200).optional(),
    },
    async ({ id, cursor, limit }) =>
      jsonResult(await client.get(`/v1/cases/${encodeURIComponent(id)}/events`, { cursor, limit })),
  );

  registerWriteTool(
    server,
    'invariance_case_event_create',
    'Attach a semantic workflow event to a case, e.g. "support.customer.escalated", "approval.granted", or "docs.received". Prefer this for meaningful workflow facts; keep raw execution trace data in runs/nodes.',
    {
      id: z.string().describe('Case id, e.g. "case_abc123".'),
      type: z.string().min(1).max(128).describe('Dotted semantic event type.'),
      actor_type: z
        .enum(['human', 'agent', 'llm', 'service', 'integration', 'policy', 'system'])
        .optional(),
      actor_id: z.string().nullable().optional(),
      payload: z.string().optional().describe('JSON object string for event-specific fields.'),
      evidence_node_ids: z.array(z.string()).optional().describe('Node ids that justify this event.'),
      evidence_refs: z
        .string()
        .optional()
        .describe('JSON array of non-node evidence refs: tickets, docs, Slack, GitHub, meetings, URLs.'),
      tags: z.array(z.string()).optional().describe('Free-form labels for filtering and rollups. Normalized server-side.'),
      occurred_at: z.string().optional().describe('ISO-8601 source timestamp. Defaults to now.'),
    },
    async ({ id, type, actor_type, actor_id, payload, evidence_node_ids, evidence_refs, tags, occurred_at }) => {
      const body: Record<string, unknown> = { type };
      if (actor_type !== undefined) body.actor_type = actor_type;
      if (actor_id !== undefined) body.actor_id = actor_id;
      const parsedPayload = parseJsonArg('payload', payload);
      if (parsedPayload !== undefined) body.payload = parsedPayload;
      if (evidence_node_ids !== undefined) body.evidence_node_ids = evidence_node_ids;
      const parsedRefs = parseJsonArg('evidence_refs', evidence_refs);
      if (parsedRefs !== undefined) body.evidence_refs = parsedRefs;
      if (tags !== undefined) body.tags = tags;
      if (occurred_at !== undefined) body.occurred_at = occurred_at;
      const res = await client.post<{ event: unknown }>(
        `/v1/cases/${encodeURIComponent(id)}/events`,
        body,
      );
      return jsonResult(res.event);
    },
  );

  registerReadTool(
    server,
    'invariance_case_list',
    'List cases visible to the calling agent (paginated). Filter by tenant_id, end_user_id, workflow_key, status ("open" | "closed"), outcome, or tags.',
    {
      cursor: z.string().optional().describe('opaque pagination token; pass through unchanged'),
      limit: z.number().int().positive().max(200).optional(),
      tenant_id: z.string().optional(),
      end_user_id: z.string().optional(),
      workflow_key: z.string().optional(),
      status: z.enum(['open', 'closed']).optional(),
      outcome: z.string().optional(),
      tags: z.string().optional().describe('Comma-separated tags; matches cases containing ALL of them, e.g. "urgent,vip".'),
    },
    async (args) => jsonResult(await client.get('/v1/cases', args)),
  );

  registerWriteTool(
    server,
    'invariance_case_update',
    'Update a case: change owner, merge custom_attrs (shallow), or transition status. Use invariance_case_close for the common "set outcome + close" path.',
    {
      id: z.string(),
      status: z.enum(['open', 'closed']).optional(),
      outcome: z.string().max(64).nullable().optional().describe('Required when transitioning to "closed" if you want $/outcome rollups.'),
      outcome_value_usd: z.number().nullable().optional().describe('Realized $ value (positive) or loss (negative).'),
      owner: z.string().max(128).nullable().optional(),
      custom_attrs: z.string().optional().describe('JSON object string; shallow-merged with existing attrs.'),
      tags: z.array(z.string()).optional().describe('Replaces the tag set. Normalized server-side. Pass [] to clear.'),
      closed_at: z.string().nullable().optional(),
    },
    async ({ id, status, outcome, outcome_value_usd, owner, custom_attrs, tags, closed_at }) => {
      const body: Record<string, unknown> = {};
      if (status !== undefined) body.status = status;
      if (outcome !== undefined) body.outcome = outcome;
      if (outcome_value_usd !== undefined) body.outcome_value_usd = outcome_value_usd;
      if (owner !== undefined) body.owner = owner;
      const attrs = parseJsonArg('custom_attrs', custom_attrs);
      if (attrs !== undefined) body.custom_attrs = attrs;
      if (tags !== undefined) body.tags = tags;
      if (closed_at !== undefined) body.closed_at = closed_at;
      const res = await client.patch<{ case: unknown }>(
        `/v1/cases/${encodeURIComponent(id)}`,
        body,
      );
      return jsonResult(res.case);
    },
  );

  registerWriteTool(
    server,
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
