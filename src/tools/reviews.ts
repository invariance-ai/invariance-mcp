import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { InvarianceClient } from '../lib/client.js';
import { jsonResult } from '../lib/util.js';

const decisionEnum = z.enum(['passed', 'failed', 'needs_fix']);

export function registerReviewTools(server: McpServer, client: InvarianceClient): void {
  server.tool(
    'invariance_review_list',
    'List reviews',
    { cursor: z.string().optional(), limit: z.number().int().positive().max(200).optional() },
    async ({ cursor, limit }) =>
      jsonResult(await client.get('/v1/reviews', { cursor, limit })),
  );

  server.tool(
    'invariance_review_get',
    'Get a review by ID',
    { id: z.string() },
    async ({ id }) => {
      const res = await client.get<{ review: unknown }>(
        `/v1/reviews/${encodeURIComponent(id)}`,
      );
      return jsonResult(res.review);
    },
  );

  server.tool(
    'invariance_review_claim',
    'Claim a review for the calling agent',
    { id: z.string(), notes: z.string().optional() },
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

  server.tool(
    'invariance_review_unclaim',
    'Release a claim on a review',
    { id: z.string(), notes: z.string().optional() },
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

  server.tool(
    'invariance_review_resolve',
    'Resolve a review with a decision',
    { id: z.string(), decision: decisionEnum, notes: z.string().optional() },
    async ({ id, decision, notes }) => {
      const body: Record<string, unknown> = { decision };
      if (notes !== undefined) body.notes = notes;
      return jsonResult(
        await client.patch(`/v1/reviews/${encodeURIComponent(id)}`, body),
      );
    },
  );
}
