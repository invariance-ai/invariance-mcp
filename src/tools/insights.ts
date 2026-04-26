import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { InvarianceClient } from '../lib/client.js';
import { jsonResult } from '../lib/util.js';

export function registerInsightTools(server: McpServer, client: InvarianceClient): void {
  server.tool(
    'invariance_narrative_get',
    'Fetch (or regenerate) the LLM-synthesized narrative for a run',
    {
      run_id: z.string(),
      refresh: z.boolean().optional().describe('Force regeneration of the narrative'),
    },
    async ({ run_id, refresh }) => {
      const res = await client.get<{ narrative: unknown }>(
        `/v1/runs/${encodeURIComponent(run_id)}/narrative`,
        { refresh: refresh ? 'true' : undefined },
      );
      return jsonResult(res.narrative);
    },
  );

  server.tool(
    'invariance_ask',
    "Ask a question against the agent's runs / knowledge base (turn-based session)",
    {
      message: z.string(),
      session_id: z.string().optional(),
      model: z.string().optional(),
      max_turns: z.number().int().positive().max(20).optional(),
    },
    async ({ message, session_id, model, max_turns }) => {
      const body: Record<string, unknown> = { message };
      if (session_id !== undefined) body.session_id = session_id;
      if (model !== undefined) body.model = model;
      if (max_turns !== undefined) body.max_turns = max_turns;
      return jsonResult(await client.post('/v1/ask', body));
    },
  );

  server.tool(
    'invariance_kb_pages_list',
    'List knowledge-base pages',
    {
      kind: z.enum(['wiki', 'run', 'note']).optional(),
      search: z.string().optional(),
      cursor: z.string().optional(),
      limit: z.number().int().positive().max(200).optional(),
    },
    async ({ kind, search, cursor, limit }) =>
      jsonResult(await client.get('/v1/kb/pages', { kind, search, cursor, limit })),
  );

  server.tool(
    'invariance_kb_page_get',
    'Get a knowledge-base page by ID',
    { id: z.string() },
    async ({ id }) => {
      const res = await client.get<{ page: unknown }>(
        `/v1/kb/pages/${encodeURIComponent(id)}`,
      );
      return jsonResult(res.page);
    },
  );
}
