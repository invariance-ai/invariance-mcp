import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createServer } from '../server.js';

const API_URL = 'https://api.test';

type Recorded = { method: string; path: string; body: unknown; headers: Headers };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function runFixture(id = 'run_1') {
  return {
    id,
    agent_id: 'agent_1',
    name: 'demo',
    status: 'open',
    metadata: {},
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    closed_at: null,
  };
}

function nodeFixture(id = 'node_1') {
  return {
    id,
    run_id: 'run_1',
    agent_id: 'agent_1',
    parent_id: null,
    action_type: 'tool_call',
    type: null,
    input: null,
    output: null,
    error: null,
    metadata: {},
    custom_fields: {},
    timestamp: 1,
    duration_ms: null,
    hash: 'hash_1',
    previous_hashes: [],
    signature: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

function captureFixture(id = 'cap_1') {
  return {
    id,
    source: 'api',
    session_type: null,
    title: null,
    external_session_id: null,
    model: null,
    run_id: null,
    metadata: {},
    status: 'open',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

function contentText(result: Awaited<ReturnType<Client['callTool']>>): string {
  const content =
    'content' in result && Array.isArray(result.content)
      ? (result.content as Array<{ type?: unknown; text?: unknown }>)
      : [];
  const part = content[0];
  if (!part || part.type !== 'text' || typeof part.text !== 'string') {
    throw new Error('Expected text content');
  }
  return part.text;
}

function contentJson(result: Awaited<ReturnType<Client['callTool']>>): unknown {
  return JSON.parse(contentText(result));
}

let client: Client;
let server: McpServer;
let requests: Recorded[];
let originalEnv: typeof process.env;

beforeEach(async () => {
  originalEnv = { ...process.env };
  process.env.INVARIANCE_API_KEY = 'inv_test_key';
  process.env.INVARIANCE_API_URL = API_URL;
  delete process.env.INVARIANCE_BASE_URL;
  delete process.env.INVARIANCE_MCP_TRANSPORT;
  requests = [];

  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    requests.push({
      method,
      path: `${url.pathname}${url.search}`,
      body,
      headers: new Headers(init?.headers),
    });

    if (method === 'POST' && url.pathname === '/v1/runs') {
      return json({ run: { ...runFixture(), name: body?.name ?? 'demo' } }, 201);
    }
    if (method === 'GET' && url.pathname === '/v1/runs') {
      return json({ data: [runFixture()], next_cursor: null });
    }
    if (method === 'GET' && url.pathname === '/v1/runs/run_1') {
      return json({ run: runFixture() });
    }
    if (method === 'PATCH' && url.pathname === '/v1/runs/run_1') {
      return json({ run: { ...runFixture(), status: body?.status ?? 'open' } });
    }
    if (method === 'GET' && url.pathname === '/v1/runs/run_1/verify') {
      return json({
        run_id: 'run_1',
        valid: true,
        node_count: 1,
        head_hash: 'hash_1',
        first_invalid_node_id: null,
        reason: null,
      });
    }
    if (method === 'GET' && url.pathname === '/v1/runs/run_1/nodes') {
      return json({ data: [nodeFixture()], next_cursor: null });
    }
    if (method === 'GET' && url.pathname === '/v1/runs/run_1/operational-graph') {
      return json({
        run_id: 'run_1',
        nodes: [{ id: 'node_1' }],
        edges: [],
        root_node_ids: ['node_1'],
      });
    }
    if (method === 'GET' && url.pathname === '/v1/runs/run_1/llm-calls') {
      return json({
        data: [{ id: 'llm_1', node_id: 'node_1', model: 'claude-opus-4-7' }],
        next_cursor: null,
      });
    }
    if (method === 'GET' && url.pathname === '/v1/runs/run_1/node-types') {
      return json({ data: [{ type: 'tool_call', count: 3 }] });
    }
    if (method === 'GET' && url.pathname === '/v1/runs/run_1/node-types/tool_call/metrics') {
      return json({ metrics: { type: 'tool_call', count: 3 } });
    }
    if (method === 'POST' && url.pathname === '/v1/runs/run_1/fork') {
      return json(
        {
          run: {
            ...runFixture('run_2'),
            metadata: { fork_from: body?.from_node_id, ...(body?.metadata ?? {}) },
            name: body?.name ?? 'demo',
          },
        },
        201,
      );
    }
    if (method === 'GET' && url.pathname.startsWith('/v1/metrics/overview')) {
      return json({ metrics: { runs: 1, nodes: 1, errors: 0, window_hours: 24 } });
    }
    if (method === 'GET' && url.pathname.startsWith('/v1/metrics/agents')) {
      return json({ usage: [{ agent_id: 'agent_1', runs: 1 }] });
    }
    if (method === 'GET' && url.pathname === '/v1/runs/run_1/metrics') {
      return json({ metrics: { llm_call_count: 1, tool_call_count: 0 } });
    }
    if (method === 'GET' && url.pathname === '/v1/runs/run_1/narrative') {
      return json({ narrative: { summary: 'all good', sections: [] } });
    }
    if (method === 'GET' && url.pathname.startsWith('/v1/findings')) {
      return json({
        data: [
          { id: 'find_1', run_id: 'run_1', status: 'open', title: 'spike' },
          { id: 'find_2', run_id: 'run_other', status: 'open', title: 'other' },
          { id: 'find_3', run_id: 'run_1', status: 'resolved', title: 'old' },
        ],
        next_cursor: null,
      });
    }
    if (method === 'POST' && url.pathname === '/v1/nodes') {
      return json({ data: [nodeFixture()] }, 201);
    }
    if (method === 'GET' && url.pathname === '/v1/workflow-definitions') {
      return json({
        data: [
          {
            key: 'support.escalation',
            agent_id: 'agent_1',
            display_name: 'Support Escalation',
            description: null,
            expected_fields: [],
            expected_steps: [],
            allowed_outcomes: [],
            custom_metrics: [],
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
          },
        ],
      });
    }
    if (method === 'POST' && url.pathname === '/v1/workflow-definitions') {
      return json(
        {
          definition: {
            key: body?.key,
            agent_id: 'agent_1',
            display_name: body?.display_name,
            description: body?.description ?? null,
            expected_fields: body?.expected_fields ?? [],
            expected_steps: body?.expected_steps ?? [],
            allowed_outcomes: body?.allowed_outcomes ?? [],
            custom_metrics: body?.custom_metrics ?? [],
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
          },
        },
        201,
      );
    }
    if (method === 'GET' && url.pathname === '/v1/workflow-definitions/support.escalation') {
      return json({
        definition: {
          key: 'support.escalation',
          agent_id: 'agent_1',
          display_name: 'Support Escalation',
          description: null,
          expected_fields: [],
          expected_steps: [],
          allowed_outcomes: [],
          custom_metrics: [],
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      });
    }
    if (method === 'PATCH' && url.pathname === '/v1/workflow-definitions/support.escalation') {
      return json({
        definition: {
          key: 'support.escalation',
          agent_id: 'agent_1',
          display_name: body?.display_name ?? 'Support Escalation',
          description: body?.description ?? null,
          expected_fields: body?.expected_fields ?? [],
          expected_steps: body?.expected_steps ?? [],
          allowed_outcomes: body?.allowed_outcomes ?? [],
          custom_metrics: body?.custom_metrics ?? [],
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      });
    }
    if (method === 'DELETE' && url.pathname === '/v1/workflow-definitions/support.escalation') {
      return json({ ok: true });
    }
    if (method === 'GET' && url.pathname === '/v1/events') {
      return json({
        data: [
          {
            id: 'wevt_1',
            case_id: 'case_1',
            type: 'support.customer.escalated',
            payload: {},
          },
        ],
        next_cursor: null,
      });
    }
    if (method === 'GET' && url.pathname === '/v1/cases/case_1/evidence') {
      return json({ case: { id: 'case_1' }, runs: [runFixture()], events: [] });
    }
    if (method === 'GET' && url.pathname === '/v1/cases/case_1/events') {
      return json({ data: [{ id: 'wevt_1', case_id: 'case_1', type: 'triage.started' }], next_cursor: null });
    }
    if (method === 'POST' && url.pathname === '/v1/cases/case_1/events') {
      return json({ event: { id: 'wevt_2', case_id: 'case_1', ...body } }, 201);
    }
    if (method === 'POST' && url.pathname === '/v1/signals') {
      return json(
        {
          signal: {
            id: 'sig_1',
            severity: body?.severity ?? 'medium',
            title: body?.title ?? '',
            data: body?.data ?? null,
            run_id: body?.run_id ?? null,
          },
        },
        201,
      );
    }
    if (method === 'GET' && url.pathname === '/v1/agents/me') {
      return json({
        agent: {
          id: 'agent_1',
          name: 'me',
          public_key: null,
          project_id: 'p1',
          created_at: '2026-01-01T00:00:00.000Z',
        },
      });
    }
    if (method === 'POST' && url.pathname === '/v1/agents') {
      return json(
        {
          agent: {
            id: 'agent_new',
            name: body?.name ?? 'untitled',
            public_key: body?.public_key ?? null,
            project_id: body?.project_id ?? 'p1',
            created_at: '2026-01-01T00:00:00.000Z',
          },
        },
        201,
      );
    }
    if (method === 'GET' && url.pathname === '/v1/agents') {
      return json({
        data: [
          {
            id: 'agent_1',
            name: 'me',
            public_key: null,
            project_id: 'p1',
            created_at: '2026-01-01T00:00:00.000Z',
          },
        ],
        next_cursor: null,
      });
    }
    if (method === 'GET' && url.pathname === '/v1/agents/agent_1') {
      return json({
        agent: {
          id: 'agent_1',
          name: 'me',
          public_key: null,
          project_id: 'p1',
          created_at: '2026-01-01T00:00:00.000Z',
        },
      });
    }
    if (method === 'GET' && url.pathname === '/v1/runs/missing') {
      return json({ error: { code: 'not_found', message: 'Run missing not found' } }, 404);
    }
    if (method === 'POST' && url.pathname === '/v1/kb/pages') {
      return json({ page: { id: 'page_1', ...body } }, 201);
    }
    if (method === 'PATCH' && url.pathname === '/v1/kb/pages/page_1') {
      return json({ page: { id: 'page_1', ...body } });
    }
    if (method === 'DELETE' && url.pathname === '/v1/kb/pages/page_1') {
      return new Response(null, { status: 204 });
    }
    if (method === 'POST' && url.pathname === '/v1/kb/sessions') {
      return json({ session: { id: 'sess_1', ...body } }, 201);
    }
    if (method === 'DELETE' && url.pathname === '/v1/kb/sessions/sess_1') {
      return new Response(null, { status: 204 });
    }
    if (method === 'GET' && url.pathname === '/v1/kb/sessions/sess_1/messages') {
      return json({ messages: [{ id: 'msg_1', role: 'user', content: 'hi' }] });
    }
    if (method === 'POST' && url.pathname === '/v1/kb/sessions/sess_1/messages') {
      return json({ message: { id: 'msg_2', ...body } }, 201);
    }
    if (method === 'GET' && url.pathname === '/v1/operators/me') {
      return json({
        operator: {
          id: 'op_1',
          name: 'me',
          operator_type: 'agent',
          project_id: 'p1',
        },
      });
    }
    if (method === 'POST' && url.pathname === '/v1/operators') {
      return json(
        {
          operator: {
            id: 'op_new',
            name: body?.name ?? 'untitled',
            operator_type: body?.operator_type ?? 'agent',
            project_id: body?.project_id ?? 'p1',
          },
        },
        201,
      );
    }
    if (method === 'GET' && url.pathname === '/v1/operators') {
      return json({
        data: [
          { id: 'op_1', name: 'me', operator_type: 'agent', project_id: 'p1' },
        ],
        next_cursor: null,
      });
    }
    if (method === 'GET' && url.pathname === '/v1/operators/op_1') {
      return json({
        operator: { id: 'op_1', name: 'me', operator_type: 'agent', project_id: 'p1' },
      });
    }
    if (method === 'POST' && url.pathname === '/v1/agent-sessions') {
      return json(
        {
          session: {
            id: 'sess_new',
            source: body?.source,
            external_session_id: body?.external_session_id,
            session_type: body?.session_type ?? null,
            title: body?.title ?? null,
            agent_id: body?.agent_id ?? null,
            run_id: body?.run_id ?? null,
            metadata: body?.metadata ?? null,
            status: 'open',
          },
        },
        201,
      );
    }
    if (method === 'GET' && url.pathname === '/v1/agent-sessions') {
      return json({
        data: [
          {
            id: 'sess_new',
            source: 'api',
            external_session_id: 'ext_1',
            agent_id: 'agent_1',
            run_id: null,
            status: 'open',
          },
        ],
        next_cursor: null,
      });
    }
    if (method === 'GET' && url.pathname === '/v1/agent-sessions/sess_new') {
      return json({
        session: {
          id: 'sess_new',
          source: 'api',
          external_session_id: 'ext_1',
          status: 'open',
        },
      });
    }
    if (method === 'POST' && url.pathname === '/v1/agent-sessions/sess_new/events') {
      return json(
        {
          event: {
            id: 'evt_1',
            session_id: 'sess_new',
            type: body?.type,
            payload: body?.payload,
          },
        },
        201,
      );
    }
    if (method === 'PATCH' && url.pathname === '/v1/agent-sessions/sess_new') {
      return json({
        session: {
          id: 'sess_new',
          source: 'api',
          run_id: body?.run_id ?? null,
          status: 'open',
        },
      });
    }
    if (method === 'POST' && url.pathname === '/v1/memory/read') {
      return json({
        access: {
          id: 'mem_acc_1',
          run_id: body?.run_id ?? 'run_1',
          node_id: body?.node_id ?? 'node_1',
          agent_id: 'agent_1',
          access_type: 'read',
          subject_type: body?.subject_type,
          subject_id: body?.subject_id,
          key: body?.key,
          value: 'email',
          used_for: body?.used_for,
          source_node_id: null,
          timestamp: '2026-05-07T12:00:00Z',
        },
        record: {
          id: 'mem_1',
          agent_id: 'agent_1',
          subject_type: body?.subject_type,
          subject_id: body?.subject_id,
          claim: body?.key,
          value: 'email',
          source: 'agent_write',
          confidence: 1.0,
          valid_from: '2026-05-07T12:00:00Z',
          valid_until: null,
          last_verified_at: null,
          superseded_by: null,
          provenance: [],
        },
      });
    }
    if (method === 'POST' && url.pathname === '/v1/captures') {
      return json(
        {
          session: {
            ...captureFixture(),
            source: body?.source ?? 'api',
            session_type: body?.session_type ?? null,
            title: body?.title ?? null,
            external_session_id: body?.external_session_id ?? null,
            model: body?.model ?? null,
            run_id: body?.run_id ?? null,
            metadata: body?.metadata ?? {},
          },
        },
        201,
      );
    }
    if (method === 'GET' && url.pathname === '/v1/captures') {
      return json({ data: [captureFixture()], next_cursor: null });
    }
    if (method === 'GET' && /^\/v1\/captures\/[^/]+$/.test(url.pathname)) {
      const capId = url.pathname.split('/').pop()!;
      return json({ session: { ...captureFixture(capId), run_id: null } });
    }
    if (method === 'PATCH' && /^\/v1\/captures\/[^/]+$/.test(url.pathname)) {
      const capId = url.pathname.split('/').pop()!;
      return json({
        session: {
          ...captureFixture(capId),
          run_id: body?.run_id !== undefined ? body.run_id : null,
          status: body?.status ?? 'open',
        },
      });
    }
    if (method === 'POST' && url.pathname === '/v1/memory/write') {
      return json({
        access: {
          id: 'mem_acc_2',
          run_id: body?.run_id ?? null,
          node_id: body?.node_id ?? null,
          agent_id: 'agent_1',
          access_type: 'write',
          subject_type: body?.subject_type,
          subject_id: body?.subject_id,
          key: body?.key,
          value: body?.value,
          used_for: body?.used_for,
          source_node_id: null,
          timestamp: '2026-05-07T12:00:00Z',
        },
        record: {
          id: 'mem_2',
          agent_id: 'agent_1',
          subject_type: body?.subject_type,
          subject_id: body?.subject_id,
          claim: body?.key,
          value: body?.value,
          source: body?.source,
          confidence: body?.confidence,
          valid_from: '2026-05-07T12:00:00Z',
          valid_until: body?.valid_until ?? null,
          last_verified_at: null,
          superseded_by: null,
          provenance: body?.provenance ?? [],
        },
      });
    }

    return json(
      { error: { code: 'not_found', message: `${method} ${url.pathname}` } },
      404,
    );
  });

  server = createServer();
  client = new Client({ name: 'mcp-test', version: '0.0.0' });
  const [c, s] = InMemoryTransport.createLinkedPair();
  await server.connect(s);
  await client.connect(c);
});

afterEach(async () => {
  await client.close();
  await server.close();
  process.env = originalEnv;
  vi.restoreAllMocks();
});

describe('Invariance MCP server', () => {
  it('registers every modern tool plus the legacy aliases', async () => {
    const result = await client.listTools();
    const names = new Set(result.tools.map((t) => t.name));

    for (const expected of [
      'invariance_run_start', 'invariance_run_get', 'invariance_run_list',
      'invariance_run_finish', 'invariance_run_fail', 'invariance_run_verify',
      'invariance_run_metrics',
      'invariance_node_write', 'invariance_node_list',
      'invariance_monitor_create', 'invariance_monitor_list', 'invariance_monitor_get',
      'invariance_monitor_update', 'invariance_monitor_pause', 'invariance_monitor_resume',
      'invariance_monitor_evaluate', 'invariance_monitor_executions', 'invariance_monitor_findings',
      'invariance_signal_emit', 'invariance_signal_list', 'invariance_signal_get',
      'invariance_signal_acknowledge', 'invariance_signal_resolve',
      'invariance_finding_list', 'invariance_finding_get', 'invariance_finding_update',
      'invariance_review_list', 'invariance_review_get', 'invariance_review_claim',
      'invariance_review_unclaim', 'invariance_review_resolve',
      'invariance_agent_me', 'invariance_agent_set_key',
      'invariance_agent_create', 'invariance_agent_list', 'invariance_agent_get',
      'invariance_narrative_get', 'invariance_ask',
      'invariance_run_operational_graph', 'invariance_run_llm_calls',
      'invariance_run_node_types', 'invariance_run_node_type_metrics',
      'invariance_run_fork', 'invariance_metrics_overview',
      'invariance_metrics_agents', 'invariance_run_inspect',
      'invariance_kb_pages_list', 'invariance_kb_page_get',
      'invariance_kb_page_create', 'invariance_kb_page_update', 'invariance_kb_page_delete',
      'invariance_kb_session_create', 'invariance_kb_session_delete',
      'invariance_kb_session_list_messages', 'invariance_kb_session_append_message',
      'invariance_memory_read', 'invariance_memory_write',
      'invariance_operator_me', 'invariance_operator_create',
      'invariance_operator_list', 'invariance_operator_get',
      'invariance_session_create', 'invariance_session_list',
      'invariance_session_get', 'invariance_session_append_note',
      'invariance_session_attach_run', 'invariance_session_record_summary_to_kb',
      'invariance_case_create', 'invariance_case_get', 'invariance_case_list',
      'invariance_case_update', 'invariance_case_close', 'invariance_case_evidence',
      'invariance_case_events_list', 'invariance_case_event_create',
      'invariance_workflow_list', 'invariance_workflow_get', 'invariance_workflow_create',
      'invariance_workflow_update', 'invariance_workflow_delete',
      'invariance_workflow_event_list',
      'invariance_capture_create', 'invariance_capture_list',
      'invariance_capture_get', 'invariance_capture_update',
      'invariance_capture_link', 'invariance_capture_links', 'invariance_capture_unlink',
      'invariance_capture_link_add', 'invariance_capture_link_list', 'invariance_capture_link_remove',
      'invariance_doctor',
      'cortex_run_job', 'cortex_run_eval', 'cortex_run_counterfactual',
      'cortex_get_job', 'cortex_get_result',
    ]) {
      expect(names.has(expected), `missing tool ${expected}`).toBe(true);
    }

    // Every modern tool must carry annotations so agent clients can distinguish
    // read-only from state-changing tools without reading prose descriptions.
    for (const tool of result.tools) {
      if (tool.name.startsWith('invariance_create_') || tool.name.startsWith('invariance_get_') ||
          tool.name.startsWith('invariance_list_') || tool.name.startsWith('invariance_write_') ||
          tool.name === 'invariance_verify_run') {
        continue; // legacy aliases — skip
      }
      expect(tool.annotations, `tool ${tool.name} missing annotations`).toBeDefined();
      expect(tool.annotations?.openWorldHint, `tool ${tool.name} missing openWorldHint`).toBe(true);
      expect(typeof tool.annotations?.readOnlyHint, `tool ${tool.name} missing readOnlyHint`).toBe('boolean');
    }

    for (const legacy of [
      'invariance_create_run', 'invariance_get_run', 'invariance_list_runs',
      'invariance_write_node', 'invariance_list_nodes', 'invariance_verify_run',
    ]) {
      expect(names.has(legacy), `missing legacy alias ${legacy}`).toBe(true);
    }
  });

  it('starts a run via the modern tool name', async () => {
    const result = contentJson(
      await client.callTool({
        name: 'invariance_run_start',
        arguments: { name: 'demo' },
      }),
    ) as { id: string; name: string };
    expect(result.id).toBe('run_1');
    expect(result.name).toBe('demo');
    expect(requests[0]).toMatchObject({
      method: 'POST',
      path: '/v1/runs',
      body: { name: 'demo' },
    });
  });

  it('writes a node, parsing JSON-string args', async () => {
    const result = contentJson(
      await client.callTool({
        name: 'invariance_node_write',
        arguments: {
          run_id: 'run_1',
          action_type: 'tool_call',
          input: '{"prompt":"ship"}',
          output: '{"result":"ok"}',
        },
      }),
    ) as { id: string; hash: string };
    expect(result).toMatchObject({ id: 'node_1', hash: 'hash_1' });
    const call = requests.find((r) => r.path === '/v1/nodes');
    expect(call?.body).toEqual([{
      run_id: 'run_1',
      action_type: 'tool_call',
      input: { prompt: 'ship' },
      output: { result: 'ok' },
    }]);
  });

  it('emits a signal', async () => {
    const result = contentJson(
      await client.callTool({
        name: 'invariance_signal_emit',
        arguments: {
          severity: 'high',
          title: 'spike',
          data: '{"p99_ms":2400}',
          run_id: 'run_1',
        },
      }),
    ) as Record<string, unknown>;
    expect(result).toMatchObject({ id: 'sig_1', severity: 'high', title: 'spike' });
    const call = requests.find((r) => r.method === 'POST' && r.path === '/v1/signals');
    expect(call?.body).toEqual({
      severity: 'high',
      title: 'spike',
      data: { p99_ms: 2400 },
      run_id: 'run_1',
    });
    expect(call?.headers.get('Idempotency-Key')).toMatch(/^[A-Za-z0-9_-]+/);
  });

  it('reports health via invariance_doctor', async () => {
    const result = contentJson(
      await client.callTool({ name: 'invariance_doctor', arguments: {} }),
    ) as { checks: { name: string; status: string }[]; summary: { pass: number; fail: number; warn: number } };
    expect(result.checks.length).toBeGreaterThan(0);
    expect(result.summary.fail).toBe(0);
    expect(result.checks.some((c) => c.name.startsWith('API'))).toBe(true);
  });

  it('returns the authenticated agent via invariance_agent_me', async () => {
    const result = contentJson(
      await client.callTool({ name: 'invariance_agent_me', arguments: {} }),
    ) as { agent?: { id?: string } };
    expect(result.agent?.id).toBe('agent_1');
  });

  it('creates an agent via invariance_agent_create', async () => {
    const result = contentJson(
      await client.callTool({
        name: 'invariance_agent_create',
        arguments: { name: 'new-bot', project_id: 'p1' },
      }),
    ) as { agent: { id: string; name: string; project_id: string } };
    expect(result.agent.id).toBe('agent_new');
    expect(result.agent.name).toBe('new-bot');
    const call = requests.find((r) => r.method === 'POST' && r.path === '/v1/agents');
    expect(call?.body).toEqual({ name: 'new-bot', project_id: 'p1' });
  });

  it('lists agents via invariance_agent_list with project_id', async () => {
    const result = contentJson(
      await client.callTool({
        name: 'invariance_agent_list',
        arguments: { project_id: 'p1' },
      }),
    ) as { data: Array<{ id: string }> };
    expect(result.data.length).toBe(1);
    const call = requests.find(
      (r) => r.method === 'GET' && r.path.startsWith('/v1/agents?'),
    );
    expect(call?.path).toContain('project_id=p1');
  });

  it('fetches a single agent via invariance_agent_get', async () => {
    const result = contentJson(
      await client.callTool({
        name: 'invariance_agent_get',
        arguments: { id: 'agent_1' },
      }),
    ) as { id: string };
    expect(result.id).toBe('agent_1');
  });

  it('finishes a run via invariance_run_finish', async () => {
    const result = contentJson(
      await client.callTool({
        name: 'invariance_run_finish',
        arguments: { id: 'run_1' },
      }),
    ) as { status: string };
    expect(result.status).toBe('completed');
    const patch = requests.find((r) => r.method === 'PATCH' && r.path === '/v1/runs/run_1');
    expect(patch?.body).toEqual({ status: 'completed' });
  });

  it('returns structured tool errors for bad JSON arguments', async () => {
    const result = await client.callTool({
      name: 'invariance_node_write',
      arguments: { run_id: 'run_1', action_type: 'tool_call', input: '{bad-json' },
    });
    expect(result.isError).toBe(true);
    expect(contentText(result)).toContain('Invalid JSON in "input"');
    expect(requests.some((r) => r.path === '/v1/nodes')).toBe(false);
  });

  it('surfaces API errors as MCP tool errors', async () => {
    const result = await client.callTool({
      name: 'invariance_run_get',
      arguments: { id: 'missing' },
    });
    expect(result.isError).toBe(true);
    expect(contentText(result)).toContain('Run missing not found');
  });

  it('creates a KB page via invariance_kb_page_create', async () => {
    const result = contentJson(
      await client.callTool({
        name: 'invariance_kb_page_create',
        arguments: { path: 'notes/x', title: 'X', body: '# X', kind: 'note' },
      }),
    ) as { id: string; title: string; kind: string };
    expect(result).toMatchObject({ id: 'page_1', title: 'X', kind: 'note' });
    const call = requests.find((r) => r.method === 'POST' && r.path === '/v1/kb/pages');
    expect(call?.body).toEqual({ path: 'notes/x', title: 'X', body: '# X', kind: 'note' });
  });

  it('appends a message to a KB session, parsing block JSON', async () => {
    const result = contentJson(
      await client.callTool({
        name: 'invariance_kb_session_append_message',
        arguments: {
          id: 'sess_1',
          role: 'user',
          content: '[{"type":"text","text":"hello"}]',
        },
      }),
    ) as { id: string };
    expect(result.id).toBe('msg_2');
    const call = requests.find(
      (r) => r.method === 'POST' && r.path === '/v1/kb/sessions/sess_1/messages',
    );
    expect(call?.body).toEqual({
      role: 'user',
      content: [{ type: 'text', text: 'hello' }],
    });
  });

  it('deletes a KB page', async () => {
    const result = contentJson(
      await client.callTool({
        name: 'invariance_kb_page_delete',
        arguments: { id: 'page_1' },
      }),
    ) as { id: string; deleted: boolean };
    expect(result).toEqual({ id: 'page_1', deleted: true });
    expect(
      requests.some((r) => r.method === 'DELETE' && r.path === '/v1/kb/pages/page_1'),
    ).toBe(true);
  });

  it('fetches the operational graph for a run', async () => {
    const result = contentJson(
      await client.callTool({
        name: 'invariance_run_operational_graph',
        arguments: { run_id: 'run_1' },
      }),
    ) as { run_id: string; nodes: unknown[]; edges: unknown[] };
    expect(result.run_id).toBe('run_1');
    expect(result.nodes).toHaveLength(1);
    expect(
      requests.some(
        (r) => r.method === 'GET' && r.path === '/v1/runs/run_1/operational-graph',
      ),
    ).toBe(true);
  });

  it('lists llm calls for a run with pagination args', async () => {
    const result = contentJson(
      await client.callTool({
        name: 'invariance_run_llm_calls',
        arguments: { run_id: 'run_1', limit: 25 },
      }),
    ) as { data: unknown[] };
    expect(result.data.length).toBe(1);
    const call = requests.find(
      (r) => r.method === 'GET' && r.path.startsWith('/v1/runs/run_1/llm-calls'),
    );
    expect(call?.path).toContain('limit=25');
  });

  it('fetches node-type aggregate and per-type metrics', async () => {
    const types = contentJson(
      await client.callTool({
        name: 'invariance_run_node_types',
        arguments: { run_id: 'run_1' },
      }),
    ) as { data: Array<{ type: string }> };
    expect(types.data[0]?.type).toBe('tool_call');

    const metrics = contentJson(
      await client.callTool({
        name: 'invariance_run_node_type_metrics',
        arguments: { run_id: 'run_1', type: 'tool_call' },
      }),
    ) as { metrics: { type: string } };
    expect(metrics.metrics.type).toBe('tool_call');
  });

  it('forks a run', async () => {
    const result = contentJson(
      await client.callTool({
        name: 'invariance_run_fork',
        arguments: { id: 'run_1', from_node_id: 'node_1', name: 'fork-test' },
      }),
    ) as { id: string; name: string };
    expect(result.id).toBe('run_2');
    expect(result.name).toBe('fork-test');
    const call = requests.find(
      (r) => r.method === 'POST' && r.path === '/v1/runs/run_1/fork',
    );
    expect(call?.body).toEqual({ from_node_id: 'node_1', name: 'fork-test' });
  });

  it('fetches cross-run metrics overview and agent usage', async () => {
    const overview = contentJson(
      await client.callTool({
        name: 'invariance_metrics_overview',
        arguments: { window_hours: 6 },
      }),
    ) as { metrics: { window_hours: number } };
    expect(overview.metrics.window_hours).toBe(24);
    const overviewCall = requests.find((r) => r.path.startsWith('/v1/metrics/overview'));
    expect(overviewCall?.path).toContain('window_hours=6');

    const agents = contentJson(
      await client.callTool({
        name: 'invariance_metrics_agents',
        arguments: {},
      }),
    ) as { usage: unknown[] };
    expect(agents.usage.length).toBe(1);
  });

  it('returns a composite triage view via invariance_run_inspect', async () => {
    const result = contentJson(
      await client.callTool({
        name: 'invariance_run_inspect',
        arguments: { id: 'run_1', limit: 10 },
      }),
    ) as {
      run: { id?: string } | null;
      metrics: { metrics?: unknown } | null;
      narrative: { summary?: string } | null;
      recent_nodes: unknown[];
      open_findings: Array<{ id: string }>;
    };
    expect(result.run?.id).toBe('run_1');
    expect(result.narrative?.summary).toBe('all good');
    expect(result.recent_nodes.length).toBe(1);
    // open_findings filters to status=open AND run_id=run_1
    expect(result.open_findings.map((f) => f.id)).toEqual(['find_1']);
  });

  it('records a memory read via invariance_memory_read', async () => {
    const result = contentJson(
      await client.callTool({
        name: 'invariance_memory_read',
        arguments: {
          run_id: 'run_1',
          node_id: 'node_1',
          subject_type: 'customer',
          subject_id: 'cust_42',
          key: 'preferred_contact_channel',
          used_for: 'select-channel',
        },
      }),
    ) as { access: { access_type: string }; record: { id: string } | null };
    expect(result.access.access_type).toBe('read');
    expect(result.record?.id).toBe('mem_1');
    const call = requests.find(
      (r) => r.method === 'POST' && r.path === '/v1/memory/read',
    );
    expect(call?.body).toEqual({
      run_id: 'run_1',
      node_id: 'node_1',
      subject_type: 'customer',
      subject_id: 'cust_42',
      key: 'preferred_contact_channel',
      used_for: 'select-channel',
    });
  });

  it('records a memory write with default source/confidence', async () => {
    const result = contentJson(
      await client.callTool({
        name: 'invariance_memory_write',
        arguments: {
          run_id: 'run_1',
          node_id: 'node_1',
          subject_type: 'customer',
          subject_id: 'cust_42',
          key: 'preferred_contact_channel',
          value: '"email"',
          used_for: 'remember',
        },
      }),
    ) as { record: { source: string; confidence: number; value: unknown } };
    expect(result.record.source).toBe('agent_write');
    expect(result.record.confidence).toBe(1.0);
    expect(result.record.value).toBe('email');
    const call = requests.find(
      (r) => r.method === 'POST' && r.path === '/v1/memory/write',
    );
    expect(call?.body).toMatchObject({
      subject_type: 'customer',
      subject_id: 'cust_42',
      key: 'preferred_contact_channel',
      value: 'email',
      source: 'agent_write',
      confidence: 1.0,
    });
  });

  it('returns operator identity via invariance_operator_me', async () => {
    const result = contentJson(
      await client.callTool({ name: 'invariance_operator_me', arguments: {} }),
    ) as { operator?: { id?: string; operator_type?: string } };
    expect(result.operator?.id).toBe('op_1');
    expect(result.operator?.operator_type).toBe('agent');
  });

  it('creates an operator with operator_type', async () => {
    const result = contentJson(
      await client.callTool({
        name: 'invariance_operator_create',
        arguments: { name: 'alice', project_id: 'p1', operator_type: 'human' },
      }),
    ) as { operator: { id: string; operator_type: string } };
    expect(result.operator.id).toBe('op_new');
    expect(result.operator.operator_type).toBe('human');
    const call = requests.find((r) => r.method === 'POST' && r.path === '/v1/operators');
    expect(call?.body).toEqual({ name: 'alice', project_id: 'p1', operator_type: 'human' });
  });

  it('lists operators filtered by operator_type', async () => {
    const result = contentJson(
      await client.callTool({
        name: 'invariance_operator_list',
        arguments: { project_id: 'p1', operator_type: 'agent' },
      }),
    ) as { data: Array<{ id: string }> };
    expect(result.data.length).toBe(1);
    const call = requests.find(
      (r) => r.method === 'GET' && r.path.startsWith('/v1/operators?'),
    );
    expect(call?.path).toContain('project_id=p1');
    expect(call?.path).toContain('operator_type=agent');
  });

  it('fetches a single operator via invariance_operator_get', async () => {
    const result = contentJson(
      await client.callTool({
        name: 'invariance_operator_get',
        arguments: { id: 'op_1' },
      }),
    ) as { id: string };
    expect(result.id).toBe('op_1');
  });

  it('creates an agent-session for a Claude Code task', async () => {
    const result = contentJson(
      await client.callTool({
        name: 'invariance_session_create',
        arguments: {
          source: 'api',
          external_session_id: 'ext_1',
          session_type: 'claude_code',
          title: 'ship feature X',
          agent_id: 'agent_1',
          metadata: '{"branch":"feat/x"}',
        },
      }),
    ) as { id: string; source: string; metadata: { branch: string } };
    expect(result.id).toBe('sess_new');
    expect(result.source).toBe('api');
    const call = requests.find(
      (r) => r.method === 'POST' && r.path === '/v1/agent-sessions',
    );
    expect(call?.body).toEqual({
      source: 'api',
      external_session_id: 'ext_1',
      session_type: 'claude_code',
      title: 'ship feature X',
      agent_id: 'agent_1',
      metadata: { branch: 'feat/x' },
    });
  });

  it('lists agent-sessions filtered by source', async () => {
    const result = contentJson(
      await client.callTool({
        name: 'invariance_session_list',
        arguments: { source: 'meeting', status: 'open' },
      }),
    ) as { data: unknown[] };
    expect(result.data.length).toBe(1);
    const call = requests.find(
      (r) => r.method === 'GET' && r.path.startsWith('/v1/agent-sessions?'),
    );
    expect(call?.path).toContain('source=meeting');
    expect(call?.path).toContain('status=open');
  });

  it('gets a single agent-session', async () => {
    const result = contentJson(
      await client.callTool({
        name: 'invariance_session_get',
        arguments: { id: 'sess_new' },
      }),
    ) as { id: string };
    expect(result.id).toBe('sess_new');
  });

  it('appends a note as a custom event', async () => {
    const result = contentJson(
      await client.callTool({
        name: 'invariance_session_append_note',
        arguments: { session_id: 'sess_new', text: 'trying approach X' },
      }),
    ) as { session_id: string; type: string; payload: { text: string } };
    expect(result.type).toBe('note');
    expect(result.payload.text).toBe('trying approach X');
    const call = requests.find(
      (r) =>
        r.method === 'POST' && r.path === '/v1/agent-sessions/sess_new/events',
    );
    expect(call?.body).toEqual({ type: 'note', payload: { text: 'trying approach X' } });
  });

  it('attaches a run to a session via PATCH', async () => {
    const result = contentJson(
      await client.callTool({
        name: 'invariance_session_attach_run',
        arguments: { session_id: 'sess_new', run_id: 'run_1' },
      }),
    ) as { id: string; run_id: string };
    expect(result.id).toBe('sess_new');
    expect(result.run_id).toBe('run_1');
    const call = requests.find(
      (r) => r.method === 'PATCH' && r.path === '/v1/agent-sessions/sess_new',
    );
    expect(call?.body).toEqual({ run_id: 'run_1' });
  });

  it('records a session summary to the KB', async () => {
    const result = contentJson(
      await client.callTool({
        name: 'invariance_session_record_summary_to_kb',
        arguments: {
          session_id: 'sess_new',
          title: 'Summary',
          body: '# done',
        },
      }),
    ) as { id: string; title: string; kind: string };
    expect(result).toMatchObject({ id: 'page_1', title: 'Summary', kind: 'session_summary' });
    const call = requests.find((r) => r.method === 'POST' && r.path === '/v1/kb/pages');
    expect(call?.body).toMatchObject({
      path: 'sessions/sess_new',
      title: 'Summary',
      body: '# done',
      kind: 'session_summary',
      metadata: { session_id: 'sess_new' },
    });
  });

  it('creates a workflow definition with typed fields', async () => {
    const result = contentJson(
      await client.callTool({
        name: 'invariance_workflow_create',
        arguments: {
          key: 'support.escalation',
          display_name: 'Support Escalation',
          expected_fields: '[{"name":"priority","type":"enum","enum":["p0","p1"]}]',
        },
      }),
    ) as { key: string; expected_fields: unknown[] };
    expect(result.key).toBe('support.escalation');
    expect(result.expected_fields).toEqual([
      { name: 'priority', type: 'enum', enum: ['p0', 'p1'] },
    ]);
    const call = requests.find(
      (r) => r.method === 'POST' && r.path === '/v1/workflow-definitions',
    );
    expect(call?.body).toEqual({
      key: 'support.escalation',
      display_name: 'Support Escalation',
      expected_fields: [{ name: 'priority', type: 'enum', enum: ['p0', 'p1'] }],
    });
  });

  it('lists workflow events with filters', async () => {
    const result = contentJson(
      await client.callTool({
        name: 'invariance_workflow_event_list',
        arguments: { workflow_key: 'support.escalation', actor_type: 'human', limit: 5 },
      }),
    ) as { data: unknown[] };
    expect(result.data).toHaveLength(1);
    const call = requests.find((r) => r.method === 'GET' && r.path.startsWith('/v1/events?'));
    expect(call?.path).toBe('/v1/events?limit=5&workflow_key=support.escalation&actor_type=human');
  });

  it('creates a case workflow event with parsed evidence refs', async () => {
    const result = contentJson(
      await client.callTool({
        name: 'invariance_case_event_create',
        arguments: {
          id: 'case_1',
          type: 'triage.started',
          actor_type: 'agent',
          payload: '{"priority":"p0"}',
          evidence_refs: '[{"kind":"ticket","id":"T-1"}]',
        },
      }),
    ) as { type: string; payload: unknown; evidence_refs: unknown[] };
    expect(result.type).toBe('triage.started');
    expect(result.payload).toEqual({ priority: 'p0' });
    expect(result.evidence_refs).toEqual([{ kind: 'ticket', id: 'T-1' }]);
    const call = requests.find(
      (r) => r.method === 'POST' && r.path === '/v1/cases/case_1/events',
    );
    expect(call?.body).toEqual({
      type: 'triage.started',
      actor_type: 'agent',
      payload: { priority: 'p0' },
      evidence_refs: [{ kind: 'ticket', id: 'T-1' }],
    });
  });

  it('creates a capture via invariance_capture_create', async () => {
    const result = contentJson(
      await client.callTool({
        name: 'invariance_capture_create',
        arguments: {
          source: 'claude_code',
          session_type: 'chat',
          title: 'feat: add captures',
          metadata: '{"branch":"captures-surfaces"}',
        },
      }),
    ) as { id: string; source: string; session_type: string | null; title: string | null };
    expect(result.id).toBe('cap_1');
    expect(result.source).toBe('claude_code');
    const call = requests.find((r) => r.method === 'POST' && r.path === '/v1/captures');
    expect(call?.body).toEqual({
      source: 'claude_code',
      session_type: 'chat',
      title: 'feat: add captures',
      metadata: { branch: 'captures-surfaces' },
    });
  });

  it('links a capture to a run via invariance_capture_link', async () => {
    const result = contentJson(
      await client.callTool({
        name: 'invariance_capture_link',
        arguments: { id: 'cap_1', run_id: 'run_1' },
      }),
    ) as { id: string; run_id: string | null };
    expect(result.id).toBe('cap_1');
    expect(result.run_id).toBe('run_1');
    const call = requests.find(
      (r) => r.method === 'PATCH' && r.path === '/v1/captures/cap_1',
    );
    expect(call?.body).toEqual({ run_id: 'run_1' });
  });

  it('unlinks a capture from its run via invariance_capture_unlink', async () => {
    await client.callTool({
      name: 'invariance_capture_unlink',
      arguments: { id: 'cap_1' },
    });
    const call = requests.find(
      (r) => r.method === 'PATCH' && r.path === '/v1/captures/cap_1',
    );
    expect(call?.body).toEqual({ run_id: null });
  });

  it('returns run_id from invariance_capture_links', async () => {
    const result = contentJson(
      await client.callTool({
        name: 'invariance_capture_links',
        arguments: { id: 'cap_1' },
      }),
    ) as { run_id: string | null };
    expect(result).toHaveProperty('run_id');
    expect(
      requests.some((r) => r.method === 'GET' && r.path === '/v1/captures/cap_1'),
    ).toBe(true);
  });

  it('keeps legacy tool names working', async () => {
    const result = contentJson(
      await client.callTool({
        name: 'invariance_create_run',
        arguments: { name: 'legacy' },
      }),
    ) as { id: string; name: string };
    expect(result).toMatchObject({ id: 'run_1', name: 'legacy' });
  });
});

describe('config', () => {
  it('throws without API key', () => {
    delete process.env.INVARIANCE_API_KEY;
    expect(() => createServer()).toThrow('INVARIANCE_API_KEY');
  });
});
