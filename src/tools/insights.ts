import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { InvarianceClient } from '../lib/client.js';
import { jsonResult, parseJsonArg, registerDestructiveTool, registerReadTool, registerWriteTool } from '../lib/util.js';

const kbPageKind = z.enum(['wiki', 'run', 'note']);
const kbMessageRole = z.enum(['user', 'assistant', 'tool']);

export function registerInsightTools(server: McpServer, client: InvarianceClient): void {
  registerReadTool(
    server,
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

  registerReadTool(
    server,
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

  registerReadTool(
    server,
    'invariance_kb_pages_list',
    'List knowledge-base pages',
    {
      kind: kbPageKind.optional(),
      search: z.string().optional(),
      cursor: z.string().optional().describe('Opaque cursor from a previous response'),
      limit: z.number().int().positive().max(200).optional(),
    },
    async ({ kind, search, cursor, limit }) =>
      jsonResult(await client.get('/v1/kb/pages', { kind, search, cursor, limit })),
  );

  registerReadTool(
    server,
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

  registerWriteTool(
    server,
    'invariance_kb_page_create',
    'Create a knowledge-base page',
    {
      path: z.string().describe('Unique slug/path for the page within the agent KB'),
      title: z.string(),
      body: z.string().describe('Markdown body of the page'),
      summary: z.string().optional(),
      kind: kbPageKind.optional(),
    },
    async ({ path, title, body, summary, kind }) => {
      const payload: Record<string, unknown> = { path, title, body };
      if (summary !== undefined) payload.summary = summary;
      if (kind !== undefined) payload.kind = kind;
      const res = await client.post<{ page: unknown }>('/v1/kb/pages', payload);
      return jsonResult(res.page);
    },
  );

  registerWriteTool(
    server,
    'invariance_kb_page_update',
    'Update fields on a knowledge-base page',
    {
      id: z.string(),
      title: z.string().optional(),
      body: z.string().optional(),
      summary: z.string().optional(),
      kind: kbPageKind.optional(),
    },
    async ({ id, title, body, summary, kind }) => {
      const payload: Record<string, unknown> = {};
      if (title !== undefined) payload.title = title;
      if (body !== undefined) payload.body = body;
      if (summary !== undefined) payload.summary = summary;
      if (kind !== undefined) payload.kind = kind;
      const res = await client.patch<{ page: unknown }>(
        `/v1/kb/pages/${encodeURIComponent(id)}`,
        payload,
      );
      return jsonResult(res.page);
    },
  );

  registerDestructiveTool(
    server,
    'invariance_kb_page_delete',
    'Delete a knowledge-base page',
    { id: z.string() },
    async ({ id }) => {
      await client.delete(`/v1/kb/pages/${encodeURIComponent(id)}`);
      return jsonResult({ id, deleted: true });
    },
  );

  registerWriteTool(
    server,
    'invariance_kb_session_create',
    'Create a multi-turn ask session for the agent KB',
    {
      title: z.string().optional(),
      model: z.string().optional(),
    },
    async ({ title, model }) => {
      const payload: Record<string, unknown> = {};
      if (title !== undefined) payload.title = title;
      if (model !== undefined) payload.model = model;
      const res = await client.post<{ session: unknown }>('/v1/kb/sessions', payload);
      return jsonResult(res.session);
    },
  );

  registerDestructiveTool(
    server,
    'invariance_kb_session_delete',
    'Delete a KB ask session',
    { id: z.string() },
    async ({ id }) => {
      await client.delete(`/v1/kb/sessions/${encodeURIComponent(id)}`);
      return jsonResult({ id, deleted: true });
    },
  );

  registerReadTool(
    server,
    'invariance_kb_session_list_messages',
    'List all messages in a KB ask session in order',
    { id: z.string() },
    async ({ id }) => {
      const res = await client.get<{ messages: unknown }>(
        `/v1/kb/sessions/${encodeURIComponent(id)}/messages`,
      );
      return jsonResult(res.messages);
    },
  );

  registerWriteTool(
    server,
    'invariance_kb_session_append_message',
    'Append a message to a KB ask session',
    {
      id: z.string(),
      role: kbMessageRole.optional().describe('Defaults to user when omitted'),
      content: z
        .string()
        .describe(
          'Plain text, OR a JSON-encoded array of content blocks ({type:"text"|"tool_use"|"tool_result", ...})',
        ),
    },
    async ({ id, role, content }) => {
      let parsedContent: unknown = content;
      const trimmed = content.trimStart();
      if (trimmed.startsWith('[')) {
        parsedContent = parseJsonArg('content', content);
      }
      const payload: Record<string, unknown> = { content: parsedContent };
      if (role !== undefined) payload.role = role;
      const res = await client.post<{ message: unknown }>(
        `/v1/kb/sessions/${encodeURIComponent(id)}/messages`,
        payload,
      );
      return jsonResult(res.message);
    },
  );
}
