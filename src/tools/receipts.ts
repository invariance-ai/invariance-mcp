import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { InvarianceClient } from '../lib/client.js';
import { jsonResult, parseJsonArg, registerReadTool, registerWriteTool } from '../lib/util.js';

const receiptDescribe =
  'CreateExternalReceiptRequest as a JSON object string. Required: source ("stripe|zendesk|salesforce|hubspot|slack|linear|jira|webhook|jsonl|csv|custom"), kind (string). Optional: run_id, node_id, external_id, occurred_at, business_object_type, business_object_id, subject_type, subject_id (strings), correlation_keys ({customer_id,ticket_id,refund_id,...}), payload, metadata (objects). Example: {"source":"stripe","kind":"refund.created","external_id":"re_1","correlation_keys":{"charge_id":"ch_1"},"payload":{"amount":500}}';

export function registerReceiptTools(server: McpServer, client: InvarianceClient): void {
  registerWriteTool(
    server,
    'invariance_receipt_create',
    'Record one external receipt (proof an external action happened). Requires an AGENT API key (operator tokens get 403).',
    { receipt: z.string().describe(receiptDescribe) },
    async ({ receipt }) => {
      const res = await client.post<{ receipt: unknown }>(
        '/v1/receipts',
        parseJsonArg('receipt', receipt),
      );
      return jsonResult(res.receipt);
    },
  );

  registerWriteTool(
    server,
    'invariance_receipt_batch',
    'Record many external receipts in one call. Requires an AGENT API key (operator tokens get 403).',
    {
      receipts: z
        .string()
        .describe(
          `JSON array of CreateExternalReceiptRequest objects. Each element: ${receiptDescribe}`,
        ),
    },
    async ({ receipts }) => {
      const parsed = parseJsonArg('receipts', receipts);
      const res = await client.post<{ receipts: unknown }>('/v1/receipts/batch', {
        receipts: parsed,
      });
      return jsonResult(res.receipts);
    },
  );

  registerReadTool(
    server,
    'invariance_receipt_list',
    'List external receipts. Filter by run, node, source, kind, external_id, business object.',
    {
      cursor: z
        .string()
        .optional()
        .describe('opaque pagination token from previous response next_cursor; pass through unchanged'),
      limit: z.number().int().positive().max(200).optional(),
      run_id: z.string().optional(),
      node_id: z.string().optional(),
      source: z.string().optional(),
      kind: z.string().optional(),
      external_id: z.string().optional(),
      business_object_type: z.string().optional(),
      business_object_id: z.string().optional(),
    },
    async (args) => jsonResult(await client.get('/v1/receipts', args)),
  );

  registerReadTool(
    server,
    'invariance_receipt_get',
    'Get an external receipt by ID.',
    { id: z.string() },
    async ({ id }) => {
      const res = await client.get<{ receipt: unknown }>(
        `/v1/receipts/${encodeURIComponent(id)}`,
      );
      return jsonResult(res.receipt);
    },
  );
}
