import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { InvarianceClient } from '../lib/client.js';
import { jsonResult, parseJsonArg } from '../lib/util.js';

const sessionSource = z
  .enum(['screen_recording', 'microphone', 'meeting', 'granola_note', 'manual_note', 'api'])
  .describe(
    'What kind of activity stream this session represents. Use:\n' +
      '- "api" for autonomous agent work, including a single Claude Code task / sub-agent invocation (one Claude Code session = one agent-session with source="api").\n' +
      '- "screen_recording" when capturing a human teammate\'s screen for the company brain.\n' +
      '- "microphone" when capturing raw mic audio (e.g. a teammate thinking out loud at their desk).\n' +
      '- "meeting" for a Zoom/Meet/in-person meeting with multiple participants.\n' +
      '- "granola_note" when ingesting a Granola meeting note.\n' +
      '- "manual_note" when a human or agent is jotting freeform notes into the brain.',
  );

export function registerSessionTools(server: McpServer, client: InvarianceClient): void {
  server.tool(
    'invariance_session_create',
    "Open a new agent-session — the canonical container for an operator's bounded chunk of work in the company brain. CALL THIS at the START of: a new Claude Code task (source='api'), a screen recording for a teammate (source='screen_recording'), a mic capture session (source='microphone'), a meeting (source='meeting'), ingestion of a Granola note (source='granola_note'), or a manual note-taking session (source='manual_note'). Events (transcript chunks, tool calls, screenshots, notes) are appended to this session via invariance_session_append_note or the events sub-route. Link a session to a run via agent_id+run_id (or call invariance_session_attach_run later).",
    {
      source: sessionSource,
      external_session_id: z
        .string()
        .describe(
          'Stable client-supplied ID for dedup (e.g. the Claude Code conversation ID, the meeting calendar event ID, the Granola note ID, the screen-recording file UUID). Reusing the same external_session_id for the same source returns the existing session.',
        ),
      session_type: z
        .string()
        .optional()
        .describe('Optional finer-grained label, e.g. "claude_code", "standup", "1on1", "design_review".'),
      title: z.string().optional().describe('Human-readable title for the session.'),
      agent_id: z
        .string()
        .optional()
        .describe('Optional agent ID to associate with the session (for source="api" Claude Code work, this is the agent running the task).'),
      run_id: z.string().optional().describe('Optional run ID to attach at creation time.'),
      metadata: z
        .string()
        .optional()
        .describe('Optional metadata as a JSON object string. Example: {"participants":["alice@x.com"],"app":"granola"}'),
    },
    async ({ source, external_session_id, session_type, title, agent_id, run_id, metadata }) => {
      const body: Record<string, unknown> = { source, external_session_id };
      if (session_type !== undefined) body.session_type = session_type;
      if (title !== undefined) body.title = title;
      if (agent_id !== undefined) body.agent_id = agent_id;
      if (run_id !== undefined) body.run_id = run_id;
      const m = parseJsonArg('metadata', metadata);
      if (m !== undefined) body.metadata = m;
      const res = await client.post<{ session: unknown }>('/v1/agent-sessions', body);
      return jsonResult(res.session);
    },
  );

  server.tool(
    'invariance_session_list',
    'List agent-sessions, optionally filtered by source, agent, run, or status. Use this to find all Claude Code work for an agent (source="api"), all meetings ingested today (source="meeting"), or all screen recordings for a human teammate.',
    {
      source: sessionSource.optional(),
      agent_id: z.string().optional(),
      run_id: z.string().optional(),
      status: z
        .string()
        .optional()
        .describe('Filter by session status (e.g. "open", "closed").'),
    },
    async ({ source, agent_id, run_id, status }) =>
      jsonResult(
        await client.get('/v1/agent-sessions', { source, agent_id, run_id, status }),
      ),
  );

  server.tool(
    'invariance_session_get',
    'Fetch a single agent-session by ID, including its source, timestamps, attached run/agent, and metadata.',
    { id: z.string().describe('Session ID.') },
    async ({ id }) => {
      const res = await client.get<{ session: unknown }>(
        `/v1/agent-sessions/${encodeURIComponent(id)}`,
      );
      return jsonResult(res.session);
    },
  );

  server.tool(
    'invariance_session_append_note',
    "Append a freeform text note to an existing session as a custom event with payload {text}. USE THIS WHEN: jotting a thought during a Claude Code task (\"trying approach X next\"), capturing a meeting takeaway, annotating a screen recording, or recording a partial transcript chunk from microphone capture. The note becomes part of the company brain timeline for that session.",
    {
      session_id: z.string().describe('Target agent-session ID.'),
      text: z.string().describe('Note text. Plain text or markdown.'),
    },
    async ({ session_id, text }) => {
      const body = { type: 'note', payload: { text } };
      const res = await client.post<{ event: unknown }>(
        `/v1/agent-sessions/${encodeURIComponent(session_id)}/events`,
        body,
      );
      return jsonResult(res.event);
    },
  );

  server.tool(
    'invariance_session_attach_run',
    'Attach an existing run to an existing agent-session (PATCH). USE THIS when a Claude Code task that started a session later starts producing a run — call this to link the run\'s graph back to the session timeline so the brain can correlate transcript/notes with operational nodes.',
    {
      session_id: z.string().describe('Agent-session ID to update.'),
      run_id: z.string().describe('Run ID to attach.'),
    },
    async ({ session_id, run_id }) => {
      const res = await client.patch<{ session: unknown }>(
        `/v1/agent-sessions/${encodeURIComponent(session_id)}`,
        { run_id },
      );
      return jsonResult(res.session);
    },
  );

  server.tool(
    'invariance_session_record_summary_to_kb',
    "Persist a summary of an agent-session as a knowledge-base page (so it becomes searchable, durable company brain content beyond the raw session timeline). USE THIS at the END of a Claude Code task, after a meeting wraps, or once a screen-recording has been reviewed — to capture the takeaways. The KB page is created under path 'sessions/<session_id>' by default.",
    {
      session_id: z.string().describe('Agent-session this summary describes.'),
      title: z.string().describe('Title for the KB page.'),
      body: z.string().describe('Markdown body of the summary.'),
      summary: z.string().optional().describe('Optional one-line summary.'),
      path: z
        .string()
        .optional()
        .describe('Optional KB path/slug. Defaults to "sessions/<session_id>".'),
    },
    async ({ session_id, title, body, summary, path }) => {
      const payload: Record<string, unknown> = {
        path: path ?? `sessions/${session_id}`,
        title,
        body,
        kind: 'session_summary',
        metadata: { session_id },
      };
      if (summary !== undefined) payload.summary = summary;
      const res = await client.post<{ page: unknown }>('/v1/kb/pages', payload);
      return jsonResult(res.page);
    },
  );
}
