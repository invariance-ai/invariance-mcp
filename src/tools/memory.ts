import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { InvarianceClient } from '../lib/client.js';
import { jsonResult, parseJsonArg, registerReadTool, registerWriteTool } from '../lib/util.js';

const SubjectType = z.enum([
  'customer',
  'account',
  'user',
  'policy',
  'workflow',
  'preference',
]);

const Source = z.enum([
  'agent_write',
  'human_write',
  'crm',
  'ticket',
  'policy_doc',
  'external_system',
]);

export function registerMemoryTools(server: McpServer, client: InvarianceClient): void {
  // readOnlyHint=true: the user-visible semantic is "observe a belief". The server-side
  // MemoryAccess audit event is idempotent bookkeeping (provenance for divergence
  // detectors), not a mutation of agent-addressable state — so the Read annotation
  // accurately conveys the contract to client UIs/approval flows.
  registerReadTool(
    server,
    'invariance_memory_read',
    'Record a memory read by an agent against a subject (customer/account/policy/...) and return the current MemoryRecord (if any). Use this whenever an agent consults a remembered belief — it produces an auditable MemoryAccess event tying that belief to a node in the run, which the divergence detectors use to flag stale or unsupported memory.',
    {
      run_id: z
        .string()
        .optional()
        .describe('Run to attach the access event to. Falls back to the server-side request context if omitted.'),
      node_id: z
        .string()
        .optional()
        .describe('Node within the run that performed the read. Falls back to request context.'),
      subject_type: SubjectType,
      subject_id: z.string().describe('ID of the subject (e.g. customer ID, policy ID).'),
      key: z.string().describe('Belief key, e.g. "preferred_contact_channel" or "tier".'),
      used_for: z
        .string()
        .describe('Free-text purpose for the read (used by divergence reasoning). Example: "select-channel".'),
    },
    async ({ run_id, node_id, subject_type, subject_id, key, used_for }) => {
      const body: Record<string, unknown> = { subject_type, subject_id, key, used_for };
      if (run_id !== undefined) body.run_id = run_id;
      if (node_id !== undefined) body.node_id = node_id;
      return jsonResult(await client.post('/v1/memory/read', body));
    },
  );

  registerWriteTool(
    server,
    'invariance_memory_write',
    'Record a memory write by an agent: set or update a belief (claim) about a subject. Returns the new MemoryAccess + MemoryRecord. Defaults: source="agent_write", confidence=1.0. Provide `provenance` (EvidenceRef[] as JSON) when the claim is derived from authoritative records (CRM/ticket/policy doc) so downstream divergence checks can verify it.',
    {
      run_id: z.string().optional(),
      node_id: z.string().optional(),
      subject_type: SubjectType,
      subject_id: z.string(),
      key: z.string(),
      value: z.string().describe('Value of the claim, JSON-encoded. Example: "\\"email\\"" or "{\\"tier\\":\\"gold\\"}".'),
      used_for: z.string(),
      source: Source.optional().describe('Origin of the claim. Defaults to agent_write.'),
      confidence: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe('Confidence in the claim, [0,1]. Defaults to 1.0.'),
      provenance: z
        .string()
        .optional()
        .describe('EvidenceRef[] as a JSON-encoded array. Example: [{"kind":"document","id":"doc_1"}]'),
      valid_until: z
        .string()
        .nullable()
        .optional()
        .describe('ISO8601 expiry. null means open-ended.'),
    },
    async ({
      run_id,
      node_id,
      subject_type,
      subject_id,
      key,
      value,
      used_for,
      source,
      confidence,
      provenance,
      valid_until,
    }) => {
      const parsedValue = parseJsonArg('value', value);
      if (parsedValue === undefined) {
        throw new Error('value is required and must be a JSON-encoded string');
      }
      const body: Record<string, unknown> = {
        subject_type,
        subject_id,
        key,
        value: parsedValue,
        used_for,
        source: source ?? 'agent_write',
        confidence: confidence ?? 1.0,
      };
      if (run_id !== undefined) body.run_id = run_id;
      if (node_id !== undefined) body.node_id = node_id;
      const prov = parseJsonArg('provenance', provenance);
      if (prov !== undefined) body.provenance = prov;
      if (valid_until !== undefined) body.valid_until = valid_until;
      return jsonResult(await client.post('/v1/memory/write', body));
    },
  );
}
