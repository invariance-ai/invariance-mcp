import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { InvarianceClient } from '../lib/client.js';
import { jsonResult, parseJsonArg, registerReadTool, registerWriteTool } from '../lib/util.js';

// Captures are standalone evidence — raw sessions, conversations, or interaction
// traces that exist independently of any run. Capture first, link to a run later
// (or never). Use run_id on create/update to associate upfront, or
// invariance_capture_link to attach after the fact.

export function registerCaptureTools(server: McpServer, client: InvarianceClient): void {
  registerWriteTool(
    server,
    'invariance_capture_create',
    'Create a Capture — a standalone evidence record (session, conversation, trace). Captures don\'t need an execution upfront; link a capture to a run later with invariance_capture_link. Returns the capture session.',
    {
      source: z
        .string()
        .describe('Origin of the capture, e.g. "claude_code", "api", "browser", "zapier".'),
      session_type: z
        .string()
        .optional()
        .describe('Type classification for the session, e.g. "chat", "tool_use", "workflow".'),
      capture_type: z
        .string()
        .optional()
        .describe('Alias for session_type — use either; session_type takes precedence.'),
      title: z.string().optional().describe('Human-readable title shown in dashboards.'),
      external_session_id: z
        .string()
        .optional()
        .describe('Your system\'s session identifier for deduplication and cross-referencing.'),
      model: z.string().optional().describe('Model name used in the session, e.g. "claude-opus-4-7".'),
      run_id: z
        .string()
        .optional()
        .describe('Link this capture to an existing run at creation time. Can also be linked later with invariance_capture_link.'),
      metadata: z
        .string()
        .optional()
        .describe('Free-form metadata as a JSON object string. Example: {"user_id":"u_42","environment":"prod"}'),
      tags: z
        .array(z.string())
        .optional()
        .describe('Free-form labels for filtering and evidence-graph rollups, e.g. ["meeting","q3"]. Normalized (trimmed/lowercased/deduped) server-side.'),
    },
    async ({ source, session_type, capture_type, title, external_session_id, model, run_id, metadata, tags }) => {
      const body: Record<string, unknown> = { source };
      const stype = session_type ?? capture_type;
      if (stype !== undefined) body.session_type = stype;
      if (title !== undefined) body.title = title;
      if (external_session_id !== undefined) body.external_session_id = external_session_id;
      if (model !== undefined) body.model = model;
      if (run_id !== undefined) body.run_id = run_id;
      const meta = parseJsonArg('metadata', metadata);
      if (meta !== undefined) body.metadata = meta;
      if (tags !== undefined) body.tags = tags;
      const res = await client.post<{ session: unknown }>('/v1/captures', body);
      return jsonResult(res.session);
    },
  );

  registerReadTool(
    server,
    'invariance_capture_list',
    'List captures (paginated). Captures are standalone evidence; they don\'t need an execution upfront. Filter by project_id, operator_id, session_type, source, run_id, or tags.',
    {
      project_id: z.string().optional(),
      operator_id: z.string().optional(),
      session_type: z.string().optional(),
      source: z.string().optional(),
      run_id: z.string().optional(),
      tags: z.string().optional().describe('Comma-separated tags; matches captures containing ALL of them, e.g. "meeting,q3".'),
      cursor: z.string().optional().describe('Opaque pagination token from previous response next_cursor; pass through unchanged.'),
      limit: z.number().int().positive().max(200).optional(),
    },
    async (args) => jsonResult(await client.get('/v1/captures', args)),
  );

  registerReadTool(
    server,
    'invariance_capture_get',
    'Get a capture by id. Captures are standalone evidence; they don\'t need an execution upfront; link a capture to a run later with invariance_capture_link.',
    { id: z.string().describe('Capture id, e.g. "cap_abc123".') },
    async ({ id }) => {
      const res = await client.get<{ session: unknown }>(`/v1/captures/${encodeURIComponent(id)}`);
      return jsonResult(res.session);
    },
  );

  registerWriteTool(
    server,
    'invariance_capture_update',
    'Update a capture: change status, reassign run_id, or merge metadata. Captures are standalone evidence; they don\'t need an execution upfront; link a capture to a run later with invariance_capture_link.',
    {
      id: z.string().describe('Capture id, e.g. "cap_abc123".'),
      status: z.string().optional().describe('New status for the capture, e.g. "open", "closed".'),
      run_id: z.string().nullable().optional().describe('Run to link this capture to; pass null to unlink.'),
      metadata: z.string().optional().describe('JSON object string; shallow-merged with existing metadata.'),
      tags: z.array(z.string()).optional().describe('Replaces the tag set. Normalized server-side. Pass [] to clear.'),
    },
    async ({ id, status, run_id, metadata, tags }) => {
      const body: Record<string, unknown> = {};
      if (status !== undefined) body.status = status;
      if (run_id !== undefined) body.run_id = run_id;
      const meta = parseJsonArg('metadata', metadata);
      if (meta !== undefined) body.metadata = meta;
      if (tags !== undefined) body.tags = tags;
      const res = await client.patch<{ session: unknown }>(
        `/v1/captures/${encodeURIComponent(id)}`,
        body,
      );
      return jsonResult(res.session);
    },
  );

  registerWriteTool(
    server,
    'invariance_capture_link',
    'Link a capture to an evidence-graph target (run/case/workflow_event/node). With only run_id this sets the capture\'s run_id (legacy, equivalent to invariance_capture_update). With target_id it creates a richer capture link; target_type defaults to "run". Captures are standalone evidence and don\'t need an execution upfront.',
    {
      id: z.string().describe('Capture id, e.g. "cap_abc123".'),
      run_id: z.string().optional().describe('Legacy: link to a run by setting run_id (PATCH).'),
      target_type: z
        .enum(['run', 'case', 'workflow_event', 'node'])
        .optional()
        .describe('Kind of target to link to. Defaults to "run".'),
      target_id: z.string().optional().describe('Id of the target to link; creates a capture link.'),
      link_type: z
        .enum(['evidence', 'source', 'derived_from', 'mentions', 'related'])
        .optional()
        .describe('Relationship the link expresses. Defaults to "evidence" server-side.'),
    },
    async ({ id, run_id, target_type, target_id, link_type }) => {
      if (target_id !== undefined) {
        const body: Record<string, unknown> = { target_type: target_type ?? 'run', target_id };
        if (link_type !== undefined) body.link_type = link_type;
        const res = await client.post<{ link: unknown }>(
          `/v1/captures/${encodeURIComponent(id)}/links`,
          body,
        );
        return jsonResult(res.link);
      }
      if (run_id === undefined) {
        throw new Error('Provide either run_id (legacy) or target_id.');
      }
      const res = await client.patch<{ session: unknown }>(
        `/v1/captures/${encodeURIComponent(id)}`,
        { run_id },
      );
      return jsonResult(res.session);
    },
  );

  registerReadTool(
    server,
    'invariance_capture_links',
    'List every evidence link on a capture (case/run/workflow_event/node), returning { links }. Captures are standalone evidence; link a capture to a target with invariance_capture_link.',
    { id: z.string().describe('Capture id, e.g. "cap_abc123".') },
    async ({ id }) => {
      const res = await client.get<{ links: unknown[] }>(
        `/v1/captures/${encodeURIComponent(id)}/links`,
      );
      return jsonResult({ links: res.links ?? [] });
    },
  );

  registerWriteTool(
    server,
    'invariance_capture_unlink',
    'Detach a capture link. With link_id, deletes that specific evidence link. Without link_id, clears the capture\'s run_id (legacy). Captures are standalone evidence; they don\'t need an execution upfront.',
    {
      id: z.string().describe('Capture id, e.g. "cap_abc123".'),
      link_id: z.string().optional().describe('Specific capture link id to detach. Omit to clear run_id (legacy).'),
    },
    async ({ id, link_id }) => {
      if (link_id !== undefined) {
        await client.delete(`/v1/captures/${encodeURIComponent(id)}/links/${encodeURIComponent(link_id)}`);
        return jsonResult({ id, detached: link_id });
      }
      const res = await client.patch<{ session: unknown }>(
        `/v1/captures/${encodeURIComponent(id)}`,
        { run_id: null },
      );
      return jsonResult(res.session);
    },
  );
}
