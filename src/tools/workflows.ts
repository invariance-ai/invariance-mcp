import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { InvarianceClient } from '../lib/client.js';
import {
  jsonResult,
  parseJsonArg,
  registerDestructiveTool,
  registerReadTool,
  registerWriteTool,
} from '../lib/util.js';

const eventFilters = {
  cursor: z.string().optional().describe('opaque pagination token; pass through unchanged'),
  limit: z.number().int().positive().max(200).optional(),
  case_id: z.string().optional(),
  tenant_id: z.string().optional(),
  end_user_id: z.string().optional(),
  workflow_key: z.string().optional(),
  type: z.string().optional().describe('Dotted semantic event type.'),
  actor_type: z
    .enum(['human', 'agent', 'llm', 'service', 'integration', 'policy', 'system'])
    .optional(),
  actor_id: z.string().optional(),
  from: z.string().optional().describe('Only events at or after this ISO timestamp.'),
  to: z.string().optional().describe('Only events before this ISO timestamp.'),
};

const definitionJsonArgs = {
  description: z.string().nullable().optional(),
  expected_fields: z
    .string()
    .optional()
    .describe('JSON array of typed fields, e.g. [{"name":"priority","type":"enum","enum":["p0"]}].'),
  expected_steps: z
    .string()
    .optional()
    .describe('JSON array of expected workflow steps, e.g. [{"type":"triage","required":true}].'),
  allowed_outcomes: z
    .string()
    .optional()
    .describe('JSON array of allowed outcomes, e.g. [{"value":"resolved","kind":"success"}].'),
  custom_metrics: z
    .string()
    .optional()
    .describe('JSON array of metric widgets, e.g. [{"kind":"count","label":"Escalations","event_type":"support.escalated"}].'),
};

function workflowDefinitionBody(args: {
  display_name?: string;
  description?: string | null;
  expected_fields?: string;
  expected_steps?: string;
  allowed_outcomes?: string;
  custom_metrics?: string;
}): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (args.display_name !== undefined) body.display_name = args.display_name;
  if (args.description !== undefined) body.description = args.description;
  const fields = parseJsonArg('expected_fields', args.expected_fields);
  if (fields !== undefined) body.expected_fields = fields;
  const steps = parseJsonArg('expected_steps', args.expected_steps);
  if (steps !== undefined) body.expected_steps = steps;
  const outcomes = parseJsonArg('allowed_outcomes', args.allowed_outcomes);
  if (outcomes !== undefined) body.allowed_outcomes = outcomes;
  const metrics = parseJsonArg('custom_metrics', args.custom_metrics);
  if (metrics !== undefined) body.custom_metrics = metrics;
  return body;
}

export function registerWorkflowTools(server: McpServer, client: InvarianceClient): void {
  registerReadTool(
    server,
    'invariance_workflow_list',
    'List workflow definitions: typed fields, expected steps, allowed outcomes, and custom metrics.',
    {},
    async () => jsonResult(await client.get('/v1/workflow-definitions')),
  );

  registerReadTool(
    server,
    'invariance_workflow_get',
    'Get one workflow definition by workflow key.',
    { key: z.string().describe('Workflow key, e.g. "support.escalation".') },
    async ({ key }) =>
      jsonResult(await client.get(`/v1/workflow-definitions/${encodeURIComponent(key)}`)),
  );

  registerWriteTool(
    server,
    'invariance_workflow_create',
    'Create a workflow definition with typed fields, expected steps, allowed outcomes, and custom metrics.',
    {
      key: z.string().min(1).max(128),
      display_name: z.string().min(1).max(128),
      ...definitionJsonArgs,
    },
    async ({ key, ...args }) => {
      const body = { key, ...workflowDefinitionBody(args) };
      const res = await client.post<{ definition: unknown }>('/v1/workflow-definitions', body);
      return jsonResult(res.definition);
    },
  );

  registerWriteTool(
    server,
    'invariance_workflow_update',
    'Patch a workflow definition. Existing cases/runs/events keep their workflow_key.',
    {
      key: z.string().min(1).max(128),
      display_name: z.string().min(1).max(128).optional(),
      ...definitionJsonArgs,
    },
    async ({ key, ...args }) => {
      const res = await client.patch<{ definition: unknown }>(
        `/v1/workflow-definitions/${encodeURIComponent(key)}`,
        workflowDefinitionBody(args),
      );
      return jsonResult(res.definition);
    },
  );

  registerDestructiveTool(
    server,
    'invariance_workflow_delete',
    'Delete a workflow definition. Existing cases/runs/events are retained.',
    { key: z.string().min(1).max(128) },
    async ({ key }) => {
      const res = await client.delete<{ ok: true }>(
        `/v1/workflow-definitions/${encodeURIComponent(key)}`,
      );
      return jsonResult(res);
    },
  );

  registerReadTool(
    server,
    'invariance_workflow_event_list',
    'List semantic workflow events across cases. Filter by case, workflow, tenant, actor, type, or time window.',
    eventFilters,
    async (args) => jsonResult(await client.get('/v1/events', args)),
  );

  registerWriteTool(
    server,
    'invariance_workflow_event_create',
    'Record a semantic workflow event on a case (e.g. "refund.issued", "approval.approved", "human.handoff"). Links case/run/node evidence + external refs and is bridged into DNA. Pass idempotency_key to make external retries safe.',
    {
      case_id: z.string().describe('Case the event belongs to.'),
      type: z.string().min(1).max(128).describe('Dotted semantic type, e.g. "refund.issued".'),
      actor_type: z
        .enum(['human', 'agent', 'llm', 'service', 'integration', 'policy', 'system'])
        .optional(),
      actor_id: z.string().optional().describe('Free-form actor id (user, run, slack user, ...).'),
      payload: z
        .string()
        .optional()
        .describe('JSON object of event detail, e.g. {"amount_usd":42,"ticket":"ZD-1001"}.'),
      evidence_node_ids: z
        .string()
        .optional()
        .describe('JSON array of node ids in the runs/nodes evidence layer.'),
      evidence_refs: z
        .string()
        .optional()
        .describe(
          'JSON array of non-node evidence refs, e.g. [{"kind":"ticket","id":"ZD-1001","url":"https://..."}]. Use kind:"external" for external object refs.',
        ),
      idempotency_key: z
        .string()
        .max(256)
        .optional()
        .describe('Dedup key for repeated external events; re-sending returns the original event.'),
      occurred_at: z.string().optional().describe('ISO timestamp the fact happened. Defaults to now.'),
    },
    async ({ case_id, type, actor_type, actor_id, idempotency_key, occurred_at, ...rest }) => {
      const body: Record<string, unknown> = { type };
      if (actor_type !== undefined) body.actor_type = actor_type;
      if (actor_id !== undefined) body.actor_id = actor_id;
      if (idempotency_key !== undefined) body.idempotency_key = idempotency_key;
      if (occurred_at !== undefined) body.occurred_at = occurred_at;
      const payload = parseJsonArg('payload', rest.payload);
      if (payload !== undefined) body.payload = payload;
      const nodeIds = parseJsonArg('evidence_node_ids', rest.evidence_node_ids);
      if (nodeIds !== undefined) body.evidence_node_ids = nodeIds;
      const refs = parseJsonArg('evidence_refs', rest.evidence_refs);
      if (refs !== undefined) body.evidence_refs = refs;
      const res = await client.post<{ event: unknown }>(
        `/v1/cases/${encodeURIComponent(case_id)}/events`,
        body,
      );
      return jsonResult(res.event);
    },
  );
}
