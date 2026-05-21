import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { InvarianceClient } from '../lib/client.js';
import { jsonResult, registerReadTool, registerWriteTool } from '../lib/util.js';

export function registerDnaTools(server: McpServer, client: InvarianceClient): void {
  registerReadTool(
    server,
    'invariance_dna_list_edge_candidates',
    'List Company DNA edge candidates — discovered relationships between objects awaiting review. Filter by status (proposed/accepted/rejected/expired/promoted), object_id, or relation_kind. Output: {data: DnaEdgeCandidate[], next_cursor}.',
    {
      project_id: z.string().optional(),
      object_id: z.string().optional().describe('Filter to candidates touching this object.'),
      relation_kind: z.string().optional(),
      status: z
        .enum(['proposed', 'accepted', 'rejected', 'expired', 'promoted'])
        .optional(),
      cursor: z.string().optional().describe('Opaque pagination token from a previous next_cursor.'),
      limit: z.number().int().positive().max(200).optional(),
    },
    async ({ project_id, object_id, relation_kind, status, cursor, limit }) =>
      jsonResult(
        await client.get('/v1/dna/edge-candidates', {
          project_id,
          object_id,
          relation_kind,
          status,
          cursor,
          limit,
        }),
      ),
  );

  registerWriteTool(
    server,
    'invariance_dna_accept_edge_candidate',
    'Accept a proposed DNA edge candidate, making it eligible for promotion into a durable semantic link.',
    { id: z.string().describe('Edge candidate ID.') },
    async ({ id }) => {
      const res = await client.post<{ candidate: unknown }>(
        `/v1/dna/edge-candidates/${encodeURIComponent(id)}/accept`,
      );
      return jsonResult(res.candidate);
    },
  );

  registerWriteTool(
    server,
    'invariance_dna_reject_edge_candidate',
    'Reject a DNA edge candidate so it is never promoted.',
    { id: z.string().describe('Edge candidate ID.') },
    async ({ id }) => {
      const res = await client.post<{ candidate: unknown }>(
        `/v1/dna/edge-candidates/${encodeURIComponent(id)}/reject`,
      );
      return jsonResult(res.candidate);
    },
  );

  registerWriteTool(
    server,
    'invariance_dna_promote_edge_candidate',
    'Promote an accepted DNA edge candidate into a durable semantic link. The candidate must be accepted, carry a semantic_similarity signal, and have at least two evidence chunks (otherwise the API returns 422). Idempotent: re-promoting returns the existing link with already_promoted=true. Set dry_run=true to preview the would-be link without writing.',
    {
      id: z.string().describe('Edge candidate ID.'),
      dry_run: z
        .boolean()
        .optional()
        .describe('Preview only — run the gates and return the would-be link without persisting.'),
    },
    async ({ id, dry_run }) =>
      jsonResult(
        await client.post(`/v1/dna/edge-candidates/${encodeURIComponent(id)}/promote`, {
          dry_run: dry_run === true,
        }),
      ),
  );
}
