import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { InvarianceClient } from '../lib/client.js';
import { jsonResult, registerReadTool, registerWriteTool } from '../lib/util.js';

const decisionEnum = z.enum(['passed', 'failed', 'needs_fix']);

export function registerReviewTools(server: McpServer, client: InvarianceClient): void {
  registerReadTool(
    server,
    'invariance_review_list',
    'List reviews (work items requesting agent/human adjudication of a finding or run) in the queue, paginated.',
    {
      cursor: z
        .string()
        .optional()
        .describe('opaque pagination token from previous response next_cursor; pass through unchanged'),
      limit: z.number().int().positive().max(200).optional(),
    },
    async ({ cursor, limit }) =>
      jsonResult(await client.get('/v1/reviews', { cursor, limit })),
  );

  registerReadTool(
    server,
    'invariance_review_get',
    'Get a review by ID.',
    { id: z.string() },
    async ({ id }) => {
      const res = await client.get<{ review: unknown }>(
        `/v1/reviews/${encodeURIComponent(id)}`,
      );
      return jsonResult(res.review);
    },
  );

  registerWriteTool(
    server,
    'invariance_review_claim',
    'Claim a pending review for the calling agent — sets status to "claimed" so other agents do not pick it up. Pair with invariance_review_resolve when done, or invariance_review_unclaim to release.',
    {
      id: z.string(),
      notes: z.string().optional().describe('Optional note explaining why or under what context the review is being claimed.'),
    },
    async ({ id, notes }) => {
      const body: Record<string, unknown> = { status: 'claimed' };
      if (notes !== undefined) body.notes = notes;
      const res = await client.patch<{ review: unknown }>(
        `/v1/reviews/${encodeURIComponent(id)}`,
        body,
      );
      return jsonResult(res.review);
    },
  );

  registerWriteTool(
    server,
    'invariance_review_unclaim',
    'Release a previously-claimed review back to "pending" so another agent can pick it up. Does not record a decision — use invariance_review_resolve for that.',
    {
      id: z.string(),
      notes: z.string().optional().describe('Optional note explaining why the review is being released.'),
    },
    async ({ id, notes }) => {
      const body: Record<string, unknown> = { status: 'pending' };
      if (notes !== undefined) body.notes = notes;
      const res = await client.patch<{ review: unknown }>(
        `/v1/reviews/${encodeURIComponent(id)}`,
        body,
      );
      return jsonResult(res.review);
    },
  );

  registerWriteTool(
    server,
    'invariance_review_resolve',
    'Close a review by recording a decision: "passed" (looks good, no action), "failed" (issue confirmed, should not ship), or "needs_fix" (issue confirmed, fix-and-retry).',
    {
      id: z.string(),
      decision: decisionEnum.describe('Outcome: passed | failed | needs_fix'),
      notes: z.string().optional().describe('Optional rationale for the decision.'),
    },
    async ({ id, decision, notes }) => {
      const body: Record<string, unknown> = { decision };
      if (notes !== undefined) body.notes = notes;
      return jsonResult(
        await client.patch(`/v1/reviews/${encodeURIComponent(id)}`, body),
      );
    },
  );
}
